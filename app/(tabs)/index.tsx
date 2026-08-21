import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Modal, Pressable, PanResponder, Image, useWindowDimensions, type ViewProps } from 'react-native';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Spacing, FontSize, Shadows, BorderRadius, useThemeColors, type ColorScheme } from '../../constants/theme';
import { findSubject } from '../../lib/subjects';
import { getScheduler, todayLocalYMD } from '../../lib/scheduler';
import { getTypeAnswerField, renderCardHtml } from '../../lib/templates';
import { nextRolloverMs } from '../../lib/ankiState';
import { getNewCardsIntroducedTodayInDeck, getStudyStreak, getTodayAnswerStats, type StudyStreak } from '../../lib/reviewLogger';
import { resolveSettingsFromConfig } from '../../lib/settingsResolver';
import { useApp } from './_layout';
import type { Grade, SessionStats, StudyCard } from '../../lib/types';
import { FLAG_COLORS, getDeckDisplayName, type AnkiCard, type CardFlag } from '../../lib/models';
import {
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    deleteNote,
    isNoteMarked,
    saveNote,
    setCardFlag,
    toggleNoteMark,
} from '../../lib/noteManager';
import {
    completeFilteredCard,
    getAllDecks,
    getDeck,
    getDeckByName,
    getDeckConfigForDeck,
    restoreFilteredCard,
} from '../../lib/deckManager';
import CardWebView from '../../components/CardWebView';
import { CardOptionsMenu } from '../../components/CardOptionsMenu';
import { WhiteboardOverlay, type WhiteboardHandle } from '../../components/WhiteboardOverlay';
import DeckPickerModal from '../../components/DeckPickerModal';
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
import { useI18n } from '../../hooks/useI18n';
import { cardFlagName } from '../../lib/i18n';
import { alert } from '../../lib/confirm';
import { gradeForHardwareKey, matchesKeyBinding, matchesShowAnswerKey, normalizeHardwareKey } from '../../lib/hardwareKeyboard';

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

/**
 * Default filtered-deck names are persisted, so a deck created while the app was in English
 * can later appear in a Turkish reviewer. Translate only Anki's generated prefix; user-chosen
 * deck names remain untouched.
 */
function localizeFilteredDeckDisplayName(displayName: string, locale: 'tr' | 'en'): string {
    const localizedPrefix = locale === 'tr' ? 'Filtrelenmiş Deste' : 'Filtered Deck';
    return displayName.replace(
        /^(?:Filtered Deck|Filtrelenmiş Deste)(?=\s|$)/i,
        localizedPrefix,
    );
}

function DownChevron({ color }: { color: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 14 14" accessibilityElementsHidden>
            <Path
                d="M3 5.25 7 9l4-3.75"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

// Anki opens on the deck list. Redirect exactly once per app launch, so in-app
// navigation back to "/" (sidebar, deck study links) still reaches the study screen.
let launchRedirectDone = false;

// Study-ahead passes survive the study screen unmounting (hopping to another deck via the
// deck list and back). A pass is consumed by answering its card — never by navigation.
let persistedStudyAheadIds: number[] = [];

/** Mounted only while the corresponding preference is enabled. */
function KeepAwakeGuard() {
    useKeepAwake();
    return null;
}

type QueueStats = { newCount: number; learningCount: number; reviewCount: number };

type UndoEntry = {
    cardId: number;
    reviewLogId: number;
    previousSnapshot: AnkiCard;
    filteredDeckId?: number;
    grade: Grade;
    answerTimeMs: number;
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
    const { t, l, locale } = useI18n();
    const { selectedSubject, selectedTopic, settings, bumpDataVersion, dataVersion, setStudyPosition, setActiveDeckName } = useApp();
    const params = useLocalSearchParams();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const selectedDeckName = typeof params.deck === 'string' ? params.deck : null;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact), [colors, isCompact]);
    const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
    const [optionsInitialView, setOptionsInitialView] = useState<'menu' | 'flag'>('menu');
    // Anki whiteboard: an ink layer over the card, enabled from the reviewer overflow menu.
    // Clear/save/undo run through this ref so the same menu can drive the drawing tools.
    const [whiteboardActive, setWhiteboardActive] = useState(false);
    const [whiteboardStylusOnly, setWhiteboardStylusOnly] = useState(false);
    const [whiteboardHasContent, setWhiteboardHasContent] = useState(false);
    const whiteboardRef = useRef<WhiteboardHandle>(null);
    // Voice playback (TTS): reads the visible side aloud. Off by default; when on it also speaks
    // automatically as each side is shown.
    const [voicePlaybackEnabled, setVoicePlaybackEnabled] = useState(false);
    // Tapping the header opens a deck picker (Anki's "Select deck"), switching what's being studied.
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);

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
    const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
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
    const lastGradeTapAtRef = useRef(0);
    const studySessionStartedAtRef = useRef(Date.now());
    const lastTimeboxBucketRef = useRef(0);
    const nativeShortcutCaptureRef = useRef<TextInput>(null);
    const reviewerScrollRef = useRef<ScrollView>(null);

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

    // Anki tracks a "current deck"; deck-aware screens (stats, the sidebar's course list)
    // default to it. Sticky: studying a course/topic inside the deck must not clear it —
    // only opening another deck replaces it.
    useEffect(() => {
        if (selectedDeckName) setActiveDeckName(selectedDeckName);
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

    // Anki timeboxing: at each configured interval, show a compact progress checkpoint without
    // ending the session. The next checkpoint starts immediately after dismissal.
    useEffect(() => {
        const minutes = settings.timeboxMinutes ?? 0;
        if (loading || minutes <= 0) {
            lastTimeboxBucketRef.current = 0;
            return;
        }
        const tick = () => {
            const bucket = Math.floor((Date.now() - studySessionStartedAtRef.current) / (minutes * 60_000));
            if (bucket <= 0 || bucket <= lastTimeboxBucketRef.current) return;
            lastTimeboxBucketRef.current = bucket;
            alert(
                l('Zaman Kutusu', 'Timebox'),
                l(
                    `${sessionStatsRef.current.reviewed} kart gözden geçirildi. Çalışmaya devam edebilirsiniz.`,
                    `${sessionStatsRef.current.reviewed} cards reviewed. You can continue studying.`,
                ),
            );
        };
        const timer = setInterval(tick, 15_000);
        return () => clearInterval(timer);
    }, [loading, settings.timeboxMinutes, l]);

    useEffect(() => {
        if (!currentCard) return;
        setAnswerStartedAt(Date.now());
        // A new card always starts on the question side, whichever path swapped it in.
        setShowingAnswer(false);
        setTypedAnswer('');
    }, [currentCard?.cardId]);

    useEffect(() => {
        if (!showingAnswer) return;
        // The back replaces the front. Start it at the top even if the learner had scrolled
        // deep into a long question, then let the outer reviewer scroll naturally to grades.
        requestAnimationFrame(() => reviewerScrollRef.current?.scrollTo({ y: 0, animated: false }));
    }, [showingAnswer]);

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
        const now = Date.now();
        const doubleTapGuard = settings.answerDoubleTapMs ?? 200;
        if (now - lastGradeTapAtRef.current < doubleTapGuard) return;
        lastGradeTapAtRef.current = now;
        isMutatingRef.current = true;

        try {
            if (Platform.OS !== 'web' && settings.showAnswerFeedback !== false) {
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
                setRedoStack([]);
                setShowingAnswer(false);
                buildQueue();
                return;
            }

            // A filtered deck is a build snapshot, not a live saved search. Once a card has
            // finished its learning/relearning steps, retire it from this build so background
            // queue refreshes and app restarts cannot deal the same completed card again.
            const activeFilteredDeck = selectedDeckName ? getDeckByName(selectedDeckName) : null;
            const completesFilteredCard = Boolean(activeFilteredDeck?.isFiltered && (
                previewMode ? grade > 1 : result.updatedCard.state.status !== 'learning'
            ));
            if (completesFilteredCard && activeFilteredDeck) {
                completeFilteredCard(activeFilteredDeck.id, currentCard.cardId);
            }

            // Preview answers change nothing, so there is nothing to undo (or count).
            if (!previewMode) {
                setRedoStack([]);
                setUndoStack((prev) => [
                    ...prev.slice(-29),
                    {
                        cardId: currentCard.cardId,
                        reviewLogId: result.reviewLogId,
                        previousSnapshot: result.previousAnkiCard,
                        filteredDeckId: completesFilteredCard ? activeFilteredDeck?.id : undefined,
                        grade,
                        answerTimeMs: elapsed,
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
        selectedDeckName,
        buildQueue,
        bumpDataVersion,
        queue.length,
        scheduleFullRefresh,
        refreshSessionStats,
    ]);

    const gesturePanResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Boolean(
            settings.gesturesEnabled
            && currentCard
            && Math.abs(gesture.dx) > 12
            && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6
        ),
        onPanResponderRelease: (_event, gesture) => {
            if (!settings.gesturesEnabled || !currentCard) return;
            const sensitivity = settings.swipeSensitivity ?? 100;
            const threshold = Math.max(28, 82 - sensitivity * 0.32);
            if (Math.abs(gesture.dx) < threshold) return;
            if (!showingAnswer) {
                setShowingAnswer(true);
                return;
            }
            void answerCard(gesture.dx > 0 ? 3 : 1);
        },
    }), [settings.gesturesEnabled, settings.swipeSensitivity, currentCard, showingAnswer, answerCard]);

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
                setRedoStack([]);
                buildQueue();
                return;
            }

            setUndoStack((prev) => prev.slice(0, -1));
            setRedoStack((prev) => [...prev.slice(-29), undo]);

            undoAnswer(undo.previousSnapshot, undo.reviewLogId);
            if (undo.filteredDeckId) {
                restoreFilteredCard(undo.filteredDeckId, undo.cardId);
            }

            // Deleting the revlog row already reverted the day's numbers; re-read them.
            const restoredStats = refreshSessionStats();
            bumpDataVersion();
            buildQueue(restoredStats.newCardsToday);
        } finally {
            isMutatingRef.current = false;
        }
    }, [undoStack, buildQueue, bumpDataVersion, refreshSessionStats]);

    const redoLast = useCallback(async () => {
        if (redoStack.length === 0 || isMutatingRef.current) return;
        isMutatingRef.current = true;

        try {
            const redo = redoStack[redoStack.length - 1];
            if (!getAnkiCard(redo.cardId)) {
                console.warn('[Study] redo target missing, clearing stale redo stack.');
                setRedoStack([]);
                buildQueue();
                return;
            }

            const result = answerStudyCard(redo.cardId, redo.grade, settings, redo.answerTimeMs);
            if (redo.filteredDeckId) {
                completeFilteredCard(redo.filteredDeckId, redo.cardId);
            }

            setRedoStack((prev) => prev.slice(0, -1));
            setUndoStack((prev) => [
                ...prev.slice(-29),
                {
                    cardId: redo.cardId,
                    reviewLogId: result.reviewLogId,
                    previousSnapshot: result.previousAnkiCard,
                    filteredDeckId: redo.filteredDeckId,
                    grade: redo.grade,
                    answerTimeMs: redo.answerTimeMs,
                },
            ]);

            const restoredStats = refreshSessionStats();
            bumpDataVersion();
            buildQueue(restoredStats.newCardsToday);
        } finally {
            isMutatingRef.current = false;
        }
    }, [redoStack, settings, buildQueue, bumpDataVersion, refreshSessionStats]);

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

    const handleSaveTags = useCallback((raw: string) => {
        if (!currentCard) return;
        const note = getNote(currentCard.noteId);
        if (!note) return;
        note.tags = raw.split(/\s+/).map((tag) => tag.trim()).filter(Boolean);
        saveNote(note);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, bumpDataVersion, buildQueue]);

    const handleDeckOptions = useCallback(() => {
        if (!currentCard) return;
        const card = getAnkiCard(currentCard.cardId);
        if (!card) return;
        router.push(`/deck-options?deckId=${card.deckId}` as any);
    }, [currentCard, router]);

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

    const handleDeleteNote = useCallback(() => {
        if (!currentCard) return;
        deleteNote(currentCard.noteId);
        bumpDataVersion();
        buildQueue();
    }, [currentCard, bumpDataVersion, buildQueue]);

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

    // DOM keyboard events are web-only. Native physical keyboards use the responder-chain
    // capture below, while this listener also handles desktop modifier shortcuts.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;

        const isEditableTarget = (target: EventTarget | null): boolean => {
            if (!(target instanceof HTMLElement)) return false;
            const tag = target.tagName.toLowerCase();
            return tag === 'input' || tag === 'textarea' || target.isContentEditable;
        };

        const { showAnswer, replayAudio: replayKey, buryCard, suspendCard, markNote } = settings.keyBindings;

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

            if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                if (matchesKeyBinding(event.key, replayKey)) {
                    event.preventDefault();
                    setAudioSignal((value) => value + 1);
                    return;
                }
                if (matchesKeyBinding(event.key, buryCard)) {
                    event.preventDefault();
                    handleBury();
                    return;
                }
                if (matchesKeyBinding(event.key, suspendCard)) {
                    event.preventDefault();
                    handleSuspend();
                    return;
                }
                if (matchesKeyBinding(event.key, markNote)) {
                    event.preventDefault();
                    handleToggleMarkNote();
                    return;
                }
            }

            if (matchesShowAnswerKey(event.key, showAnswer)) {
                if (!showingAnswer) {
                    event.preventDefault();
                    setShowingAnswer(true);
                } else {
                    event.preventDefault();
                    void answerCard(3);
                }
                return;
            }

            if (!showingAnswer) return;

            const grade = gradeForHardwareKey(event.key, settings.keyBindings);
            if (grade !== null) {
                event.preventDefault();
                void answerCard(grade);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [answerCard, currentCard, showingAnswer, undoLast, settings.keyBindings, handleFlag, handleBury, handleSuspend, handleToggleMarkNote]);

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
    const hasSiblingCards = useMemo(
        () => (renderPayload ? getCardsForNote(renderPayload.note.id).length > 1 : false),
        [renderPayload],
    );
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

    // Pause is broadcast to both sides — stopping whatever is playing is always safe.
    const [pauseSignal, setPauseSignal] = useState(0);

    // Anki's reviewer top bar: a back arrow leaves study, and flag/more open the options sheet
    // (the flag button jumps straight to the color list).
    const handleExitStudy = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.push('/decks');
    }, [router]);
    const openDeckPicker = useCallback(() => setDeckPickerVisible(true), []);
    const handlePickDeck = useCallback((name: string | null) => {
        setDeckPickerVisible(false);
        router.replace((name ? `/?deck=${encodeURIComponent(name)}` : '/') as any);
    }, [router]);
    const deckPickerItems = useMemo(() => {
        try {
            return getAllDecks()
                .sort((a, b) => a.name.localeCompare(b.name, locale));
        } catch (e) {
            console.warn('[Study] deck picker list failed:', e);
            return [];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataVersion, locale]);
    const openMoreMenu = useCallback(() => {
        setOptionsInitialView('menu');
        setOptionsMenuVisible(true);
    }, []);
    const openFlagMenu = useCallback(() => {
        setOptionsInitialView('flag');
        setOptionsMenuVisible(true);
    }, []);
    const closeOptionsMenu = useCallback(() => {
        setOptionsMenuVisible(false);
        setOptionsInitialView('menu');
    }, []);

    // --- Whiteboard (Anki) ---
    const toggleWhiteboard = useCallback(() => setWhiteboardActive((on) => !on), []);
    const handleClearWhiteboard = useCallback(() => whiteboardRef.current?.clear(), []);
    const handleSaveWhiteboard = useCallback(() => { void whiteboardRef.current?.save(); }, []);
    const handleDisableWhiteboard = useCallback(() => {
        whiteboardRef.current?.clear();
        setWhiteboardActive(false);
    }, []);

    // --- Voice playback (TTS) ---
    const speakSide = useCallback((answerSide: boolean) => {
        if (!renderPayload) return;
        const html = renderCardHtml(renderPayload.noteType, renderPayload.note, renderPayload.card.ord, answerSide ? 'answer' : 'question', {
            deckName: renderPayload.deck?.name,
            clozeOrd: renderPayload.card.ord + 1,
            omitFrontSide: answerSide,
        });
        const text = html
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) return;
        Speech.stop();
        Speech.speak(text, { language: locale === 'tr' ? 'tr-TR' : 'en-US' });
    }, [renderPayload, locale]);
    const handleToggleVoicePlayback = useCallback(() => {
        setVoicePlaybackEnabled((on) => {
            if (on) Speech.stop();
            return !on;
        });
    }, []);

    const handleAddCard = useCallback(() => {
        const selectedDeck = selectedDeckName ? getDeckByName(selectedDeckName) : null;
        const homeDeckId = renderPayload
            ? (renderPayload.card.odid || renderPayload.card.deckId)
            : null;
        const homeDeck = homeDeckId ? getDeck(homeDeckId) : null;
        const target = selectedDeck && !selectedDeck.isFiltered
            ? selectedDeck
            : homeDeck && !homeDeck.isFiltered
                ? homeDeck
                : null;
        router.push((target ? `/editor?deckId=${target.id}` : '/editor') as any);
    }, [renderPayload, router, selectedDeckName]);

    const handleEditNote = useCallback(() => {
        if (!currentCard) return;
        router.push(`/editor?cardId=${currentCard.cardId}` as any);
    }, [currentCard, router]);

    // The whiteboard resets on each new card, mirroring AnkiDroid (ink clears as the card advances).
    useEffect(() => { whiteboardRef.current?.clear(); }, [currentCard?.cardId]);

    // Auto voice playback: read the visible side aloud whenever the card or side changes.
    useEffect(() => {
        if (!voicePlaybackEnabled) return;
        speakSide(showingAnswer);
        return () => { Speech.stop(); };
    }, [voicePlaybackEnabled, currentCard?.cardId, showingAnswer, speakSide]);

    // Never let speech continue after the reviewer unmounts.
    useEffect(() => () => { Speech.stop(); }, []);

    // A stale signal must not leak into the next side/card: without this reset, the answer
    // WebView would mount with a nonzero signal (from an earlier R press) and play unasked.
    // Anki's "interrupt current audio when answering": flipping or moving to the next card
    // also stops whatever is still playing (the question WebView persists across cards).
    useEffect(() => {
        setAudioSignal(0);
        if (settings.interruptAudioOnAnswer) {
            setPauseSignal((value) => value + 1);
        }
    }, [currentCard?.cardId, showingAnswer, settings.interruptAudioOnAnswer]);

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

    const reviewerDeckTitle = useMemo(() => {
        if (!selectedDeckName) return l('Bugünün Kartları', 'Cards for Today');
        const displayName = getDeckDisplayName(selectedDeckName);
        const selectedDeck = getDeckByName(selectedDeckName);
        return selectedDeck?.isFiltered
            ? localizeFilteredDeckDisplayName(displayName, locale)
            : displayName;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDeckName, dataVersion, locale, l]);

    // Present only for note types whose template embeds {{type:Field}} (id 5/6 built-ins, or a
    // custom type edited to include one). The WebView runs no JS, so the actual text box is this
    // native TextInput, rendered alongside the question; the answer side then diffs against it.
    const typeAnswerField = renderPayload
        ? getTypeAnswerField(renderPayload.noteType.templates[renderPayload.card.ord])
        : null;

    const handleNativeShortcutKey = useCallback((rawKey: string) => {
        if (!currentCard || optionsMenuVisible || deckPickerVisible) return;
        const key = normalizeHardwareKey(rawKey);
        const bindings = settings.keyBindings;

        if (matchesKeyBinding(key, bindings.replayAudio)) {
            replayAudio();
            return;
        }
        if (matchesKeyBinding(key, bindings.buryCard)) {
            handleBury();
            return;
        }
        if (matchesKeyBinding(key, bindings.suspendCard)) {
            handleSuspend();
            return;
        }
        if (matchesKeyBinding(key, bindings.markNote)) {
            handleToggleMarkNote();
            return;
        }
        if (matchesShowAnswerKey(key, bindings.showAnswer)) {
            if (!showingAnswer) setShowingAnswer(true);
            else void answerCard(3);
            return;
        }
        if (!showingAnswer) return;

        const grade = gradeForHardwareKey(key, bindings);
        if (grade !== null) void answerCard(grade);
    }, [
        currentCard,
        optionsMenuVisible,
        deckPickerVisible,
        settings.keyBindings,
        replayAudio,
        handleBury,
        handleSuspend,
        handleToggleMarkNote,
        showingAnswer,
        answerCard,
    ]);

    // A hidden, soft-keyboard-free TextInput participates in iOS' responder chain and receives
    // physical-keyboard events. Real type-answer inputs take focus normally; after the answer is
    // revealed this capture regains focus so Anki's 1-4 grading shortcuts work again.
    useEffect(() => {
        if (Platform.OS === 'web' || !currentCard || optionsMenuVisible || deckPickerVisible) {
            nativeShortcutCaptureRef.current?.blur();
            return;
        }
        const timer = setTimeout(() => nativeShortcutCaptureRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [currentCard?.cardId, showingAnswer, optionsMenuVisible, deckPickerVisible]);

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingEmoji}>🧠</Text>
                    <Text style={styles.loadingText}>{t('common.loading')}</Text>
                </View>
            </View>
        );
    }

    const preview = getPreview();
    const currentCardState = currentCard?.state;
    const subject = currentCard ? findSubject(currentCard.subject) : null;
    const answerScale = (settings.answerButtonScalePercent ?? 100) / 100;
    const gradeButton = (grade: Grade, label: string, time: string, color: string, backgroundColor: string, borderColor: string) => (
        <TouchableOpacity
            key={grade}
            style={[
                styles.answerBtn,
                settings.twoRowAnswerButtons && styles.answerBtnTwoRow,
                { backgroundColor, borderColor, minHeight: 52 * answerScale },
            ]}
            onPress={() => answerCard(grade)}
            accessibilityRole="button"
            accessibilityLabel={l(`${label}, sonraki gösterim ${time}`, `${label}, next review ${time}`)}
        >
            {settings.showNextReviewTimes && <Text numberOfLines={1} style={[styles.btnTime, { color, fontSize: FontSize.xs * answerScale }]}>{time}</Text>}
            <Text numberOfLines={1} style={[styles.btnLabel, { color, fontSize: (isCompact ? 14 : 16) * answerScale }]}>{label}</Text>
        </TouchableOpacity>
    );
    const answerButtons = showingAnswer && preview && settings.showAnswerButtons !== false ? (
        <View style={[styles.answerButtons, settings.twoRowAnswerButtons && styles.answerButtonsTwoRows]}>
            {gradeButton(1, t('anki.again'), preview.again, colors.btnAgain, colors.btnAgainBg, '#e8c4c0')}
            {!settings.hideHardAndEasy && gradeButton(2, t('anki.hard'), preview.hard, colors.btnHard, colors.btnHardBg, '#e8d8b5')}
            {gradeButton(3, t('anki.good'), preview.good, colors.btnGood, colors.btnGoodBg, '#b8dcc8')}
            {!settings.hideHardAndEasy && gradeButton(4, t('anki.easy'), preview.easy, colors.btnEasy, colors.btnEasyBg, '#b8cfe0')}
        </View>
    ) : null;

    return (
        <View style={styles.container}>
            {settings.studyBackgroundImageUri ? (
                <>
                    <Image source={{ uri: settings.studyBackgroundImageUri }} style={styles.studyBackground} resizeMode="cover" />
                    <View style={styles.studyBackgroundScrim} pointerEvents="none" />
                </>
            ) : null}
            {settings.keepScreenOn ? <KeepAwakeGuard /> : null}
            {settings.showStudyTopBar !== false && <View style={styles.topBar}>
                <View style={styles.topBarLeft}>
                    <TouchableOpacity
                        style={styles.topIconBtn}
                        onPress={handleExitStudy}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Deste listesine dön', 'Back to deck list')}
                        {...webTitle(l('Geri', 'Back'))}
                    >
                        <Text style={styles.topBackIcon}>‹</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.topTitleTap}
                        onPress={openDeckPicker}
                        accessibilityRole="button"
                        accessibilityLabel={l('Deste seç', 'Select deck')}
                        {...webTitle(l('Çalışılacak desteyi seç', 'Choose which deck to study'))}
                    >
                        <Text style={styles.topBarTitle} numberOfLines={1}>
                            {settings.showDeckTitle !== false && selectedDeckName
                                ? reviewerDeckTitle
                                : l('Bugünün Kartları', 'Cards for Today')}
                        </Text>
                        <View style={styles.topTitleCaret}>
                            <DownChevron color={colors.textMuted} />
                        </View>
                        {streak.current > 0 && (
                            <View
                                style={[styles.streakChip, !streak.studiedToday && styles.streakChipIdle]}
                                {...webTitle(streak.studiedToday
                                    ? l(`Günlük seri: ${streak.current} gün`, `Daily streak: ${streak.current} days`)
                                    : l(`Seri ${streak.current} günde — bugün çalışarak sürdürün!`, `${streak.current}-day streak — study today to keep it going!`))}
                            >
                                <Text style={styles.streakChipText}>🔥 {streak.current}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
                {currentCard && (
                    <View style={styles.topBarActions}>
                        <TouchableOpacity
                            style={styles.topIconBtn}
                            onPress={openFlagMenu}
                            accessibilityRole="button"
                            accessibilityLabel={l('Bayrakla işaretle', 'Flag card')}
                            {...webTitle(l('Bayrak', 'Flag'))}
                        >
                            <Text style={[styles.topActionIcon, currentFlag > 0 && { color: FLAG_COLORS[currentFlag].color }]}>⚑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.topIconBtn}
                            onPress={openMoreMenu}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kart ve not seçenekleri', 'Card and note options')}
                            {...webTitle(l('Diğer seçenekler', 'More options'))}
                        >
                            <Text style={styles.topActionIcon}>⋮</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>}

            <View style={styles.contentArea}>
            {deckDescription !== '' && (
                <Text style={styles.deckDescription} numberOfLines={2}>📝 {deckDescription}</Text>
            )}

            <ScrollView ref={reviewerScrollRef} contentContainerStyle={styles.cardArea}>
                {currentCard ? (
                    <View style={styles.cardContainer} {...gesturePanResponder.panHandlers}>
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
                                        ? t('anki.new').toLocaleUpperCase()
                                        : currentCardState?.status === 'learning'
                                            ? t('anki.learn').toLocaleUpperCase()
                                            : t('anki.review').toLocaleUpperCase()}
                                </Text>
                            </View>

                            {currentFlag > 0 && (
                                <TouchableOpacity
                                    onPress={openFlagMenu}
                                    accessibilityRole="button"
                                    accessibilityLabel={l(`Bayrak: ${cardFlagName(locale, currentFlag)} — değiştirmek için dokunun`, `Flag: ${cardFlagName(locale, currentFlag)} — tap to change`)}
                                    {...webTitle(l(`Bayrak: ${cardFlagName(locale, currentFlag)}`, `Flag: ${cardFlagName(locale, currentFlag)}`))}
                                >
                                    <Text style={[styles.flagIndicator, { color: FLAG_COLORS[currentFlag].color }]}>⚑</Text>
                                </TouchableOpacity>
                            )}

                            {currentNoteMarked && (
                                <TouchableOpacity
                                    onPress={openMoreMenu}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Not işaretli — kaldırmak için dokunun', 'Note is marked — tap to remove mark')}
                                    {...webTitle(l('Not işaretli (Kartlarım > İşaretli filtresinde bulunur)', 'Note is marked (shown in Browse > Marked)'))}
                                >
                                    <Text style={styles.markedIndicator}>⭐</Text>
                                </TouchableOpacity>
                            )}

                            {previewMode && (
                                <View style={styles.previewBadge}>
                                    <Text style={styles.previewBadgeText}>{l('ÖNİZLEME', 'PREVIEW')}</Text>
                                </View>
                            )}

                        </View>

                        {settings.answerButtonsPosition === 'top' ? answerButtons : null}

                        <View style={[
                            styles.cardBody,
                            settings.studyFrameStyle === 'plain' && styles.cardBodyPlain,
                            settings.centerCardContent && styles.cardBodyCentered,
                        ]}>
                            {renderPayload && !showingAnswer ? (
                                <CardWebView
                                    noteType={renderPayload.noteType}
                                    note={renderPayload.note}
                                    card={renderPayload.card}
                                    deck={renderPayload.deck}
                                    side="question"
                                    // On the answer side the signal falls back here only when the
                                    // back has no sound of its own (Anki's replay covers the front).
                                    playAudioSignal={!showingAnswer || !answerSideHasAudio ? audioSignal : undefined}
                                    pauseAudioSignal={pauseSignal}
                                    cardZoomPercent={settings.cardZoomPercent}
                                    imageZoomPercent={settings.imageZoomPercent}
                                    showAudioPlayButtons={settings.showAudioPlayButtons}
                                    centerContent={settings.centerCardContent}
                                    frameStyle={settings.studyFrameStyle}
                                />
                            ) : !renderPayload ? (
                                <Text style={styles.questionText}>{currentCard.question}</Text>
                            ) : null}

                            {typeAnswerField && !showingAnswer && (
                                <TextInput
                                    style={styles.typeAnswerInput}
                                    value={typedAnswer}
                                    onChangeText={setTypedAnswer}
                                    placeholder={l('Yanıtınızı yazın…', 'Type your answer…')}
                                    placeholderTextColor={colors.textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    onSubmitEditing={() => setShowingAnswer(true)}
                                />
                            )}

                            {showingAnswer && renderPayload ? (
                                // Match Anki's reviewer: the back template replaces the front.
                                // It may contain {{FrontSide}} itself, so stacking both sides
                                // duplicates imported AnKing cards and wastes the iPhone viewport.
                                <CardWebView
                                    noteType={renderPayload.noteType}
                                    note={renderPayload.note}
                                    card={renderPayload.card}
                                    deck={renderPayload.deck}
                                    side="answer"
                                    typedAnswer={typeAnswerField ? typedAnswer : undefined}
                                    playAudioSignal={answerSideHasAudio ? audioSignal : undefined}
                                    pauseAudioSignal={pauseSignal}
                                    cardZoomPercent={settings.cardZoomPercent}
                                    imageZoomPercent={settings.imageZoomPercent}
                                    showAudioPlayButtons={settings.showAudioPlayButtons}
                                    centerContent={settings.centerCardContent}
                                    frameStyle={settings.studyFrameStyle}
                                />
                            ) : showingAnswer ? (
                                <View style={styles.answerSection}>
                                    <View style={styles.answerDivider} />
                                    <Text style={styles.answerText}>{currentCard.answer}</Text>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={styles.showAnswerBtn}
                                    onPress={(settings.showAnswerLongPressMs ?? 0) === 0 ? () => setShowingAnswer(true) : undefined}
                                    onLongPress={(settings.showAnswerLongPressMs ?? 0) > 0 ? () => setShowingAnswer(true) : undefined}
                                    delayLongPress={settings.showAnswerLongPressMs ?? 0}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('anki.showAnswer')}
                                >
                                    <Text style={styles.showAnswerText}>👁️ {t('anki.showAnswer')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {settings.answerButtonsPosition !== 'top' ? answerButtons : null}

                        <View style={styles.queueInfo}>
                            {settings.showRemainingCount && (
                                <View style={styles.queueCounts}>
                                    <Text style={[styles.queueCount, { color: colors.badgeNew }]}>{queueStats.newCount}</Text>
                                    <Text style={styles.queueCountPlus}>+</Text>
                                    <Text style={[styles.queueCount, { color: colors.badgeLearn }]}>{queueStats.learningCount}</Text>
                                    <Text style={styles.queueCountPlus}>+</Text>
                                    <Text style={[styles.queueCount, { color: colors.badgeReview }]}>{queueStats.reviewCount}</Text>
                                </View>
                            )}
                            <Text style={styles.queueText}>
                                {settings.showRemainingCount && (
                                    <>{l('Kalan:', 'Remaining:')} <Text style={{ fontWeight: '700' }}>{queue.length}</Text> {l('kart', 'cards')} · </>
                                )}
                                {t('common.today')}: <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('tekrar', 'reviews')}
                                {settings.showRemainingTime && queue.length > 0 ? (
                                    <> · {l('Tahmini', 'Estimated')}: <Text style={{ fontWeight: '700' }}>{Math.max(1, Math.ceil(queue.length * (sessionStats.reviewed > 0 ? (Date.now() - studySessionStartedAtRef.current) / sessionStats.reviewed : 30_000) / 60_000))} {l('dk.', 'min')}</Text></>
                                ) : null}
                            </Text>
                        </View>
                    </View>
                ) : nextLearningDue ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>⏳</Text>
                        <Text style={styles.emptyTitle}>{l('Şimdilik Hepsi Bu Kadar!', 'That’s All for Now!')}</Text>
                        <Text style={styles.countdownText}>{countdown}</Text>
                        <Text style={styles.emptyDesc}>
                            {l('Şu anda hazır olan tüm kartları bitirdiniz. ', 'You finished every card currently available. ')}
                            {queueStats.learningCount > 0
                                ? l(`${queueStats.learningCount} öğrenme kartı zamanlayıcıda bekliyor`, `${queueStats.learningCount} learning cards are waiting for their timer`)
                                : l('Öğrenme kartları zamanlayıcıda bekliyor', 'Learning cards are waiting for their timer')}
                            {l(' — süre dolduğunda otomatik olarak gösterilecek. İsterseniz beklemeden devam edebilirsiniz.', ' — they will appear automatically when due. You can also continue without waiting.')}
                        </Text>
                        {dailyNewLimitReached && heldBackNewCount > 0 && (
                            <Text style={styles.emptyInfo}>
                                {l(`📋 Günlük yeni kart limiti doldu — ${heldBackNewCount} yeni kart sırada ve yarın gösterilecek.`, `📋 The daily new card limit was reached — ${heldBackNewCount} new cards are queued for tomorrow.`)}
                            </Text>
                        )}
                        <TouchableOpacity
                            style={styles.primaryActionBtn}
                            onPress={handleStudyAhead}
                            accessibilityRole="button"
                            accessibilityLabel={l('Bekleme süresini atla ve hemen çalış', 'Skip the wait and study now')}
                            {...webTitle(l('Zamanlayıcıyı beklemeden öğrenme kartlarını şimdi çalış', 'Study queued learning cards now without waiting for the timer'))}
                        >
                            <Text style={styles.primaryActionText}>⚡ {l('Beklemeden Çalış', 'Study Now')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => router.push('/settings')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Ayarları aç', 'Open settings')}
                        >
                            <Text style={styles.secondaryActionText}>⚙️ {l('Limit ve bekleme ayarları', 'Limits and learn-ahead settings')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.emptySub}>
                            {l('Bugün', 'Today')} <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('kart tekrar edildi.', 'cards were reviewed.')}
                        </Text>
                    </View>
                ) : dailyNewLimitReached ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyTitle}>{l('Günlük Yeni Kart Limiti Doldu', 'Daily New Card Limit Reached')}</Text>
                        <Text style={styles.emptyDesc}>
                            {l(`Bugün ${sessionStats.newCardsToday || 0} yeni kart öğrendiniz.`, `You learned ${sessionStats.newCardsToday || 0} new cards today.`)}
                            {heldBackNewCount > 0 ? l(` ${heldBackNewCount} yeni kart sırada — yarın otomatik olarak gösterilecek.`, ` ${heldBackNewCount} new cards are queued and will appear automatically tomorrow.`) : ''}
                            {l(' Devam etmek isterseniz limiti Ayarlar’dan artırabilirsiniz.', ' To continue, increase the limit in Settings.')}
                        </Text>
                        <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => router.push('/settings')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Ayarlardan limiti artır', 'Increase the limit in settings')}
                        >
                            <Text style={styles.secondaryActionText}>⚙️ {l('Limiti Artır', 'Increase Limit')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.emptySub}>
                            {l('Bugün', 'Today')} <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('kart tekrar edildi.', 'cards were reviewed.')}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🎉</Text>
                        <Text style={styles.emptyTitle}>{l('Tebrikler!', 'Congratulations!')}</Text>
                        <Text style={styles.emptyDesc}>
                            {selectedTopic
                                ? l(`“${selectedTopic}” konusu`, `the “${selectedTopic}” topic`)
                                : selectedSubject
                                    ? l(`“${findSubject(selectedSubject)?.name ?? selectedSubject}” dersi`, `the “${findSubject(selectedSubject)?.name ?? selectedSubject}” subject`)
                                    : l('tüm dersler', 'all subjects')} {l('için bugünlük tüm kartlar tamamlandı.', 'are complete for today.')}
                        </Text>
                        <Text style={styles.emptySub}>
                            {l('Bugün', 'Today')} <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('kart tekrar edildi.', 'cards were reviewed.')}
                        </Text>
                    </View>
                )}
            </ScrollView>

            {Platform.OS === 'web' && !isCompact && currentCard && (
                <View style={styles.shortcutBar}>
                    <Text style={styles.shortcutText}>
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.showAnswer)}</Text> {t('anki.showAnswer')} ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.again)}</Text> {t('anki.again')} ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.hard)}</Text> {t('anki.hard')} ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.good)}</Text> {t('anki.good')} ·
                        <Text style={styles.shortcutKey}>{formatKeyLabel(settings.keyBindings.easy)}</Text> {t('anki.easy')} ·
                        <Text style={styles.shortcutKey}>Ctrl+1-7</Text> {l('Bayrak', 'Flag')} ·
                        <Text style={styles.shortcutKey}>Ctrl+Z</Text> {l('Geri Al', 'Undo')}
                    </Text>
                </View>
            )}

            {Platform.OS !== 'web' && currentCard && !optionsMenuVisible && !deckPickerVisible && (
                <TextInput
                    ref={nativeShortcutCaptureRef}
                    value=""
                    onChangeText={() => undefined}
                    onKeyPress={(event) => handleNativeShortcutKey(event.nativeEvent.key)}
                    showSoftInputOnFocus={false}
                    caretHidden
                    autoCapitalize="none"
                    autoCorrect={false}
                    contextMenuHidden
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                    style={styles.hardwareKeyboardCapture}
                />
            )}

            {currentCard && (
                <WhiteboardOverlay
                    ref={whiteboardRef}
                    active={whiteboardActive}
                    stylusOnly={whiteboardStylusOnly}
                    onContentChange={setWhiteboardHasContent}
                />
            )}
            </View>

            {currentCard && (
                <CardOptionsMenu
                    visible={optionsMenuVisible}
                    initialView={optionsInitialView}
                    onClose={closeOptionsMenu}
                    cardSuspended={currentCard.state.suspended}
                    noteMarked={currentNoteMarked}
                    hasSiblingCards={hasSiblingCards}
                    cardHasAudio={cardHasAudio}
                    onReplayAudio={replayAudio}
                    onFlag={handleFlag}
                    onBuryCard={handleBury}
                    onSuspendCard={handleToggleSuspendCard}
                    onForgetCard={handleForgetCard}
                    onSetDueDate={handleSetDueDate}
                    onDeckOptions={handleDeckOptions}
                    onToggleMarkNote={handleToggleMarkNote}
                    onBuryNote={handleBuryNote}
                    onSuspendNote={handleSuspendNote}
                    onDeleteNote={handleDeleteNote}
                    canUndo={undoStack.length > 0}
                    onUndo={undoLast}
                    canRedo={redoStack.length > 0}
                    onRedo={redoLast}
                    onAddCard={handleAddCard}
                    onEditNote={handleEditNote}
                    noteTags={renderPayload?.note.tags.join(' ') ?? ''}
                    onSaveTags={handleSaveTags}
                    whiteboardActive={whiteboardActive}
                    whiteboardHasContent={whiteboardHasContent}
                    onToggleWhiteboard={toggleWhiteboard}
                    onUndoWhiteboard={() => whiteboardRef.current?.undo()}
                    stylusOnly={whiteboardStylusOnly}
                    onToggleStylus={() => setWhiteboardStylusOnly((on) => !on)}
                    onClearWhiteboard={handleClearWhiteboard}
                    onSaveWhiteboard={handleSaveWhiteboard}
                    onDisableWhiteboard={handleDisableWhiteboard}
                    voicePlaybackEnabled={voicePlaybackEnabled}
                    onToggleVoicePlayback={handleToggleVoicePlayback}
                />
            )}

            <DeckPickerModal
                visible={deckPickerVisible}
                colors={colors}
                decks={deckPickerItems}
                selectedDeckName={selectedDeckName}
                title={l('Deste Seç', 'Select Deck')}
                allDecksLabel={l('Tüm Desteler', 'All Decks')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setDeckPickerVisible(false)}
                onSelect={handlePickDeck}
                onCreateDeck={() => router.push(`/decks?create=${Date.now()}` as any)}
            />
        </View>
    );
}

function createStyles(colors: ColorScheme, isCompact: boolean) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    studyBackground: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    studyBackgroundScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: `${colors.bgPrimary}55` },
    hardwareKeyboardCapture: { position: 'absolute', width: 1, height: 1, left: -10, bottom: 0, opacity: 0 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingEmoji: { fontSize: 48, marginBottom: 12 },
    loadingText: { fontSize: FontSize.lg, color: colors.textMuted },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: isCompact ? Spacing.md : Spacing.xxl,
        paddingVertical: isCompact ? Spacing.md : Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    topBarTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    topBarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
    topBarActions: { flexDirection: 'row', alignItems: 'center', gap: isCompact ? 2 : 6 },
    topBarTitle: { flexShrink: 1, fontSize: isCompact ? FontSize.lg : FontSize.xl, fontWeight: '700', color: colors.textPrimary },
    topIconBtn: { minWidth: 40, minHeight: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    topBackIcon: { fontSize: 34, lineHeight: 34, color: colors.accent, marginTop: -4 },
    topActionIcon: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
    topTitleTap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
    topTitleCaret: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },

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

    contentArea: { flex: 1, position: 'relative' },
    cardArea: {
        flexGrow: 1,
        padding: isCompact ? Spacing.md : Spacing.xxl,
        alignItems: 'center',
        justifyContent: isCompact ? 'flex-start' : 'center',
    },
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
    markedIndicator: { fontSize: 16, marginLeft: 4, lineHeight: 22 },
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
        paddingHorizontal: isCompact ? Spacing.md : Spacing.xxl,
        paddingVertical: 6,
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

    cardBody: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: isCompact ? Spacing.lg : 28,
        ...Shadows.md,
        minHeight: 180,
    },
    cardBodyPlain: {
        borderWidth: 0,
        borderRadius: 0,
        backgroundColor: colors.bgPrimary,
        shadowOpacity: 0,
        elevation: 0,
    },
    cardBodyCentered: { minHeight: isCompact ? 360 : 460, justifyContent: 'center' },
    questionText: { fontSize: 22, fontWeight: '500', lineHeight: 32, color: colors.textPrimary },

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
        marginTop: Spacing.lg,
    },
    answerDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginBottom: Spacing.xl,
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

    answerButtons: { flexDirection: 'row', gap: isCompact ? 6 : 10, marginTop: Spacing.md },
    answerButtonsTwoRows: { flexWrap: 'wrap' },
    answerBtn: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
        paddingVertical: isCompact ? 10 : 14,
        paddingHorizontal: 2,
        borderRadius: 8,
        borderWidth: 1,
        gap: 2,
    },
    answerBtnTwoRow: { flexBasis: '47%', flexGrow: 1 },
    btnTime: { fontSize: FontSize.xs, fontWeight: '600' },
    btnLabel: { fontSize: isCompact ? 14 : 16, fontWeight: '700' },

    queueInfo: { alignItems: 'center', marginTop: Spacing.lg, gap: 6 },
    queueCounts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    queueCount: { fontSize: FontSize.md, fontWeight: '800' },
    queueCountPlus: { fontSize: FontSize.sm, color: colors.textMuted },
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
