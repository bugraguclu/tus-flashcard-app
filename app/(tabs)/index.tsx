import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, type ViewProps } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spacing, FontSize, Shadows, BorderRadius, useThemeColors, type ColorScheme } from '../../constants/theme';
import { findSubject } from '../../lib/subjects';
import { getScheduler, todayLocalYMD } from '../../lib/scheduler';
import { getTypeAnswerField, renderCardHtml } from '../../lib/templates';
import { nextRolloverMs } from '../../lib/ankiState';
import { getNewCardsIntroducedTodayInDeck, getStudyStreak, getTodayAnswerStats, type StudyStreak } from '../../lib/reviewLogger';
import { resolveSettingsFromConfig } from '../../lib/settingsResolver';
import { saveSettings } from '../../lib/storage';
import { useApp } from './_layout';
import type { Grade, SessionStats, StudyCard } from '../../lib/types';
import { FLAG_COLORS, type AnkiCard, type CardFlag } from '../../lib/models';
import {
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    deleteNote,
    duplicateNote,
    isNoteMarked,
    setCardFlag,
    toggleNoteMark,
} from '../../lib/noteManager';
import { getDeck, getDeckByName, getDeckConfigForDeck } from '../../lib/deckManager';
import CardWebView from '../../components/CardWebView';
import { CardOptionsMenu } from '../../components/CardOptionsMenu';
import {
    answerStudyCard,
    forgetCard,
    getStudyQueue,
    getWaitingLearningCardIds,
    setCardBuried,
    setCardDueInDays,
    setCardSuspended,
    undoAnswer,
} from '../../lib/studyRepository';

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

/** Human label for a stored key binding value (a raw KeyboardEvent.key). */
function formatKeyLabel(key: string): string {
    if (key === ' ') return 'Space';
    if (key.length === 1) return key.toUpperCase();
    return key;
}

// Anki opens on the deck list. Redirect exactly once per app launch, so in-app
// navigation back to "/" (sidebar, deck study links) still reaches the study screen.
let launchRedirectDone = false;

// Study-ahead passes survive the study screen unmounting (hopping to another deck via the
// deck list and back). A pass is consumed by answering its card — never by navigation.
let persistedStudyAheadIds: number[] = [];

type QueueStats = { newCount: number; learningCount: number; reviewCount: number };

type UndoEntry = {
    cardId: number;
    reviewLogId: number;
    previousSnapshot: AnkiCard;
};

/**
 * Today's session numbers, always derived from the review log. The revlog is the durable
 * source of truth, so these survive restarts, OS sleep and multiple tabs — a cached blob
 * (the old approach) silently zeroed on any state loss.
 */
function readTodaySessionStats(rolloverHour: number): SessionStats {
    const today = getTodayAnswerStats(rolloverHour);
    return {
        reviewed: today.reviewed,
        correct: today.passed,
        wrong: today.failed,
        startTime: Date.now(),
        newCardsToday: today.newCardsIntroduced,
        date: todayLocalYMD(undefined, rolloverHour),
    };
}

export default function StudyScreen() {
    const { selectedSubject, selectedTopic, settings, refreshData, bumpDataVersion, dataVersion, setStudyPosition, setActiveDeckName } = useApp();
    const params = useLocalSearchParams();
    const router = useRouter();
    const selectedDeckName = typeof params.deck === 'string' ? params.deck : null;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);

    const [sessionStats, setSessionStats] = useState<SessionStats>({
        reviewed: 0,
        correct: 0,
        wrong: 0,
        startTime: Date.now(),
        newCardsToday: 0,
        date: todayLocalYMD(),
    });
    const [streak, setStreak] = useState<StudyStreak>({ current: 0, studiedToday: false, best: 0 });
    const [queue, setQueue] = useState<StudyCard[]>([]);
    const [currentCard, setCurrentCard] = useState<StudyCard | null>(null);
    const [showingAnswer, setShowingAnswer] = useState(false);
    const [typedAnswer, setTypedAnswer] = useState('');
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextLearningDue, setNextLearningDue] = useState<number | null>(null);
    const [countdown, setCountdown] = useState('');
    const [queueStats, setQueueStats] = useState<QueueStats>({ newCount: 0, learningCount: 0, reviewCount: 0 });
    const [dailyNewLimitReached, setDailyNewLimitReached] = useState(false);
    const [heldBackNewCount, setHeldBackNewCount] = useState(0);
    // One-shot "study ahead" snapshot: card ids captured at button-press time, served
    // regardless of their step timer (Anki's learn-ahead, but user-triggered). Each id is
    // dropped the moment that card is answered, so it can resurface at most once per press.
    // Backed by a module-level copy: switching decks unmounts this screen, and the pass
    // must still be there when the user navigates back.
    const [studyAheadCardIds, setStudyAheadCardIdsState] = useState<number[]>(persistedStudyAheadIds);
    const setStudyAheadCardIds = useCallback((updater: (prev: number[]) => number[]) => {
        setStudyAheadCardIdsState((prev) => {
            const next = updater(prev);
            persistedStudyAheadIds = next;
            return next;
        });
    }, []);
    const [answerStartedAt, setAnswerStartedAt] = useState<number>(Date.now());

    const sessionStatsRef = useRef(sessionStats);
    const currentCardRef = useRef<StudyCard | null>(null);
    const answersSinceRefreshRef = useRef(0);
    const scheduledRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Blocks re-entry while an answer/undo is committing, so a double tap or a
    // held-down grade key cannot rate the same card twice.
    const isMutatingRef = useRef(false);

    useEffect(() => {
        sessionStatsRef.current = sessionStats;
    }, [sessionStats]);

    useEffect(() => {
        currentCardRef.current = currentCard;
    }, [currentCard]);

    // Publish the shown card's course/topic so the sidebar highlight follows the queue
    // card by card; cleared when the queue empties or the screen is left.
    useEffect(() => {
        setStudyPosition(currentCard
            ? { subject: currentCard.subject, topic: currentCard.topic }
            : null);
    }, [currentCard?.cardId, setStudyPosition]);

    useEffect(() => () => setStudyPosition(null), [setStudyPosition]);

    // Anki tracks a "current deck"; deck-aware screens (stats) default to it. Kept after
    // navigating away — only studying in course/topic scope resets it.
    useEffect(() => {
        setActiveDeckName(selectedDeckName);
    }, [selectedDeckName, setActiveDeckName]);

    // Land on the deck list at app start, like Anki. A deck link ("/?deck=X") skips the
    // redirect so studying straight from a cold deep link keeps working.
    useEffect(() => {
        if (launchRedirectDone) return;
        launchRedirectDone = true;
        if (!selectedDeckName) {
            router.replace('/decks' as any);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Anki resolves limits per deck: studying a deck uses that deck's daily limits (plus any
    // "today only" boost), and a filtered / custom-study deck is exempt from daily limits.
    const scopeSettings = useMemo(() => {
        if (!selectedDeckName) return settings;
        const deck = getDeckByName(selectedDeckName);
        if (!deck) return settings;
        if (deck.isFiltered) {
            return { ...settings, dailyNewLimit: 9999, dailyReviewLimit: 9999 };
        }
        return resolveSettingsFromConfig(getDeckConfigForDeck(deck.id, settings.dayRolloverHour), settings);
    }, [selectedDeckName, settings, dataVersion]);

    // Filtered deck with "reschedule" off => Anki preview mode: answers never touch cards.
    const previewMode = useMemo(() => {
        if (!selectedDeckName) return false;
        const deck = getDeckByName(selectedDeckName);
        return Boolean(deck?.isFiltered && deck.reschedule === false);
    }, [selectedDeckName, dataVersion]);

    // Preview leaves the DB untouched, so a rebuilt queue would re-gather every card the
    // user already went through. Track them per session; a scope change starts fresh.
    const previewDoneIdsRef = useRef<Set<number>>(new Set());
    useEffect(() => {
        previewDoneIdsRef.current.clear();
    }, [selectedSubject, selectedTopic, selectedDeckName]);

    const buildQueue = useCallback((
        newCardsStudiedToday?: number,
        resetCounter: boolean = true,
        preserveCurrent: boolean = false,
    ) => {
        if (scheduledRefreshRef.current) {
            clearTimeout(scheduledRefreshRef.current);
            scheduledRefreshRef.current = null;
        }

        // Deck scope charges the deck's own allotment (Anki tracks new intake per deck);
        // other scopes fall back to the day's global introduced-count.
        const studiedToday = selectedDeckName
            ? getNewCardsIntroducedTodayInDeck(selectedDeckName, settings.dayRolloverHour)
            : newCardsStudiedToday ?? sessionStatsRef.current.newCardsToday ?? 0;

        const result = getStudyQueue({
            settings: scopeSettings,
            selectedSubject,
            selectedTopic,
            selectedDeckName,
            newCardsStudiedToday: studiedToday,
            extraLearningCardIds: studyAheadCardIds,
        });

        // A preview session re-gathers untouched cards on every rebuild; drop the ones
        // already answered this session so the queue actually progresses.
        const sessionCards = previewMode
            ? result.cards.filter((card) => !previewDoneIdsRef.current.has(card.cardId))
            : result.cards;

        // Background refreshes must not yank the card the user is looking at (or hide the
        // answer they are reading) — keep it in front and merge the fresh queue behind it.
        const active = preserveCurrent ? currentCardRef.current : null;
        const activeStillQueued = active != null
            && sessionCards.some((card) => card.cardId === active.cardId);

        if (activeStillQueued) {
            setQueue([active, ...sessionCards.filter((card) => card.cardId !== active.cardId)]);
        } else {
            setQueue(sessionCards);
            setCurrentCard(sessionCards.length > 0 ? sessionCards[0] : null);
            setShowingAnswer(false);
        }

        setNextLearningDue(result.nextLearningDue);
        setQueueStats(result.stats);
        setDailyNewLimitReached(result.dailyNewLimitReached);
        setHeldBackNewCount(result.heldBackNewCount);

        if (resetCounter) {
            answersSinceRefreshRef.current = 0;
        }
    }, [settings, scopeSettings, previewMode, selectedSubject, selectedTopic, selectedDeckName, studyAheadCardIds]);

    const scheduleFullRefresh = useCallback((delayMs: number, newCardsStudiedToday?: number) => {
        if (scheduledRefreshRef.current) {
            clearTimeout(scheduledRefreshRef.current);
        }

        scheduledRefreshRef.current = setTimeout(() => {
            buildQueue(newCardsStudiedToday, true, true);
            scheduledRefreshRef.current = null;
        }, delayMs);
    }, [buildQueue]);

    const refreshSessionStats = useCallback(() => {
        try {
            const fresh = readTodaySessionStats(settings.dayRolloverHour);
            sessionStatsRef.current = fresh;
            setSessionStats(fresh);
            setStreak(getStudyStreak(settings.dayRolloverHour));
            return fresh;
        } catch (e) {
            console.warn('[Study] session stats refresh failed:', e);
            return sessionStatsRef.current;
        }
    }, [settings.dayRolloverHour]);

    useEffect(() => {
        refreshSessionStats();
        setLoading(false);
    }, [refreshSessionStats]);

    useEffect(() => {
        if (!loading) {
            buildQueue();
        }
    }, [loading, buildQueue]);

    // Rebuild when data changes elsewhere (card created/edited, import, restore) so a
    // just-created card appears immediately instead of waiting for the fallback timer.
    // preserveCurrent keeps the card being studied in place; answers from this screen
    // bump dataVersion too, which makes this a cheap merge behind the current card.
    const lastDataVersionRef = useRef(dataVersion);
    useEffect(() => {
        if (loading || dataVersion === lastDataVersionRef.current) return;
        lastDataVersionRef.current = dataVersion;
        buildQueue(undefined, false, true);
    }, [dataVersion, loading, buildQueue]);

    useEffect(() => () => {
        if (scheduledRefreshRef.current) {
            clearTimeout(scheduledRefreshRef.current);
            scheduledRefreshRef.current = null;
        }
    }, []);

    // Periodic fallback refresh to keep queue/stat drift bounded. Also re-reads the
    // day's numbers so waking from sleep or crossing the rollover self-corrects.
    useEffect(() => {
        if (loading) return;

        const timer = setInterval(() => {
            refreshSessionStats();
            buildQueue(undefined, false, true);
        }, 45000);

        return () => clearInterval(timer);
    }, [loading, buildQueue, refreshSessionStats]);

    useEffect(() => {
        if (!currentCard) return;
        setAnswerStartedAt(Date.now());
        // A new card always starts on the question side, whichever path swapped it in.
        setShowingAnswer(false);
        setTypedAnswer('');
    }, [currentCard?.cardId]);

    // Rebuild queue when the next learning card becomes due. The newly due card joins the
    // queue behind the card currently being studied, never replacing it mid-answer.
    useEffect(() => {
        if (!nextLearningDue) return;
        const delay = Math.max(500, nextLearningDue - Date.now() + 300);
        const timer = setTimeout(() => buildQueue(undefined, true, true), delay);
        return () => clearTimeout(timer);
    }, [nextLearningDue, buildQueue]);

    // Update countdown for waiting state.
    useEffect(() => {
        if (!nextLearningDue || currentCard) {
            setCountdown('');
            return;
        }

        const update = () => {
            const remaining = Math.max(0, nextLearningDue - Date.now());
            if (remaining <= 0) {
                buildQueue();
                return;
            }
            const totalSec = Math.ceil(remaining / 1000);
            const min = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            setCountdown(min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}sn`);
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [nextLearningDue, currentCard, buildQueue]);

    const statusToQueueBucket = (status: StudyCard['state']['status']): keyof QueueStats => {
        if (status === 'new') return 'newCount';
        if (status === 'learning') return 'learningCount';
        return 'reviewCount';
    };

    const isCardDueNow = (card: StudyCard, nowMs: number): boolean => {
        if (card.state.status === 'learning') {
            return Boolean(card.state.dueTime && card.state.dueTime <= nowMs);
        }

        if (card.state.status === 'review') {
            const today = todayLocalYMD(new Date(nowMs), settings.dayRolloverHour);
            return card.state.dueDate <= today;
        }

        return true;
    };

    const answerCard = useCallback(async (grade: Grade) => {
        if (!currentCard || isMutatingRef.current) return;
        isMutatingRef.current = true;

        try {
            if (Platform.OS !== 'web') {
                try {
                    const Haptics = require('expo-haptics');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch { /* haptics unavailable */ }
            }

            const elapsed = Math.max(0, Date.now() - answerStartedAt);

            let result;
            try {
                result = answerStudyCard(currentCard.cardId, grade, settings, elapsed, { preview: previewMode });
            } catch (e) {
                // The card can vanish under us when the collection is replaced (backup restore,
                // import) while this screen holds a stale queue. Resync instead of crashing;
                // the undo stack refers to the old collection, so it must go too.
                console.warn('[Study] answer failed, rebuilding queue:', e);
                setUndoStack([]);
                setShowingAnswer(false);
                buildQueue();
                return;
            }

            // Preview answers change nothing, so there is nothing to undo (or count).
            if (!previewMode) {
                setUndoStack((prev) => [
                    ...prev.slice(-29),
                    {
                        cardId: currentCard.cardId,
                        reviewLogId: result.reviewLogId,
                        previousSnapshot: result.previousAnkiCard,
                    },
                ]);
            } else if (grade > 1) {
                // "İyi/Zor/Kolay" retires the card from this preview session; "Tekrar" re-queues it.
                previewDoneIdsRef.current.add(currentCard.cardId);
            }

            // The review log row is already committed, so re-reading it gives exact numbers
            // (reviewed / passed / new-introduced) with no drift to hand-maintain.
            const nextStats = refreshSessionStats();

            // Incremental queue update: pop current card, optionally reinsert if still due now.
            const nowMs = Date.now();
            let queueBecameEmpty = false;

            // A study-ahead id is a one-shot pass: once this card has been answered it must
            // earn its way back onto the queue through its own (possibly still-running) timer,
            // not keep resurfacing forever just because it was under the button's window.
            setStudyAheadCardIds((prev) => (
                prev.includes(currentCard.cardId) ? prev.filter((id) => id !== currentCard.cardId) : prev
            ));

            setQueue((prevQueue) => {
                const withoutCurrent = prevQueue.filter((card) => card.cardId !== currentCard.cardId);
                // Preview (Anki): "Tekrar" shows the card again later, anything else leaves the session.
                const shouldReinsert = previewMode
                    ? grade === 1
                    : isCardDueNow(result.updatedCard, nowMs);
                const nextQueue = shouldReinsert ? [...withoutCurrent, result.updatedCard] : withoutCurrent;

                setCurrentCard(nextQueue[0] ?? null);

                const futureLearningDue = nextQueue
                    .filter((card) => card.state.status === 'learning' && card.state.dueTime > nowMs)
                    .map((card) => card.state.dueTime)
                    .filter((value): value is number => Boolean(value));

                if (result.updatedCard.state.status === 'learning' && result.updatedCard.state.dueTime > nowMs) {
                    futureLearningDue.push(result.updatedCard.state.dueTime);
                }

                // Only update nextLearningDue if we found future learning cards in memory.
                // When empty, defer to buildQueue which queries the full DB for any learning cards
                // from earlier answers that are no longer in the in-memory queue.
                if (futureLearningDue.length > 0) {
                    setNextLearningDue(Math.min(...futureLearningDue));
                }

                if (nextQueue.length === 0) {
                    queueBecameEmpty = true;
                }

                return nextQueue;
            });

            setQueueStats((prev) => {
                const next = { ...prev };
                const currentBucket = statusToQueueBucket(currentCard.state.status);
                next[currentBucket] = Math.max(0, next[currentBucket] - 1);

                const updated = result.updatedCard;
                if (updated.state.status === 'learning') {
                    // Learning counts for the whole study day (Anki deck-list semantics):
                    // a card waiting on its 10-minute step is still today's workload, so the
                    // ÖĞRENİYOR counter must grow the moment a new card enters learning.
                    const endOfDay = nextRolloverMs(nowMs, settings.dayRolloverHour);
                    if (updated.state.dueTime === 0 || updated.state.dueTime < endOfDay) {
                        next.learningCount += 1;
                    }
                } else if (isCardDueNow(updated, nowMs)) {
                    next[statusToQueueBucket(updated.state.status)] += 1;
                }

                return next;
            });

            setShowingAnswer(false);
            bumpDataVersion();

            answersSinceRefreshRef.current += 1;
            // Always do a full DB rebuild when the queue empties — the in-memory queue
            // may not contain learning cards from earlier answers that are still waiting.
            if (queueBecameEmpty || answersSinceRefreshRef.current >= 8 || queue.length <= 1) {
                buildQueue(nextStats.newCardsToday);
            } else {
                scheduleFullRefresh(15000, nextStats.newCardsToday);
            }
        } finally {
            isMutatingRef.current = false;
        }
    }, [
        currentCard,
        answerStartedAt,
        settings,
        previewMode,
        buildQueue,
        bumpDataVersion,
        queue.length,
        scheduleFullRefresh,
        refreshSessionStats,
    ]);

    const undoLast = useCallback(async () => {
        // Same re-entrancy guard as answerCard: repeated Ctrl+Z presses would pop two
        // stack entries while actually undoing the same answer twice.
        if (undoStack.length === 0 || isMutatingRef.current) return;
        isMutatingRef.current = true;

        try {
            const undo = undoStack[undoStack.length - 1];

            // If the collection was replaced (backup restore, import) the snapshot belongs to
            // a card that no longer exists — drop the stale stack instead of resurrecting it.
            if (!getAnkiCard(undo.cardId)) {
                console.warn('[Study] undo target missing, clearing stale undo stack.');
                setUndoStack([]);
                buildQueue();
                return;
            }

            setUndoStack((prev) => prev.slice(0, -1));

            undoAnswer(undo.previousSnapshot, undo.reviewLogId);

            // Deleting the revlog row already reverted the day's numbers; re-read them.
            const restoredStats = refreshSessionStats();
            bumpDataVersion();
            buildQueue(restoredStats.newCardsToday);
        } finally {
            isMutatingRef.current = false;
        }
    }, [undoStack, buildQueue, bumpDataVersion, refreshSessionStats]);

    const handleSuspend = useCallback(() => {
        if (!currentCard) return;
        setCardSuspended(currentCard.cardId, true, settings.dayRolloverHour);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, bumpDataVersion, buildQueue]);

    const handleBury = useCallback(() => {
        if (!currentCard) return;
        setCardBuried(currentCard.cardId, true, settings.dayRolloverHour);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, bumpDataVersion, buildQueue]);

    // --- Card options menu (Anki-style) ---

    const handleToggleSuspendCard = useCallback(() => {
        if (!currentCard) return;
        setCardSuspended(currentCard.cardId, !currentCard.state.suspended, settings.dayRolloverHour);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, bumpDataVersion, buildQueue]);

    const handleFlag = useCallback((flag: CardFlag) => {
        if (!currentCard) return;
        setCardFlag(currentCard.cardId, flag);
        bumpDataVersion();
    }, [currentCard, bumpDataVersion]);

    const handleForgetCard = useCallback(() => {
        if (!currentCard) return;
        forgetCard(currentCard.cardId, settings);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings, bumpDataVersion, buildQueue]);

    const handleSetDueDate = useCallback((days: number) => {
        if (!currentCard) return;
        setCardDueInDays(currentCard.cardId, days, settings);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings, bumpDataVersion, buildQueue]);

    const handleCardInfo = useCallback(() => {
        if (!currentCard) return;
        router.push(`/card-info?cardId=${currentCard.cardId}` as any);
    }, [currentCard, router]);

    const handleDeckOptions = useCallback(() => {
        router.push('/settings');
    }, [router]);

    const handleToggleMarkNote = useCallback(() => {
        if (!currentCard) return;
        toggleNoteMark(currentCard.noteId);
        bumpDataVersion();
    }, [currentCard, bumpDataVersion]);

    const handleBuryNote = useCallback(() => {
        if (!currentCard) return;
        for (const card of getCardsForNote(currentCard.noteId)) {
            setCardBuried(card.id, true, settings.dayRolloverHour);
        }
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, bumpDataVersion, buildQueue]);

    const handleSuspendNote = useCallback(() => {
        if (!currentCard) return;
        for (const card of getCardsForNote(currentCard.noteId)) {
            setCardSuspended(card.id, true, settings.dayRolloverHour);
        }
        bumpDataVersion();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, bumpDataVersion, buildQueue]);

    const handleDuplicateNote = useCallback(() => {
        if (!currentCard) return;
        duplicateNote(currentCard.noteId);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, bumpDataVersion, buildQueue]);

    const handleDeleteNote = useCallback(() => {
        if (!currentCard) return;
        deleteNote(currentCard.noteId);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, bumpDataVersion, buildQueue]);

    const handleToggleAutoAdvance = useCallback(() => {
        const next = { ...settings, autoAdvance: !settings.autoAdvance };
        saveSettings(next);
        refreshData();
    }, [settings, refreshData]);

    // Convenience: reveal the answer on its own after a few seconds, if enabled and the
    // user hasn't already revealed it.
    useEffect(() => {
        if (!settings.autoAdvance || !currentCard || showingAnswer) return;
        const timer = setTimeout(() => setShowingAnswer(true), 8000);
        return () => clearTimeout(timer);
    }, [settings.autoAdvance, currentCard?.cardId, showingAnswer]);

    // Snapshot every learning card in this scope still waiting on its step timer, and force
    // just those ids into the queue. A fresh press adds any newly-waiting ids on top of ones
    // already captured (and not yet answered) rather than replacing the list outright.
    const handleStudyAhead = useCallback(() => {
        const waitingIds = getWaitingLearningCardIds({ selectedSubject, selectedTopic, selectedDeckName });
        setStudyAheadCardIds((prev) => Array.from(new Set([...prev, ...waitingIds])));
    }, [selectedSubject, selectedTopic, selectedDeckName]);

    // Keyboard shortcuts are a web-only affordance; React Native's global `window`
    // exists but is not a DOM event target.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;

        const isEditableTarget = (target: EventTarget | null): boolean => {
            if (!(target instanceof HTMLElement)) return false;
            const tag = target.tagName.toLowerCase();
            return tag === 'input' || tag === 'textarea' || target.isContentEditable;
        };

        const { showAnswer, again, hard, good, easy } = settings.keyBindings;
        const gradeForKey = (key: string): Grade | null => {
            if (key === again) return 1;
            if (key === hard) return 2;
            if (key === good) return 3;
            if (key === easy) return 4;
            return null;
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                void undoLast();
                return;
            }

            if (!currentCard) return;

            // Anki: Ctrl/Cmd+1..7 toggles the matching flag on the current card.
            if ((event.ctrlKey || event.metaKey) && event.key >= '1' && event.key <= '7') {
                event.preventDefault();
                const flag = Number(event.key) as CardFlag;
                const active = (getAnkiCard(currentCard.cardId)?.flags ?? 0) as CardFlag;
                handleFlag(active === flag ? 0 : flag);
                return;
            }

            // Anki: R replays the current side's audio.
            if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'r') {
                event.preventDefault();
                setAudioSignal((value) => value + 1);
                return;
            }

            if (event.key === showAnswer) {
                if (!showingAnswer) {
                    event.preventDefault();
                    setShowingAnswer(true);
                }
                return;
            }

            if (!showingAnswer) return;

            const grade = gradeForKey(event.key);
            if (grade !== null) {
                event.preventDefault();
                void answerCard(grade);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [answerCard, currentCard, showingAnswer, undoLast, settings.keyBindings, handleFlag]);

    const getPreview = useCallback(() => {
        if (!currentCard) return null;
        const scheduler = getScheduler(settings.algorithm);
        return scheduler.previewIntervals(currentCard.state, settings);
    }, [currentCard, settings]);

    const renderPayload = useMemo(() => {
        if (!currentCard) return null;
        const card = getAnkiCard(currentCard.cardId);
        if (!card) return null;
        const note = getNote(card.noteId);
        if (!note) return null;
        const noteType = getNoteType(note.noteTypeId);
        if (!noteType) return null;
        const deck = getDeck(card.deckId);
        return { card, note, noteType, deck };
    }, [currentCard?.cardId, dataVersion]);

    const currentNoteMarked = renderPayload ? isNoteMarked(renderPayload.note) : false;
    // renderPayload re-reads the card on every dataVersion bump, so a flag set through the
    // options menu or Ctrl+1-7 shows up here immediately.
    const currentFlag = (renderPayload?.card.flags ?? 0) as CardFlag;

    // Audio: replay button / R key, plus per-deck auto-play when a side is shown.
    const [audioSignal, setAudioSignal] = useState(0);
    const cardHasAudio = useMemo(
        () => (renderPayload ? /\[sound:|<audio\b|<video\b/i.test(renderPayload.note.fields.join(' ')) : false),
        [renderPayload],
    );
    // Whether the back's OWN content (FrontSide excluded) embeds audio/video — decides where
    // a play signal goes once the answer is shown, so the answer's sound is reachable even
    // when the question has one too.
    const answerSideHasAudio = useMemo(() => {
        if (!renderPayload) return false;
        const html = renderCardHtml(renderPayload.noteType, renderPayload.note, renderPayload.card.ord, 'answer', {
            deckName: renderPayload.deck?.name,
            clozeOrd: renderPayload.card.ord + 1,
            omitFrontSide: true,
        });
        return /<audio\b|<video\b/i.test(html);
    }, [renderPayload]);
    const replayAudio = useCallback(() => setAudioSignal((value) => value + 1), []);

    // A stale signal must not leak into the next side/card: without this reset, the answer
    // WebView would mount with a nonzero signal (from an earlier R press) and play unasked.
    useEffect(() => {
        setAudioSignal(0);
    }, [currentCard?.cardId, showingAnswer]);

    useEffect(() => {
        if (!scopeSettings.autoPlayAudio || !cardHasAudio) return;
        // Anki: flipping to the answer auto-plays only the answer side's own sounds.
        if (showingAnswer && !answerSideHasAudio) return;
        // Give the side's media a moment to resolve (web swaps blob URLs in asynchronously).
        const timer = setTimeout(() => setAudioSignal((value) => value + 1), 450);
        return () => clearTimeout(timer);
    }, [currentCard?.cardId, showingAnswer, scopeSettings.autoPlayAudio, cardHasAudio, answerSideHasAudio]);

    // Deck description (Anki shows it on the deck's study screen).
    const deckDescription = useMemo(() => {
        if (!selectedDeckName) return '';
        return getDeckByName(selectedDeckName)?.description?.trim() ?? '';
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDeckName, dataVersion]);

    // Present only for note types whose template embeds {{type:Field}} (id 5/6 built-ins, or a
    // custom type edited to include one). The WebView runs no JS, so the actual text box is this
    // native TextInput, rendered alongside the question; the answer side then diffs against it.
    const typeAnswerField = renderPayload
        ? getTypeAnswerField(renderPayload.noteType.templates[renderPayload.card.ord])
        : null;

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingEmoji}>🧠</Text>
                    <Text style={styles.loadingText}>Yükleniyor...</Text>
                </View>
            </View>
        );
    }

    const preview = getPreview();
    const currentCardState = currentCard?.state;
    const subject = currentCard ? findSubject(currentCard.subject) : null;

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <View style={styles.topBarTitleRow}>
                    <Text style={styles.topBarTitle}>Bugünün Kartları</Text>
                    {streak.current > 0 && (
                        <View
                            style={[styles.streakChip, !streak.studiedToday && styles.streakChipIdle]}
                            {...webTitle(streak.studiedToday
                                ? `Günlük seri: ${streak.current} gün`
                                : `Seri ${streak.current} günde — bugün çalışarak devam ettir!`)}
                        >
                            <Text style={styles.streakChipText}>🔥 {streak.current}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: colors.badgeNew }]}>{queueStats.newCount}</Text>
                        <Text style={styles.statLabel}>YENİ</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: colors.badgeLearn }]}>{queueStats.learningCount}</Text>
                        <Text style={styles.statLabel}>ÖĞRENİYOR</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: colors.badgeReview }]}>{queueStats.reviewCount}</Text>
                        <Text style={styles.statLabel}>TEKRAR</Text>
                    </View>
                </View>
            </View>

            {deckDescription !== '' && (
                <Text style={styles.deckDescription} numberOfLines={2}>📝 {deckDescription}</Text>
            )}

            <ScrollView contentContainerStyle={styles.cardArea}>
                {currentCard ? (
                    <View style={styles.cardContainer}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardSubject}>{subject ? `${subject.icon} ${subject.name}` : '📝'}</Text>
                            <Text style={styles.cardTopic}>{currentCard.topic}</Text>
                            <View
                                style={[
                                    styles.statusBadge,
                                    {
                                        backgroundColor: currentCardState?.status === 'new'
                                            ? colors.badgeNewBg
                                            : currentCardState?.status === 'learning'
                                                ? colors.badgeLearnBg
                                                : colors.badgeReviewBg,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.statusText,
                                        {
                                            color: currentCardState?.status === 'new'
                                                ? colors.badgeNew
                                                : currentCardState?.status === 'learning'
                                                    ? colors.badgeLearn
                                                    : colors.badgeReview,
                                        },
                                    ]}
                                >
                                    {currentCardState?.status === 'new'
                                        ? 'YENİ'
                                        : currentCardState?.status === 'learning'
                                            ? 'ÖĞRENİYOR'
                                            : 'TEKRAR'}
                                </Text>
                            </View>

                            {currentFlag > 0 && (
                                <TouchableOpacity
                                    onPress={() => setOptionsMenuVisible(true)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Bayrak: ${FLAG_COLORS[currentFlag].name} — değiştirmek için dokun`}
                                    {...webTitle(`Bayrak: ${FLAG_COLORS[currentFlag].name}`)}
                                >
                                    <Text style={[styles.flagIndicator, { color: FLAG_COLORS[currentFlag].color }]}>⚑</Text>
                                </TouchableOpacity>
                            )}

                            {previewMode && (
                                <View style={styles.previewBadge}>
                                    <Text style={styles.previewBadgeText}>ÖNİZLEME</Text>
                                </View>
                            )}

                            <View style={{ flex: 1 }} />
                            {cardHasAudio && (
                                <TouchableOpacity
                                    style={styles.iconBtn}
                                    onPress={replayAudio}
                                    accessibilityRole="button"
                                    accessibilityLabel="Sesi çal (R)"
                                    {...webTitle('Sesi cal (R)')}
                                >
                                    <Text style={styles.iconBtnText}>🔊</Text>
                                    <Text style={styles.iconBtnLabel}>Çal</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={handleBury}
                                accessibilityRole="button"
                                accessibilityLabel="Kartı göm — yarına kadar gizlenir"
                                {...webTitle('Gom (Bury): kart yarina kadar gizlenir')}
                            >
                                <Text style={styles.iconBtnText}>💤</Text>
                                <Text style={styles.iconBtnLabel}>Göm</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={handleSuspend}
                                accessibilityRole="button"
                                accessibilityLabel="Kartı askıya al — sen açana kadar gösterilmez"
                                {...webTitle('Askiya al (Suspend): sen geri acana kadar gosterilmez')}
                            >
                                <Text style={styles.iconBtnText}>⏸️</Text>
                                <Text style={styles.iconBtnLabel}>Askıya Al</Text>
                            </TouchableOpacity>
                            {undoStack.length > 0 && (
                                <TouchableOpacity
                                    style={styles.iconBtn}
                                    onPress={undoLast}
                                    accessibilityRole="button"
                                    accessibilityLabel="Son cevabı geri al"
                                    {...webTitle('Geri al (Ctrl+Z)')}
                                >
                                    <Text style={styles.iconBtnText}>↩️</Text>
                                    <Text style={styles.iconBtnLabel}>Geri Al</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={() => setOptionsMenuVisible(true)}
                                accessibilityRole="button"
                                accessibilityLabel="Kart ve not seçenekleri"
                                {...webTitle('Diğer seçenekler (bayrak, unut, işaretle...)')}
                            >
                                <Text style={styles.iconBtnText}>⋯</Text>
                                <Text style={styles.iconBtnLabel}>Diğer</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.cardBody}>
                            <Text style={styles.cardLabel}>SORU</Text>
                            {renderPayload ? (
                                <CardWebView
                                    noteType={renderPayload.noteType}
                                    note={renderPayload.note}
                                    card={renderPayload.card}
                                    deck={renderPayload.deck}
                                    side="question"
                                    // On the answer side the signal falls back here only when the
                                    // back has no sound of its own (Anki's replay covers the front).
                                    playAudioSignal={!showingAnswer || !answerSideHasAudio ? audioSignal : undefined}
                                />
                            ) : (
                                <Text style={styles.questionText}>{currentCard.question}</Text>
                            )}

                            {typeAnswerField && !showingAnswer && (
                                <TextInput
                                    style={styles.typeAnswerInput}
                                    value={typedAnswer}
                                    onChangeText={setTypedAnswer}
                                    placeholder="Cevabınızı yazın..."
                                    placeholderTextColor={colors.textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    onSubmitEditing={() => setShowingAnswer(true)}
                                />
                            )}

                            {showingAnswer ? (
                                <View style={styles.answerSection}>
                                    <Text style={[styles.cardLabel, { color: colors.accent }]}>CEVAP</Text>
                                    {renderPayload ? (
                                        <CardWebView
                                            noteType={renderPayload.noteType}
                                            note={renderPayload.note}
                                            card={renderPayload.card}
                                            deck={renderPayload.deck}
                                            side="answer"
                                            typedAnswer={typeAnswerField ? typedAnswer : undefined}
                                            playAudioSignal={answerSideHasAudio ? audioSignal : undefined}
                                            // The question stays visible in its own panel above.
                                            omitFrontSide
                                        />
                                    ) : (
                                        <Text style={styles.answerText}>{currentCard.answer}</Text>
                                    )}
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={styles.showAnswerBtn}
                                    onPress={() => setShowingAnswer(true)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel="Cevabı göster"
                                >
                                    <Text style={styles.showAnswerText}>👁️ Cevabı Göster</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {showingAnswer && preview && (
                            <View style={styles.answerButtons}>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: colors.btnAgainBg, borderColor: '#e8c4c0' }]}
                                    onPress={() => answerCard(1)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Tekrar, sonraki gösterim ${preview.again}`}
                                    {...webTitle('Tekrar - Karti hatirlamadim (1)')}
                                >
                                    <Text style={[styles.btnTime, { color: colors.btnAgain }]}>{preview.again}</Text>
                                    <Text style={[styles.btnLabel, { color: colors.btnAgain }]}>Tekrar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: colors.btnHardBg, borderColor: '#e8d8b5' }]}
                                    onPress={() => answerCard(2)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Zor, sonraki gösterim ${preview.hard}`}
                                    {...webTitle('Zor - Zorlanarak hatirladim (2)')}
                                >
                                    <Text style={[styles.btnTime, { color: colors.btnHard }]}>{preview.hard}</Text>
                                    <Text style={[styles.btnLabel, { color: colors.btnHard }]}>Zor</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: colors.btnGoodBg, borderColor: '#b8dcc8' }]}
                                    onPress={() => answerCard(3)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`İyi, sonraki gösterim ${preview.good}`}
                                    {...webTitle('Iyi - Dogru hatirladim (3)')}
                                >
                                    <Text style={[styles.btnTime, { color: colors.btnGood }]}>{preview.good}</Text>
                                    <Text style={[styles.btnLabel, { color: colors.btnGood }]}>İyi</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: colors.btnEasyBg, borderColor: '#b8cfe0' }]}
                                    onPress={() => answerCard(4)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Kolay, sonraki gösterim ${preview.easy}`}
                                    {...webTitle('Kolay - Cok kolay hatirladim (4)')}
                                >
                                    <Text style={[styles.btnTime, { color: colors.btnEasy }]}>{preview.easy}</Text>
                                    <Text style={[styles.btnLabel, { color: colors.btnEasy }]}>Kolay</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.queueInfo}>
                            <Text style={styles.queueText}>
                                Kalan: <Text style={{ fontWeight: '700' }}>{queue.length}</Text> kart · Bugün: <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> tekrar
                            </Text>
                        </View>
                    </View>
                ) : nextLearningDue ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>⏳</Text>
                        <Text style={styles.emptyTitle}>Şimdilik Hepsi Bu Kadar!</Text>
                        <Text style={styles.countdownText}>{countdown}</Text>
                        <Text style={styles.emptyDesc}>
                            Şu an hazır olan tüm kartları bitirdin.{' '}
                            {queueStats.learningCount > 0
                                ? `${queueStats.learningCount} öğrenme kartı zamanlayıcıda bekliyor`
                                : 'Öğrenme kartları zamanlayıcıda bekliyor'}
                            {' '}— süre dolunca otomatik gösterilecek. İstersen aşağıdan süreyi beklemeden devam edebilirsin.
                        </Text>
                        {dailyNewLimitReached && heldBackNewCount > 0 && (
                            <Text style={styles.emptyInfo}>
                                📋 Günlük yeni kart limiti doldu — {heldBackNewCount} yeni kart sırada, yarın gösterilecek.
                            </Text>
                        )}
                        <TouchableOpacity
                            style={styles.primaryActionBtn}
                            onPress={handleStudyAhead}
                            accessibilityRole="button"
                            accessibilityLabel="Bekleme süresini atla ve hemen çalış"
                            {...webTitle('Zamanlayiciyi bekleme, sirali ogrenme kartlarini simdi calis')}
                        >
                            <Text style={styles.primaryActionText}>⚡ Beklemeden Çalış</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => router.push('/settings')}
                            accessibilityRole="button"
                            accessibilityLabel="Ayarları aç"
                        >
                            <Text style={styles.secondaryActionText}>⚙️ Limit ve bekleme ayarları</Text>
                        </TouchableOpacity>
                        <Text style={styles.emptySub}>
                            Bugün <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> kart tekrar edildi.
                        </Text>
                    </View>
                ) : dailyNewLimitReached ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyTitle}>Günlük Yeni Kart Limiti Doldu</Text>
                        <Text style={styles.emptyDesc}>
                            Bugün {sessionStats.newCardsToday || 0} yeni kart öğrendin.
                            {heldBackNewCount > 0 ? ` ${heldBackNewCount} yeni kart sırada — yarın otomatik gösterilecek.` : ''}
                            {' '}Devam etmek istersen limiti Ayarlar&apos;dan artırabilirsin.
                        </Text>
                        <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => router.push('/settings')}
                            accessibilityRole="button"
                            accessibilityLabel="Ayarlardan limiti artır"
                        >
                            <Text style={styles.secondaryActionText}>⚙️ Limiti Artır</Text>
                        </TouchableOpacity>
                        <Text style={styles.emptySub}>
                            Bugün <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> kart tekrar edildi.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🎉</Text>
                        <Text style={styles.emptyTitle}>Tebrikler!</Text>
                        <Text style={styles.emptyDesc}>
                            {selectedTopic
                                ? `"${selectedTopic}" konusu`
                                : selectedSubject
                                    ? `"${findSubject(selectedSubject)?.name ?? selectedSubject}" dersi`
                                    : 'Tüm dersler'} için bugünlük tüm kartlar tamamlandı.
                        </Text>
                        <Text style={styles.emptySub}>
                            Bugün <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> kart tekrar edildi.
                        </Text>
                    </View>
                )}
            </ScrollView>

            {currentCard && (
                <View style={styles.shortcutBar}>
                    <Text style={styles.shortcutText}>
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.showAnswer)}</Text> Cevabı göster ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.again)}</Text> Tekrar ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.hard)}</Text> Zor ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.good)}</Text> İyi ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.easy)}</Text> Kolay ·
                        <Text style={styles.shortcutKey}>Ctrl+1-7</Text> Bayrak ·
                        <Text style={styles.shortcutKey}>Ctrl+Z</Text> Geri Al
                    </Text>
                </View>
            )}

            {currentCard && (
                <CardOptionsMenu
                    visible={optionsMenuVisible}
                    onClose={() => setOptionsMenuVisible(false)}
                    cardSuspended={currentCard.state.suspended}
                    noteMarked={currentNoteMarked}
                    autoAdvance={settings.autoAdvance}
                    onToggleAutoAdvance={handleToggleAutoAdvance}
                    onFlag={handleFlag}
                    onBuryCard={handleBury}
                    onSuspendCard={handleToggleSuspendCard}
                    onForgetCard={handleForgetCard}
                    onSetDueDate={handleSetDueDate}
                    onCardInfo={handleCardInfo}
                    onDeckOptions={handleDeckOptions}
                    onToggleMarkNote={handleToggleMarkNote}
                    onBuryNote={handleBuryNote}
                    onSuspendNote={handleSuspendNote}
                    onDuplicateNote={handleDuplicateNote}
                    onDeleteNote={handleDeleteNote}
                />
            )}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingEmoji: { fontSize: 48, marginBottom: 12 },
    loadingText: { fontSize: FontSize.lg, color: colors.textMuted },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xxl,
        paddingVertical: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    topBarTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    topBarTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary },
    streakChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.btnHardBg,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 12,
    },
    streakChipIdle: { opacity: 0.55 },
    streakChipText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.btnHard },
    statsRow: { flexDirection: 'row', gap: 20 },
    stat: { alignItems: 'center' },
    statCount: { fontSize: 24, fontWeight: '700' },
    statLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, marginTop: 2 },

    cardArea: { flexGrow: 1, padding: Spacing.xxl, alignItems: 'center', justifyContent: 'center' },
    cardContainer: { width: '100%', maxWidth: 680 },

    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: Spacing.sm,
        flexWrap: 'wrap',
    },
    cardSubject: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
    cardTopic: { fontSize: FontSize.sm, color: colors.textMuted },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
    flagIndicator: { fontSize: 20, marginLeft: 6, lineHeight: 22 },
    previewBadge: {
        marginLeft: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        backgroundColor: colors.badgeNewBg,
    },
    previewBadgeText: { fontSize: 10, fontWeight: '700', color: colors.badgeNew, letterSpacing: 0.5 },
    deckDescription: {
        fontSize: FontSize.sm,
        color: colors.textMuted,
        paddingHorizontal: Spacing.xxl,
        paddingVertical: 6,
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    iconBtn: {
        minWidth: 44,
        borderRadius: 6,
        backgroundColor: colors.bgInput,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 3,
        paddingHorizontal: 6,
    },
    iconBtnText: { fontSize: 15 },
    iconBtnLabel: { fontSize: 8, fontWeight: '600', color: colors.textMuted, marginTop: 1 },

    cardBody: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: 28,
        ...Shadows.md,
        minHeight: 180,
    },
    cardLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 2,
        marginBottom: Spacing.sm,
        color: colors.textMuted,
    },
    questionText: { fontSize: 18, fontWeight: '500', lineHeight: 30, color: colors.textPrimary },

    typeAnswerInput: {
        marginTop: Spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgInput,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.md,
        color: colors.textPrimary,
    },

    answerSection: {
        marginTop: Spacing.xl,
        paddingTop: Spacing.xl,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    answerText: { fontSize: FontSize.md, lineHeight: 26, color: colors.textSecondary },

    showAnswerBtn: {
        marginTop: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: colors.bgInput,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        alignItems: 'center',
    },
    showAnswerText: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },

    answerButtons: { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
    answerBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        gap: 2,
    },
    btnTime: { fontSize: FontSize.xs, fontWeight: '600' },
    btnLabel: { fontSize: 16, fontWeight: '700' },

    queueInfo: { alignItems: 'center', marginTop: Spacing.lg },
    queueText: { fontSize: FontSize.sm, color: colors.textMuted },

    shortcutBar: {
        paddingVertical: 8,
        paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bgSecondary,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        alignItems: 'center',
    },
    shortcutText: { fontSize: 11, color: colors.textMuted },
    shortcutKey: {
        fontWeight: '700',
        color: colors.textSecondary,
        backgroundColor: colors.bgInput,
        paddingHorizontal: 4,
    },

    emptyState: { alignItems: 'center', padding: 40 },
    emptyIcon: { fontSize: 56, marginBottom: Spacing.md },
    countdownText: {
        fontSize: 48,
        fontWeight: '700',
        color: colors.accent,
        marginBottom: Spacing.md,
        fontVariant: ['tabular-nums'] as any,
    },
    emptyTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.accent, marginBottom: Spacing.sm },
    emptyDesc: { fontSize: FontSize.lg, color: colors.textSecondary, textAlign: 'center', maxWidth: 520 },
    emptyInfo: {
        fontSize: FontSize.md,
        fontWeight: '600',
        color: colors.btnHard,
        textAlign: 'center',
        marginTop: Spacing.md,
        maxWidth: 520,
        backgroundColor: colors.btnHardBg,
        borderWidth: 1,
        borderColor: colors.btnHard,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        overflow: 'hidden',
    },
    primaryActionBtn: {
        marginTop: Spacing.xl,
        backgroundColor: colors.accent,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xxl,
        borderRadius: 8,
    },
    primaryActionText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
    secondaryActionBtn: {
        marginTop: Spacing.md,
        backgroundColor: colors.bgInput,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        borderRadius: 8,
    },
    secondaryActionText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textSecondary },
    emptySub: { fontSize: FontSize.md, color: colors.textSecondary, marginTop: Spacing.lg },
    });
}
