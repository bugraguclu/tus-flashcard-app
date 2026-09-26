import { getDB } from './db';
import type { CardState, AppSettings, Grade, StudyCard } from './types';
import type { AnkiCard, DeckConfig, ReviewLog } from './models';
import {
    ankiCardToCardState,
    cardStateToAnkiCard,
    makeDefaultCardState,
    localDayNumber,
    restoreQueueFromType,
} from './ankiState';
import { addDaysLocalYMD, schedulerForSettings, todayLocalYMD } from './scheduler';
import { constrainedFuzzBounds } from './schedulingIntervals';
import {
    buryCard,
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    handleLeech,
    isLeech,
    saveAnkiCard,
    saveNote,
} from './noteManager';
import { getDeckConfigForDeck } from './deckManager';
import { deleteReviewById, logReview, logManualEntry } from './reviewLogger';
import { makeStudyCard, resolveSettingsForDeck } from './studyCardRows';

/**
 * Answering and undoing a card, and the per-card actions beside it: suspend, bury, forget,
 * and the card state the reviewer shows.
 */

/** A sibling the bury policy pulled out of today's queue, with the queue it came from. */
export interface BuriedSiblingSnapshot {
    cardId: number;
    queue: AnkiCard['queue'];
}

/**
 * Everything an answer changed outside the answered card and its review-log row.
 *
 * Anki treats answering as a single undoable operation ("Undo Answer Card") that also takes back
 * the sibling burying and the leech action, so these captures travel with the card snapshot and
 * are reverted in the same transaction. Empty for a preview answer, which writes nothing.
 */
export interface AnswerSideEffects {
    buriedSiblings: BuriedSiblingSnapshot[];
    /** Set only when this answer appended the tag; a note tagged by an earlier lapse keeps it. */
    leechTaggedNoteId?: number;
}

export interface ReviewResult {
    updatedCard: StudyCard;
    previousAnkiCard: AnkiCard;
    wasNewCard: boolean;
    reviewLogId: number;
    sideEffects: AnswerSideEffects;
}

/**
 * Anki's "easy days": shift a review interval so the due date avoids reduced/blocked
 * weekdays. Factor 0 always moves off the day; factor 0.5 moves half the cards off it
 * (deterministic by card id). Searches outward (+1, -1, +2, …) for the nearest allowed day.
 *
 * The shift is bounded by the card's own fuzz window. Upstream implements easy days inside the
 * load balancer, which only ever picks a different day *within* `constrained_fuzz_bounds` — the
 * same window plain fuzz draws from — so a preference for a weekday can rearrange due dates but
 * can never produce an interval the scheduler would not have produced anyway. Applying the shift
 * without that bound is what used to let a blocked weekday push a card outside anything Anki
 * would write. Intervals under 2.5 days have no fuzz window at all (the window collapses to the
 * interval itself), so they are never moved, and when no day inside the window is allowed the
 * interval is left where the scheduler put it rather than moved outside.
 *
 * Reference: `rslib/src/scheduler/answering/load_balancer.rs` and
 * `rslib/src/scheduler/states/fuzz.rs` (`constrained_fuzz_bounds`).
 */
export function adjustIntervalForEasyDays(
    intervalDays: number,
    cardId: number,
    easyDays: number[] | undefined,
    nowMs: number,
    rolloverHour: number,
    maximumInterval: number = 36500,
): number {
    if (!Array.isArray(easyDays) || easyDays.length !== 7) return intervalDays;
    if (easyDays.every((factor) => factor >= 1)) return intervalDays;
    if (intervalDays < 1) return intervalDays;

    const today = localDayNumber(nowMs, rolloverHour);
    const mondayIndexOf = (dayNumber: number) => (new Date(dayNumber * 86400000).getUTCDay() + 6) % 7;

    const factorFor = (interval: number) => easyDays[mondayIndexOf(today + interval)] ?? 1;

    const factor = factorFor(intervalDays);
    if (factor >= 1) return intervalDays;
    if (factor > 0 && cardId % 2 === 0) return intervalDays; // "reduced": let half stay

    // The window is derived from the interval the card actually got. Upstream derives it from the
    // pre-fuzz interval, but the fuzzed value always lies inside that window, so the two windows
    // differ by at most the rounding of their own centre — and either way the shift stays inside
    // the band of intervals the scheduler considers interchangeable.
    const { lower, upper } = constrainedFuzzBounds(intervalDays, 1, Math.max(1, maximumInterval));

    for (let offset = 1; offset <= upper - lower; offset++) {
        for (const candidate of [intervalDays + offset, intervalDays - offset]) {
            if (candidate < lower || candidate > upper) continue;
            if (factorFor(candidate) >= 1) return candidate;
        }
    }
    return intervalDays; // no allowed day inside the fuzz window — leave the interval alone
}

/** Bury the answered card's siblings per deck config, reporting the queue each one came from. */
function applySiblingBuryPolicy(answeredCard: AnkiCard, config: DeckConfig): BuriedSiblingSnapshot[] {
    const siblings = getCardsForNote(answeredCard.noteId);
    const buried: BuriedSiblingSnapshot[] = [];

    const bury = (sibling: AnkiCard) => {
        buryCard(sibling.id, true);
        buried.push({ cardId: sibling.id, queue: sibling.queue });
    };

    for (const sibling of siblings) {
        if (sibling.id === answeredCard.id || sibling.queue < 0) {
            continue;
        }

        if (sibling.queue === 0 && config.buryNewSiblings) {
            bury(sibling);
            continue;
        }

        if (sibling.queue === 2 && config.buryReviewSiblings) {
            bury(sibling);
            continue;
        }

        // Anki bury-interday-learning applies to day-learning queue (3), not intraday queue (1).
        if (sibling.queue === 3 && config.buryInterdayLearningSiblings) {
            bury(sibling);
        }
    }

    return buried;
}

/** Tag `handleLeech` appends to a note. Mirrors the literal in noteManager's leech handler. */
const LEECH_TAG = 'leech';

/**
 * Take back the burying `applySiblingBuryPolicy` performed.
 *
 * A sibling is only restored while it still carries the scheduler bury (-2) this answer gave it;
 * anything that moved it on since (a manual bury, a suspend, the rollover unbury) is newer than
 * the answer being undone and must survive. The `mod`/`usn` stamp follows every other write in
 * this file: reverting is still a local change, so the row stays marked for the next sync.
 */
function restoreBuriedSiblings(buriedSiblings: BuriedSiblingSnapshot[]): void {
    const nowSec = Math.floor(Date.now() / 1000);

    for (const buried of buriedSiblings) {
        const sibling = getAnkiCard(buried.cardId);
        if (!sibling || sibling.queue !== -2) continue;
        saveAnkiCard({ ...sibling, queue: buried.queue, mod: nowSec, usn: -1 });
    }
}

/**
 * Remove the `leech` tag this answer added. The caller records the note id only when the tag was
 * absent beforehand, so a note tagged by an earlier lapse keeps it. Other tag edits made since
 * (a mark, a manual tag) are preserved because the note is re-read rather than overwritten.
 */
function removeAddedLeechTag(noteId: number): void {
    const note = getNote(noteId);
    if (!note || !note.tags.includes(LEECH_TAG)) return;

    saveNote({
        ...note,
        tags: note.tags.filter((tag) => tag !== LEECH_TAG),
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    });
}

/**
 * Reverse one answer completely: the card row, its review-log entry, and every row the answer
 * touched on the side (buried siblings, an added leech tag). Anki's "Undo Answer Card" is a
 * single operation, so all of it commits or none of it does.
 */
export function undoAnswer(snapshot: AnkiCard, reviewLogId: number, sideEffects?: AnswerSideEffects): void {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');

    try {
        // Restoring the snapshot already un-suspends a card the leech action suspended, because
        // the snapshot carries the queue the card had before this answer.
        saveAnkiCard(snapshot);
        deleteReviewById(reviewLogId);
        restoreBuriedSiblings(sideEffects?.buriedSiblings ?? []);
        if (sideEffects?.leechTaggedNoteId !== undefined) {
            removeAddedLeechTag(sideEffects.leechTaggedNoteId);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export function answerStudyCard(
    cardId: number,
    grade: Grade,
    settings: AppSettings,
    answerTimeMs: number,
    options: { preview?: boolean } = {},
): ReviewResult {
    const nowMs = Date.now();

    const currentAnkiCard = getAnkiCard(cardId);
    if (!currentAnkiCard) {
        throw new Error(`Card not found: ${cardId}`);
    }

    const note = getNote(currentAnkiCard.noteId);
    if (!note) {
        throw new Error(`Note not found for card: ${cardId}`);
    }

    const cardSettings = resolveSettingsForDeck(currentAnkiCard.deckId, settings);
    const currentState = ankiCardToCardState(currentAnkiCard, cardSettings, nowMs);
    const noteType = getNoteType(note.noteTypeId);
    const deckConfig = getDeckConfigForDeck(currentAnkiCard.deckId);

    // Preview mode (filtered deck with "reschedule" off): show the card, change nothing —
    // no card mutation, no revlog row, nothing to undo. Mirrors Anki's preview behavior.
    if (options.preview) {
        return {
            updatedCard: makeStudyCard(currentAnkiCard, note, noteType, cardSettings, nowMs, true),
            previousAnkiCard: { ...currentAnkiCard },
            wasNewCard: false,
            reviewLogId: 0,
            sideEffects: { buriedSiblings: [] },
        };
    }

    const scheduler = schedulerForSettings(cardSettings);
    const scheduleResult = scheduler.schedule(currentState, grade, cardSettings, nowMs);

    // Easy days: nudge the review interval so the due date lands on an allowed weekday.
    const scheduledInterval = scheduleResult.isLearning
        ? scheduleResult.interval
        : adjustIntervalForEasyDays(
            scheduleResult.interval,
            currentAnkiCard.id,
            cardSettings.easyDays,
            nowMs,
            cardSettings.dayRolloverHour,
            cardSettings.maxInterval,
        );

    const baseDue = scheduleResult.isLearning
        ? {
            status: 'learning' as const,
            dueDate: todayLocalYMD(new Date(nowMs), cardSettings.dayRolloverHour),
            dueTime: scheduleResult.minutesUntilDue
                ? nowMs + scheduleResult.minutesUntilDue * 60000
                : nowMs + 60000,
        }
        : {
            status: 'review' as const,
            dueDate: addDaysLocalYMD(scheduledInterval, new Date(nowMs), cardSettings.dayRolloverHour),
            dueTime: 0,
        };

    const nextState: CardState = {
        ...currentState,
        ...scheduleResult.stateUpdates,
        ...(scheduleResult.isLearning ? null : { interval: scheduledInterval }),
        cardId: currentAnkiCard.id,
        ...baseDue,
    };

    const updatedAnkiCard = cardStateToAnkiCard(currentAnkiCard, nextState, cardSettings, nowMs);

    const reviewType: 0 | 1 | 2 = currentAnkiCard.type === 2 ? 1 : currentAnkiCard.type === 3 ? 2 : 0;
    // Revlog interval (Anki: positive = days, negative = seconds). The three queues encode `due`
    // differently, so each needs its own conversion.
    let revlogInterval: number;
    if (updatedAnkiCard.queue === 2) {
        revlogInterval = updatedAnkiCard.ivl;                    // review: interval already in days
    } else if (updatedAnkiCard.queue === 3) {
        // interday learning: `due` is a day number, not a timestamp -> log the delay in seconds.
        const daysUntilDue = Math.max(1, updatedAnkiCard.due - localDayNumber(nowMs, cardSettings.dayRolloverHour));
        revlogInterval = -daysUntilDue * 86400;
    } else {
        // intraday learning: `due` is a ms timestamp.
        revlogInterval = -Math.max(1, Math.round((updatedAnkiCard.due - nowMs) / 1000));
    }

    const db = getDB();
    let reviewLogId = 0;
    // Rows this answer changes besides the card and its revlog entry. Filled inside the
    // transaction so an undo can put every one of them back exactly.
    const sideEffects: AnswerSideEffects = { buriedSiblings: [] };

    db.execSync('BEGIN TRANSACTION;');
    try {
        saveAnkiCard(updatedAnkiCard);

        const reviewLog = logReview(
            updatedAnkiCard,
            grade,
            revlogInterval,
            currentAnkiCard.ivl,
            updatedAnkiCard.factor,
            answerTimeMs,
            reviewType,
            deckConfig.maxAnswerSecs,
        );
        reviewLogId = reviewLog.id;

        sideEffects.buriedSiblings = applySiblingBuryPolicy(currentAnkiCard, deckConfig);

        // Anki evaluates leech only when the answer itself caused a lapse (rslib review.rs
        // `answer_again` sets `leeched`); checking on every answer would keep re-suspending an
        // unsuspended leech that still sits on a threshold multiple.
        if (updatedAnkiCard.lapses > currentAnkiCard.lapses && isLeech(updatedAnkiCard, deckConfig.leechThreshold)) {
            // `note` was read before any write in this transaction, so its tags are the
            // pre-answer set: record the note only when this answer is what adds the tag.
            const addsLeechTag = !note.tags.includes(LEECH_TAG);
            handleLeech(updatedAnkiCard, deckConfig.leechAction);
            if (addsLeechTag) {
                sideEffects.leechTaggedNoteId = note.id;
            }
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    const updatedStudyCard = makeStudyCard(
        updatedAnkiCard,
        note,
        noteType,
        cardSettings,
        nowMs,
        true,
        nextState,
    );

    return {
        updatedCard: updatedStudyCard,
        previousAnkiCard: currentAnkiCard,
        wasNewCard: currentState.status === 'new',
        reviewLogId,
        sideEffects,
    };
}

export function setCardSuspended(cardId: number, suspended: boolean, rolloverHour: number = 4): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    saveAnkiCard({
        ...card,
        queue: suspended ? -1 : restoreQueueFromType(card, rolloverHour),
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    });
}

export function setCardBuried(cardId: number, buried: boolean, rolloverHour: number = 4): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    // Anki refuses to bury a suspended card, because a bury expires at the next rollover and
    // would therefore quietly bring the card back — see the "do not bury suspended cards as
    // that would unsuspend them" branch of rslib's bury_or_suspend_cards. Unburying is the
    // mirror image: only a card that is actually buried goes back into its queue.
    if (buried ? card.queue === -1 : card.queue !== -2 && card.queue !== -3) return;

    saveAnkiCard({
        ...card,
        // Manual bury from the UI = user-buried (-3) in Anki.
        queue: buried ? -3 : restoreQueueFromType(card, rolloverHour),
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    });
}

/**
 * Position a card returned to the new queue takes: the end of that queue, as in Anki.
 *
 * `due` means something different for every card type — for a new card it is the queue position,
 * so a review card's day number cannot simply be left in place when the card becomes new again.
 */
export function nextNewCardPosition(excludedCardId?: number): number {
    const row = getDB().getFirstSync<{ maxDue: number | null }>(
        `SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0${excludedCardId === undefined ? '' : ' AND id != ?'}`,
        ...(excludedCardId === undefined ? [] : [excludedCardId]),
    );
    return Math.max(0, Math.floor(row?.maxDue ?? 0)) + 1;
}

/** Anki's "Forget": discards all scheduling progress and returns the card to brand-new. */
export function forgetCard(cardId: number, settings: AppSettings): ReviewLog | null {
    const card = getAnkiCard(cardId);
    if (!card) return null;
    const freshState = makeDefaultCardState(cardId, settings);
    saveAnkiCard({
        ...cardStateToAnkiCard(card, freshState, settings),
        // A forgotten card joins the back of the new queue. Without this it would keep the `due`
        // it held as a review card — a day number read as a queue position of ~20 000.
        due: nextNewCardPosition(cardId),
    });
    // The reset marker has to outlive the card's own fields: it is the only thing that tells FSRS
    // to stop replaying the history from before the user forgot the card.
    return logManualEntry(card, 'reset', 0, card.ivl);
}

export function getCardState(cardId: number, settings: AppSettings): CardState {
    const card = getAnkiCard(cardId);
    if (!card) {
        return makeDefaultCardState(cardId, settings);
    }

    const cardSettings = resolveSettingsForDeck(card.deckId, settings);
    return ankiCardToCardState(card, cardSettings, Date.now());
}
