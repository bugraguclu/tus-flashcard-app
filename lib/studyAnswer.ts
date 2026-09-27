import { getDB } from './db';
import type { CardState, AppSettings, Grade, StudyCard } from './types';
import type { AnkiCard, DeckConfig } from './models';
import {
    ankiCardToCardState,
    cardStateToAnkiCard,
    makeDefaultCardState,
    localDayNumber,
    nextRolloverMs,
    restoreQueueFromType,
} from './ankiState';
import { ankiCardSeed } from './ankiRandom';
import { memoryStateFromCardData, parseAnkiCardData, updateAnkiCardData } from './fsrsCardData';
import { previewDelaySecondsForGrade } from './filteredDeckOptions';
import { recordedDecayFor } from './fsrsScheduler';
import { withFsrsInputs } from './fsrsCardInputs';
import { loadBalancerForCard, recordLoadBalancedAnswer } from './loadBalancerSession';
import { addDaysLocalYMD, schedulerForSettings, todayLocalYMD } from './scheduler';
import { learningDelayAsDays, learningIntervalWithFuzz, learningStepSecs } from './schedulingIntervals';
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
import { deleteReviewById, logReview, revlogFactorForAnswer } from './reviewLogger';
import { makeStudyCard, resolveSettingsForDeck } from './studyCardRows';

/**
 * Answering and undoing a card, and the per-card actions beside it: suspend, bury, and the card
 * state the reviewer shows. Resetting a card to new lives in resetCards.
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
 * are reverted in the same transaction.
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
    /**
     * Preview answers only: when the card is shown again (epoch ms, with Anki's learning-step
     * fuzz), or null when the answer finished its preview.
     */
    previewDueMs?: number | null;
}

/** The preview delays of the filtered deck a card is answered in (Anki's `preview_*_secs`). */
export interface PreviewAnswerOptions {
    delays: number[] | undefined;
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

/**
 * The revlog row Anki writes for an answer (`RevlogEntryPartial`), apart from the rating and time:
 *  - `type` is the card's state before the answer — learning (new cards included), review, or
 *    relearning; a review answered before its due day, which only a filtered deck allows, is
 *    logged as a filtered review;
 *  - `ivl` is where the answer sent the card: days, or seconds as a negative number for a step
 *    that stays within today;
 *  - `lastIvl` is the same measure of the state the card came from;
 *  - `factor` holds the shifted FSRS difficulty under FSRS, and otherwise the ease factor, which
 *    is 0 while a card is still learning.
 */
function answerRevlogFields(
    before: AnkiCard,
    beforeState: CardState,
    after: AnkiCard,
    afterState: CardState,
    settings: AppSettings,
    today: number,
    secsUntilRollover: number,
    ivl: number,
): { type: 0 | 1 | 2 | 3; ivl: number; lastIvl: number; factor: number } {
    let type: 0 | 1 | 2 | 3 = 0;
    if (before.type === 3) type = 2;
    else if (before.type === 2) type = (before.odid ? before.odue : before.due) > today ? 3 : 1;

    let lastIvl = 0;
    if (before.type === 2) {
        lastIvl = before.ivl;
    } else if (before.type === 1 || before.type === 3) {
        const relearning = before.type === 3;
        const steps = relearning ? settings.lapseSteps : settings.learningSteps;
        const index = relearning ? beforeState.relearningStep : beforeState.learningStep;
        const secs = steps.length > 0 ? learningStepSecs(steps[Math.max(0, Math.min(steps.length - 1, index))]) : 0;
        lastIvl = learningDelayAsDays(secs, secsUntilRollover) ?? -secs;
    }

    const factor = settings.fsrsEnabled
        ? revlogFactorForAnswer(afterState.memoryState, after.factor)
        : (after.type === 1 ? 0 : after.factor);
    return { type, ivl, lastIvl, factor };
}

export function answerStudyCard(
    cardId: number,
    grade: Grade,
    settings: AppSettings,
    answerTimeMs: number,
    options: { preview?: PreviewAnswerOptions } = {},
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
    const rolloverHour = cardSettings.dayRolloverHour;
    const currentState = withFsrsInputs(
        ankiCardToCardState(currentAnkiCard, cardSettings, nowMs),
        currentAnkiCard,
        cardSettings,
        nowMs,
    );
    const noteType = getNoteType(note.noteTypeId);
    const deckConfig = getDeckConfigForDeck(currentAnkiCard.deckId);

    if (options.preview) {
        return answerInPreview(currentAnkiCard, currentState, grade, cardSettings, deckConfig, answerTimeMs, options.preview, nowMs, () => (
            makeStudyCard(getAnkiCard(currentAnkiCard.id) ?? currentAnkiCard, note, noteType, cardSettings, nowMs, true)
        ));
    }

    const scheduler = schedulerForSettings(cardSettings);
    const balancer = loadBalancerForCard(currentAnkiCard, rolloverHour, nowMs);
    const scheduleResult = scheduler.schedule(currentState, grade, cardSettings, nowMs, { balancer });

    const nowSecs = Math.floor(nowMs / 1000);
    const today = localDayNumber(nowMs, rolloverHour);
    const secsUntilRollover = Math.floor(nextRolloverMs(nowMs, rolloverHour) / 1000) - nowSecs;
    // A (re)learning delay that reaches past the next rollover counts in days (Anki's
    // `maybe_as_days`); a shorter one is pushed back by Anki's learning-step fuzz.
    const learningSecs = scheduleResult.isLearning ? Math.round((scheduleResult.minutesUntilDue ?? 0) * 60) : 0;
    const learningDays = scheduleResult.isLearning ? learningDelayAsDays(learningSecs, secsUntilRollover) : null;
    const learningDueMs = scheduleResult.isLearning && learningDays === null
        ? (nowSecs + learningIntervalWithFuzz(ankiCardSeed(currentAnkiCard.id, currentAnkiCard.reps), learningSecs)) * 1000
        : 0;

    const baseDue = scheduleResult.isLearning
        ? {
            status: 'learning' as const,
            dueDate: learningDays === null
                ? todayLocalYMD(new Date(nowMs), rolloverHour)
                : addDaysLocalYMD(learningDays, new Date(nowMs), rolloverHour),
            dueTime: learningDueMs,
        }
        : {
            status: 'review' as const,
            dueDate: addDaysLocalYMD(scheduleResult.interval, new Date(nowMs), rolloverHour),
            dueTime: 0,
        };

    const nextState: CardState = {
        ...currentState,
        ...scheduleResult.stateUpdates,
        // Anki counts every answer, learning steps included.
        repetition: (currentState.repetition || 0) + 1,
        // With FSRS off, an answer leaves no memory state or desired retention behind, as in Anki.
        ...(cardSettings.fsrsEnabled ? null : { memoryState: null, desiredRetention: null }),
        cardId: currentAnkiCard.id,
        ...baseDue,
    };

    const converted = cardStateToAnkiCard(currentAnkiCard, nextState, cardSettings, nowMs);
    const updatedAnkiCard: AnkiCard = {
        ...converted,
        // Anki records the answer time on the card itself (`lrt`), which FSRS reads back, and
        // remembers where a new card sat in the new queue (`pos`) so "Forget" can put it back.
        ankiData: updateAnkiCardData(converted.ankiData, {
            lastReviewTimeSecs: nowSecs,
            ...(currentAnkiCard.type === 0 ? { originalPosition: Math.max(0, currentAnkiCard.due) } : null),
        }),
        // An intraday step stays intraday even when its fuzz carries it past the rollover.
        ...(scheduleResult.isLearning && learningDays === null ? { queue: 1 as const, due: learningDueMs } : null),
    };

    const revlogFields = answerRevlogFields(
        currentAnkiCard,
        currentState,
        updatedAnkiCard,
        nextState,
        cardSettings,
        today,
        secsUntilRollover,
        scheduleResult.isLearning ? (learningDays ?? -learningSecs) : updatedAnkiCard.ivl,
    );

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
            revlogFields.ivl,
            revlogFields.lastIvl,
            revlogFields.factor,
            answerTimeMs,
            revlogFields.type,
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
    recordLoadBalancedAnswer(updatedAnkiCard, rolloverHour, nowMs);

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

/**
 * An answer in a filtered deck with rescheduling off (Anki's `apply_preview_state`). The card's
 * schedule is left alone: no repetition, no review time, no new memory state from the answer.
 * The answer is still logged as a filtered review with an ease of 0, which FSRS and the optimizer
 * skip as cramming. `ivl` is the preview delay and `lastIvl` the deck's Again delay, both as
 * negative seconds or, past the rollover, days. Siblings are buried as for any answer. Easy, or a
 * button whose delay is zero, finishes the preview; any other button brings the card back after
 * its delay plus Anki's learning-step fuzz. Under FSRS, Anki's card updater also stamps the
 * preset's decay on the card and derives a missing memory state, as it does for every answer.
 */
function answerInPreview(
    card: AnkiCard,
    state: CardState,
    grade: Grade,
    settings: AppSettings,
    deckConfig: DeckConfig,
    answerTimeMs: number,
    preview: PreviewAnswerOptions,
    nowMs: number,
    studyCard: () => StudyCard,
): ReviewResult {
    const nowSecs = Math.floor(nowMs / 1000);
    const secsUntilRollover = Math.floor(nextRolloverMs(nowMs, settings.dayRolloverHour) / 1000) - nowSecs;
    const asRevlogInterval = (secs: number) => learningDelayAsDays(secs, secsUntilRollover) ?? (secs === 0 ? 0 : -secs);
    const delay = previewDelaySecondsForGrade(preview.delays, grade);

    let updated = card;
    if (settings.fsrsEnabled) {
        const hasMemory = memoryStateFromCardData(parseAnkiCardData(card.ankiData)) !== null;
        const derived = !hasMemory && state.memoryState ? state.memoryState : null;
        updated = {
            ...card,
            ankiData: updateAnkiCardData(card.ankiData, {
                decay: recordedDecayFor(settings),
                ...(derived ? { stability: derived.stability, difficulty: derived.difficulty } : null),
            }),
            mod: nowSecs,
            usn: -1,
        };
    }

    const db = getDB();
    let reviewLogId = 0;
    const sideEffects: AnswerSideEffects = { buriedSiblings: [] };
    db.execSync('BEGIN TRANSACTION;');
    try {
        if (updated !== card) saveAnkiCard(updated);
        reviewLogId = logReview(
            updated,
            grade,
            asRevlogInterval(delay),
            asRevlogInterval(previewDelaySecondsForGrade(preview.delays, 1)),
            0,
            answerTimeMs,
            3,
            deckConfig.maxAnswerSecs,
        ).id;
        sideEffects.buriedSiblings = applySiblingBuryPolicy(card, deckConfig);
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return {
        updatedCard: studyCard(),
        previousAnkiCard: card,
        wasNewCard: false,
        reviewLogId,
        sideEffects,
        previewDueMs: delay === 0
            ? null
            : (nowSecs + learningIntervalWithFuzz(ankiCardSeed(card.id, card.reps), delay)) * 1000,
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

export function getCardState(cardId: number, settings: AppSettings): CardState {
    const card = getAnkiCard(cardId);
    if (!card) {
        return makeDefaultCardState(cardId, settings);
    }

    const cardSettings = resolveSettingsForDeck(card.deckId, settings);
    return ankiCardToCardState(card, cardSettings, Date.now());
}
