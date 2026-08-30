import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ActivityIndicator, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Modal, Pressable, PanResponder, useWindowDimensions, AppState, type ViewProps } from 'react-native';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Spacing, FontSize, Shadows, BorderRadius, useThemeColors, type ColorScheme } from '../../constants/theme';
import { findSubject } from '../../lib/subjects';
import { getScheduler, todayLocalYMD } from '../../lib/scheduler';
import { getTypeAnswerField, renderCardHtml } from '../../lib/templates';
import { nextRolloverMs } from '../../lib/ankiState';
import { getAverageAnswerMs, getNewCardsIntroducedTodayInDeck, getStudyStreak, getTodayAnswerStats, type StudyStreak } from '../../lib/reviewLogger';
import { resolveSettingsFromConfig } from '../../lib/settingsResolver';
import {
    useAppSettings,
    useCollectionInvalidation,
    useSetStudyPosition,
    useStudyScope,
} from '../../contexts/AppContext';
import type { Grade, ReviewGestureAction, SessionStats, StudyCard } from '../../lib/types';
import { DEFAULT_DECK_CONFIG, FLAG_COLORS, getDeckDisplayName, type AnkiCard, type CardFlag } from '../../lib/models';
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
    createDeck,
    getAllDecks,
    getAvailableDeckName,
    getDeck,
    getDeckByName,
    getDeckConfigForDeck,
    restoreFilteredCard,
} from '../../lib/deckManager';
import CardWebView from '../../components/CardWebView';
import { CardOptionsMenu } from '../../components/CardOptionsMenu';
import { WhiteboardOverlay, type WhiteboardHandle } from '../../components/WhiteboardOverlay';
import DeckPickerModal from '../../components/DeckPickerModal';
import CatalogUnlockSheet from '../../components/CatalogUnlockSheet';
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
import { alert, choose } from '../../lib/confirm';
import { gradeForHardwareKey, matchesKeyBinding, matchesShowAnswerKey, normalizeHardwareKey } from '../../lib/hardwareKeyboard';
import { BKA_CATALOG_PACK, getBkaCatalogTier } from '../../lib/bkaCatalog';
import { ActiveElapsedTimer } from '../../lib/activeElapsedTimer';
import { beginStudyActivity } from '../../lib/backupWindow';
import { TimeboxTracker } from '../../lib/timebox';
import {
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    reviewTapZoneAt,
    swipeThresholdForSensitivity,
} from '../../lib/reviewerTouchControls';
import { extractAnkiTtsSegments } from '../../lib/ankiTts';
import { AnkiSpeechQueue } from '../../lib/ankiSpeechQueue';
import {
    answerTimerSeconds,
    estimateStudyMinutes,
    formatStopwatch,
    shouldRunAutoAdvance,
} from '../../lib/reviewerTimers';
import { useRouteDeckScope } from '../../hooks/useRouteDeckScope';
import {
    normalizeReviewerToolbarPosition,
    visibleReviewerGrades,
} from '../../lib/reviewerPresentation';
import { MAX_TYPE_ANSWER_CHARS } from '../../lib/typeAnswerBridge';
import { coordinatePostAnswerQueueRefresh } from '../../lib/reviewerQueueRefresh';

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
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
        <Svg width={14} height={14} viewBox="0 0 14 14">
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

function ReviewerBackIcon({ color }: { color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
                d="M15 4 7 12l8 8"
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** AnkiDroid-style reviewer action: reverse the most recent grading operation. */
function UndoReviewIcon({ color }: { color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
                d="M9 7H4V2M4.5 7A8 8 0 1 1 6 18"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
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
    const { settings } = useAppSettings();
    const {
        collectionVersion,
        invalidateCollection,
        markSchedulingStale,
    } = useCollectionInvalidation();
    const { selectedSubject, selectedTopic, setActiveDeckName } = useStudyScope();
    const setStudyPosition = useSetStudyPosition();
    const params = useLocalSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const routeSelectedDeckName = typeof params.deck === 'string' ? params.deck : null;
    // The URL/deep link chooses the initial study scope. Switching decks from the reviewer is a
    // queue-scope change on this screen, not a new navigation entry.
    const [selectedDeckName, setSelectedDeckName] = useRouteDeckScope(routeSelectedDeckName);
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact), [colors, isCompact]);
    const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
    const [optionsInitialView, setOptionsInitialView] = useState<'menu' | 'flag'>('menu');
    // Anki whiteboard: an ink layer over the card, enabled from the reviewer overflow menu.
    // Clear/save/undo run through this ref so the same menu can drive the drawing tools.
    const [whiteboardActive, setWhiteboardActive] = useState(false);
    const [whiteboardStylusOnly, setWhiteboardStylusOnly] = useState(false);
    const [whiteboardHasContent, setWhiteboardHasContent] = useState(false);
    const [whiteboardToolbarHeight, setWhiteboardToolbarHeight] = useState(0);
    const whiteboardRef = useRef<WhiteboardHandle>(null);
    // AnkiDroid-compatible whole-card TTS. Explicit Anki TTS regions take precedence; otherwise
    // only visible learner text is read (never stylesheet or script contents).
    const [voicePlaybackEnabled, setVoicePlaybackEnabled] = useState(false);
    // Tapping the header opens a deck picker (Anki's "Select deck"), switching what's being studied.
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);
    const [catalogUnlockVisible, setCatalogUnlockVisible] = useState(false);

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
    const [answerFeedback, setAnswerFeedback] = useState<{ nonce: number } | null>(null);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextLearningDue, setNextLearningDue] = useState<number | null>(null);
    const [countdown, setCountdown] = useState('');
    const [queueStats, setQueueStats] = useState<QueueStats>({ newCount: 0, learningCount: 0, reviewCount: 0 });
    const [dailyNewLimitReached, setDailyNewLimitReached] = useState(false);
    const [heldBackNewCount, setHeldBackNewCount] = useState(0);
    const [heldBackReviewCount, setHeldBackReviewCount] = useState(0);
    // Anki's on-screen answer timer (a deck option) and the pace its ETA sibling is built on.
    const [answerSeconds, setAnswerSeconds] = useState(0);
    // Auto Advance's "show reminder" action: a nudge in the status bar, never a grade.
    const [autoAdvanceReminder, setAutoAdvanceReminder] = useState(false);
    const [averageAnswerMs, setAverageAnswerMs] = useState<number | null>(null);
    // One-shot "study ahead" snapshot: card ids captured at button-press time, served
    // regardless of their step timer (Anki's learn-ahead, but user-triggered). Each id is
    // dropped the moment that card is answered, so it can resurface at most once per press.
    // Backed by a module-level copy so leaving the reviewer and returning does not lose the pass.
    const [studyAheadCardIds, setStudyAheadCardIdsState] = useState<number[]>(persistedStudyAheadIds);
    const setStudyAheadCardIds = useCallback((updater: (prev: number[]) => number[]) => {
        setStudyAheadCardIdsState((prev) => {
            const next = updater(prev);
            persistedStudyAheadIds = next;
            return next;
        });
    }, []);
    const sessionStatsRef = useRef(sessionStats);
    const currentCardRef = useRef<StudyCard | null>(null);
    const previousDeckScopeRef = useRef<string | null>(selectedDeckName);
    const answersSinceRefreshRef = useRef(0);
    const scheduledRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Blocks re-entry while an answer/undo is committing, so a double tap or a
    // held-down grade key cannot rate the same card twice.
    const isMutatingRef = useRef(false);
    const lastGradeTapAtRef = useRef(0);
    const appIsActiveRef = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    const answerTimerRef = useRef(new ActiveElapsedTimer(Date.now(), appIsActiveRef.current));
    const timeboxTrackerRef = useRef(new TimeboxTracker(Date.now()));
    // Auto Advance measures each SIDE, not the whole card, so it needs its own clock.
    const autoAdvanceTimerRef = useRef(new ActiveElapsedTimer(Date.now(), appIsActiveRef.current));
    const nativeShortcutCaptureRef = useRef<TextInput>(null);
    const nativeTypeAnswerRef = useRef<TextInput>(null);
    const reviewerScrollRef = useRef<ScrollView>(null);
    const [fallbackTapSurface, setFallbackTapSurface] = useState({ width: 1, height: 1 });

    useEffect(() => {
        sessionStatsRef.current = sessionStats;
    }, [sessionStats]);

    useEffect(() => {
        currentCardRef.current = currentCard;
    }, [currentCard]);

    // A local deck switch replaces the queue exactly as the old route remount did. Do not carry
    // an exposed answer, whiteboard stroke or undo history into a different deck.
    useEffect(() => {
        if (previousDeckScopeRef.current === selectedDeckName) return;
        previousDeckScopeRef.current = selectedDeckName;
        setQueue([]);
        setCurrentCard(null);
        setShowingAnswer(false);
        setTypedAnswer('');
        setUndoStack([]);
        setRedoStack([]);
        setWhiteboardActive(false);
        setWhiteboardHasContent(false);
    }, [selectedDeckName]);

    // Per-card review time and Auto Advance pause when the app is inactive. Timebox intentionally
    // uses wall-clock time, matching Anki's reviewer-scoped blocks.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            const active = nextState === 'active';
            const now = Date.now();
            appIsActiveRef.current = active;
            answerTimerRef.current.setActive(active, now);
            autoAdvanceTimerRef.current.setActive(active, now);
        });
        return () => subscription.remove();
    }, []);

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

    // The weekly collection snapshot reads every table in one synchronous pass. Hold it while
    // this screen is the one in front of the learner; it runs as soon as focus moves away, or
    // when the app leaves the foreground. Focus rather than mount: the reviewer stays mounted
    // underneath Settings and the editor, and a backup must not be blocked by a hidden screen.
    useFocusEffect(useCallback(() => beginStudyActivity(), []));

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
    }, [selectedDeckName, settings, collectionVersion]);

    // Filtered deck with "reschedule" off => Anki preview mode: answers never touch cards.
    const previewMode = useMemo(() => {
        if (!selectedDeckName) return false;
        const deck = getDeckByName(selectedDeckName);
        return Boolean(deck?.isFiltered && deck.reschedule === false);
    }, [selectedDeckName, collectionVersion]);

    // Preview leaves the DB untouched, so a rebuilt queue would re-gather every card the
    // user already went through. Track them per session; a scope change starts fresh.
    const previewDoneIdsRef = useRef<Set<number>>(new Set());
    useEffect(() => {
        previewDoneIdsRef.current.clear();
    }, [selectedSubject, selectedTopic, selectedDeckName]);

    // Entering a different study scope or changing the preference starts a new reviewer block.
    // Continue resets the same tracker after the checkpoint choice below.
    useEffect(() => {
        timeboxTrackerRef.current.reset(Date.now());
    }, [selectedSubject, selectedTopic, selectedDeckName, settings.timeboxMinutes]);

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
        setHeldBackReviewCount(result.heldBackReviewCount);

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
            setAverageAnswerMs(getAverageAnswerMs(settings.dayRolloverHour));
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
    const lastCollectionVersionRef = useRef(collectionVersion);
    useEffect(() => {
        if (loading || collectionVersion === lastCollectionVersionRef.current) return;
        lastCollectionVersionRef.current = collectionVersion;
        buildQueue(undefined, false, true);
    }, [collectionVersion, loading, buildQueue]);

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
            if (isMutatingRef.current) return;
            refreshSessionStats();
            buildQueue(undefined, false, true);
        }, 45000);

        return () => clearInterval(timer);
    }, [loading, buildQueue, refreshSessionStats]);

    useEffect(() => {
        if (!currentCard) return;
        answerTimerRef.current.reset(Date.now(), appIsActiveRef.current);
        // A new card always starts on the question side, whichever path swapped it in.
        setShowingAnswer(false);
        setTypedAnswer('');
    }, [currentCard?.cardId]);

    // Anki reads Timers, Auto Advance and the audio replay rule from the deck the card lives in,
    // not from the deck that was selected to study — a card drawn from a subdeck follows its own
    // deck's preset.
    const cardDeckOptions = useMemo(() => {
        const config = currentCard
            ? getDeckConfigForDeck(currentCard.deckId, settings.dayRolloverHour)
            : DEFAULT_DECK_CONFIG;
        return {
            showTimer: config.showTimer === true,
            maxAnswerSecs: config.maxAnswerSecs,
            stopTimerOnAnswer: config.stopTimerOnAnswer === true,
            secondsToShowQuestion: Math.max(0, config.secondsToShowQuestion ?? 0),
            secondsToShowAnswer: Math.max(0, config.secondsToShowAnswer ?? 0),
            questionAction: config.questionAction ?? 'showAnswer',
            waitForAudio: config.waitForAudio !== false,
            answerAction: config.answerAction ?? 'bury',
            skipQuestionWhenReplayingAnswer: config.skipQuestionWhenReplayingAnswer === true,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentCard?.deckId, settings.dayRolloverHour, collectionVersion]);

    // The on-screen timer counts the same foreground-only time the review log records, and stops
    // at the deck's maximum answer seconds, exactly as the manual describes. "Stop timer on
    // answer" freezes the reading the moment the back is revealed, so the number the learner
    // sees is their recall time rather than their reading time.
    const timerFrozen = showingAnswer && cardDeckOptions.stopTimerOnAnswer;
    useEffect(() => {
        if (!currentCard || !cardDeckOptions.showTimer) {
            setAnswerSeconds(0);
            return;
        }
        const tick = () => setAnswerSeconds(answerTimerSeconds(
            answerTimerRef.current.elapsed(Date.now()),
            cardDeckOptions.maxAnswerSecs,
        ));
        tick();
        if (timerFrozen) return;
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [currentCard?.cardId, cardDeckOptions.showTimer, cardDeckOptions.maxAnswerSecs, timerFrozen]);

    // Minutes left in today's queue at the learner's recent pace (Anki's ETA next to the counts).
    const remainingMinutes = useMemo(() => {
        if (!settings.showRemainingTime || averageAnswerMs === null) return null;
        return estimateStudyMinutes(queueStats, {
            averageAnswerMs,
            learningStepCount: scopeSettings.learningSteps.length,
        });
    }, [settings.showRemainingTime, averageAnswerMs, queueStats, scopeSettings.learningSteps.length]);

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
            if (settings.showAnswerFeedback !== false && grade === 1) {
                setAnswerFeedback({ nonce: Date.now() });
            }

            const elapsed = answerTimerRef.current.elapsed(Date.now());

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
            // Do not publish a React context update here. Count-heavy screens consume this
            // passive scheduler revision when they become visible again.
            markSchedulingStale();

            // Anki checks Timebox only after a repetition has completed. The answered card stays
            // on screen while the learner chooses, so the next card (and its audio) cannot start
            // behind the checkpoint dialog.
            timeboxTrackerRef.current.recordRepetition();
            const checkpoint = timeboxTrackerRef.current.checkpoint(
                settings.timeboxMinutes ?? 0,
                Date.now(),
            );
            if (checkpoint) {
                if (scheduledRefreshRef.current) {
                    clearTimeout(scheduledRefreshRef.current);
                    scheduledRefreshRef.current = null;
                }
                const shouldContinue = await choose(
                    l('Zaman kutusu', 'Timebox'),
                    l(
                        `${checkpoint.minutes} dakikada ${checkpoint.cards} kart çalıştınız.`,
                        `You studied ${checkpoint.cards} ${checkpoint.cards === 1 ? 'card' : 'cards'} in ${checkpoint.minutes} ${checkpoint.minutes === 1 ? 'minute' : 'minutes'}.`,
                    ),
                    l('Devam', 'Continue'),
                    l('Bitir', 'Finish'),
                );

                if (!shouldContinue) {
                    setShowingAnswer(false);
                    router.replace('/decks' as any);
                    return;
                }

                timeboxTrackerRef.current.reset(Date.now());
            }

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
            setTypedAnswer('');
            // Reset here as well as in the card-id effect. A single-card queue can
            // immediately deal the same id again after "Again", so its id does not change.
            answerTimerRef.current.reset(Date.now(), appIsActiveRef.current);

            answersSinceRefreshRef.current += 1;
            // Always do a full DB rebuild when the queue empties — the in-memory queue
            // may not contain learning cards from earlier answers that are still waiting.
            coordinatePostAnswerQueueRefresh(
                queueBecameEmpty || answersSinceRefreshRef.current >= 8 || queue.length <= 1,
                {
                    refreshImmediately: () => buildQueue(nextStats.newCardsToday),
                    scheduleDeferredRefresh: () => scheduleFullRefresh(15000, nextStats.newCardsToday),
                },
            );
        } finally {
            isMutatingRef.current = false;
        }
    }, [
        currentCard,
        settings,
        previewMode,
        selectedDeckName,
        buildQueue,
        markSchedulingStale,
        queue.length,
        scheduleFullRefresh,
        refreshSessionStats,
        l,
        router,
    ]);

    useEffect(() => {
        if (!answerFeedback) return;
        const timer = setTimeout(() => setAnswerFeedback(null), 550);
        return () => clearTimeout(timer);
    }, [answerFeedback]);

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
            markSchedulingStale();
            buildQueue(restoredStats.newCardsToday);
        } finally {
            isMutatingRef.current = false;
        }
    }, [undoStack, buildQueue, markSchedulingStale, refreshSessionStats]);

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
            markSchedulingStale();
            buildQueue(restoredStats.newCardsToday);
        } finally {
            isMutatingRef.current = false;
        }
    }, [redoStack, settings, buildQueue, markSchedulingStale, refreshSessionStats]);

    const handleSuspend = useCallback(() => {
        if (!currentCard) return;
        setCardSuspended(currentCard.cardId, true, settings.dayRolloverHour);
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, markSchedulingStale, buildQueue]);

    const handleBury = useCallback(() => {
        if (!currentCard) return;
        setCardBuried(currentCard.cardId, true, settings.dayRolloverHour);
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, markSchedulingStale, buildQueue]);

    // --- Card options menu (Anki-style) ---

    const handleToggleSuspendCard = useCallback(() => {
        if (!currentCard) return;
        setCardSuspended(currentCard.cardId, !currentCard.state.suspended, settings.dayRolloverHour);
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, markSchedulingStale, buildQueue]);

    const handleFlag = useCallback((flag: CardFlag) => {
        if (!currentCard) return;
        setCardFlag(currentCard.cardId, flag);
        invalidateCollection();
    }, [currentCard, invalidateCollection]);

    const handleForgetCard = useCallback(() => {
        if (!currentCard) return;
        forgetCard(currentCard.cardId, settings);
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings, markSchedulingStale, buildQueue]);

    const handleSetDueDate = useCallback((days: number) => {
        if (!currentCard) return;
        setCardDueInDays(currentCard.cardId, days, settings);
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings, markSchedulingStale, buildQueue]);

    const handleSaveTags = useCallback((raw: string) => {
        if (!currentCard) return;
        const note = getNote(currentCard.noteId);
        if (!note) return;
        note.tags = raw.split(/\s+/).map((tag) => tag.trim()).filter(Boolean);
        saveNote(note);
        invalidateCollection();
        buildQueue();
    }, [currentCard, invalidateCollection, buildQueue]);

    const handleDeckOptions = useCallback(() => {
        if (!currentCard) return;
        const card = getAnkiCard(currentCard.cardId);
        if (!card) return;
        router.push(`/deck-options?deckId=${card.deckId}` as any);
    }, [currentCard, router]);

    const handleToggleMarkNote = useCallback(() => {
        if (!currentCard) return;
        toggleNoteMark(currentCard.noteId);
        invalidateCollection();
    }, [currentCard, invalidateCollection]);

    const handleBuryNote = useCallback(() => {
        if (!currentCard) return;
        for (const card of getCardsForNote(currentCard.noteId)) {
            setCardBuried(card.id, true, settings.dayRolloverHour);
        }
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, markSchedulingStale, buildQueue]);

    const handleSuspendNote = useCallback(() => {
        if (!currentCard) return;
        for (const card of getCardsForNote(currentCard.noteId)) {
            setCardSuspended(card.id, true, settings.dayRolloverHour);
        }
        markSchedulingStale();
        buildQueue();
    }, [currentCard, settings.dayRolloverHour, markSchedulingStale, buildQueue]);

    const handleDeleteNote = useCallback(() => {
        if (!currentCard) return;
        deleteNote(currentCard.noteId);
        invalidateCollection();
        buildQueue();
    }, [currentCard, invalidateCollection, buildQueue]);

    // Anki Auto Advance. The preset owns the dwell times and the follow-up action; the
    // reviewer's own switch decides whether any of it runs. Zero seconds disables that half, so a
    // deck can reveal answers on its own without ever grading a card for the learner.
    const autoAdvanceSeconds = showingAnswer
        ? cardDeckOptions.secondsToShowAnswer
        : cardDeckOptions.secondsToShowQuestion;
    const autoAdvanceAction = cardDeckOptions.answerAction;
    const runAutoAdvanceAnswerAction = useCallback(() => {
        if (autoAdvanceAction === 'again') { void answerCard(1); return; }
        if (autoAdvanceAction === 'hard') { void answerCard(2); return; }
        if (autoAdvanceAction === 'good') { void answerCard(3); return; }
        // "Show reminder" deliberately leaves the card alone: it only signals that the dwell
        // time is up, which is what learners use when they want a nudge rather than a grade.
        if (autoAdvanceAction === 'showReminder') { setAutoAdvanceReminder(true); return; }
        handleBury();
    }, [autoAdvanceAction, answerCard, handleBury]);

    useEffect(() => {
        setAutoAdvanceReminder(false);
    }, [currentCard?.cardId, showingAnswer]);

    useEffect(() => {
        if (!settings.autoAdvance || !currentCard || autoAdvanceSeconds <= 0) return;
        autoAdvanceTimerRef.current.reset(Date.now(), appIsActiveRef.current);
        const targetMs = autoAdvanceSeconds * 1000;
        const timer = setInterval(() => {
            // The dwell timer and audio run in parallel. If audio outlasts the configured dwell,
            // act as soon as it ends; do not make the learner wait for a second full countdown.
            if (!shouldRunAutoAdvance(
                autoAdvanceTimerRef.current.elapsed(Date.now()),
                targetMs,
                cardDeckOptions.waitForAudio,
                anyAudioActive(),
            )) return;
            if (!showingAnswer) {
                if (cardDeckOptions.questionAction === 'showReminder') {
                    clearInterval(timer);
                    setAutoAdvanceReminder(true);
                    return;
                }
                setShowingAnswer(true);
                return;
            }
            clearInterval(timer);
            runAutoAdvanceAnswerAction();
        }, 250);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        settings.autoAdvance,
        currentCard?.cardId,
        showingAnswer,
        autoAdvanceSeconds,
        cardDeckOptions.waitForAudio,
        cardDeckOptions.questionAction,
        runAutoAdvanceAnswerAction,
    ]);

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
    }, [currentCard?.cardId, collectionVersion]);

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
    const cardHasAttachedMedia = useMemo(
        () => (renderPayload ? /\[sound:|<audio\b|<video\b/i.test(renderPayload.note.fields.join(' ')) : false),
        [renderPayload],
    );
    const explicitTtsSides = useMemo(() => {
        if (!renderPayload) return { question: false, answer: false };
        const common = {
            deckName: renderPayload.deck?.name,
            clozeOrd: renderPayload.card.ord + 1,
        };
        const question = renderCardHtml(renderPayload.noteType, renderPayload.note, renderPayload.card.ord, 'question', common);
        const answer = renderCardHtml(renderPayload.noteType, renderPayload.note, renderPayload.card.ord, 'answer', {
            ...common,
            omitFrontSide: true,
        });
        return {
            question: extractAnkiTtsSegments(question, false).length > 0,
            answer: extractAnkiTtsSegments(answer, false).length > 0,
        };
    }, [renderPayload]);
    const cardHasAudio = cardHasAttachedMedia || explicitTtsSides.question || explicitTtsSides.answer;
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
        return /<audio\b|<video\b/i.test(html) || extractAnkiTtsSegments(html, false).length > 0;
    }, [renderPayload]);

    // Pause is broadcast to both sides — stopping whatever is playing is always safe.
    const [pauseSignal, setPauseSignal] = useState(0);

    // Anki's "wait for audio" needs to know when a side has fallen silent. Each card frame
    // reports its own playback, and TTS is tracked alongside them; refs are enough because the
    // only reader is the auto-advance interval below.
    const questionAudioActiveRef = useRef(false);
    const answerAudioActiveRef = useRef(false);
    const ttsActiveRef = useRef(false);
    const speechQueueRef = useRef<AnkiSpeechQueue | null>(null);
    if (!speechQueueRef.current) {
        speechQueueRef.current = new AnkiSpeechQueue({
            stop: Speech.stop,
            speak: Speech.speak,
            getAvailableVoices: Speech.getAvailableVoicesAsync,
            maximumInputLength: Speech.maxSpeechInputLength,
        }, (active) => {
            ttsActiveRef.current = active;
        });
    }
    const anyAudioActive = () => questionAudioActiveRef.current
        || answerAudioActiveRef.current
        || ttsActiveRef.current;

    // Which frame a replay signal is aimed at. 'auto' is the normal rule (the visible side);
    // the explicit values drive Anki's replay-question-then-answer chain.
    const [replayTarget, setReplayTarget] = useState<'auto' | 'question' | 'answer'>('auto');
    const replayChainRef = useRef(false);
    const handleQuestionAudioActive = useCallback((active: boolean) => {
        questionAudioActiveRef.current = active;
        // The question's sounds have finished — hand the chain over to the answer's own frame.
        if (!active && replayChainRef.current) {
            replayChainRef.current = false;
            setReplayTarget('answer');
            setAudioSignal((value) => value + 1);
        }
    }, []);
    const handleAnswerAudioActive = useCallback((active: boolean) => {
        answerAudioActiveRef.current = active;
    }, []);

    // Anki's reviewer top bar: a back arrow leaves study, and flag/more open the options sheet
    // (the flag button jumps straight to the color list).
    const handleExitStudy = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.push('/decks');
    }, [router]);
    const openDeckPicker = useCallback(() => setDeckPickerVisible(true), []);
    const handlePickDeck = useCallback((name: string | null) => {
        setDeckPickerVisible(false);
        setSelectedDeckName(name);
    }, []);
    const deckPickerItems = useMemo(() => {
        try {
            return getAllDecks()
                .sort((a, b) => a.name.localeCompare(b.name, locale));
        } catch (e) {
            console.warn('[Study] deck picker list failed:', e);
            return [];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectionVersion, locale]);
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
    const handleClearWhiteboard = useCallback(() => whiteboardRef.current?.requestClear(), []);
    const handleSaveWhiteboard = useCallback(() => { void whiteboardRef.current?.save(); }, []);
    const handleDisableWhiteboard = useCallback(() => {
        whiteboardRef.current?.clear();
        setWhiteboardActive(false);
    }, []);

    // --- Text to speech (Anki / AnkiDroid) ---
    const stopSpeech = useCallback(() => {
        void speechQueueRef.current?.stop();
    }, []);
    const speakSide = useCallback((answerSide: boolean) => {
        if (!renderPayload) return;
        const html = renderCardHtml(renderPayload.noteType, renderPayload.note, renderPayload.card.ord, answerSide ? 'answer' : 'question', {
            deckName: renderPayload.deck?.name,
            clozeOrd: renderPayload.card.ord + 1,
            // AnkiDroid's whole-card reader reads the newly revealed answer, not FrontSide twice.
            omitFrontSide: answerSide,
        });
        const segments = extractAnkiTtsSegments(html);
        if (segments.length === 0) return;
        void speechQueueRef.current?.play(
            segments,
            locale === 'tr' ? 'tr-TR' : 'en-US',
            Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
                ? Platform.OS
                : 'unknown',
        );
    }, [renderPayload, locale]);
    const handleToggleVoicePlayback = useCallback(() => {
        setVoicePlaybackEnabled((enabled) => {
            if (enabled) stopSpeech();
            return !enabled;
        });
    }, [stopSpeech]);
    const replayAudio = useCallback(() => {
        // Anki's `replayq`: replaying on the answer side normally plays the question's sounds
        // first and the answer's afterwards. "Skip question when replaying answer" turns that
        // off, and so does a back that carries no sound of its own — there is nothing to chain to.
        const chainQuestionFirst = showingAnswer
            && !cardDeckOptions.skipQuestionWhenReplayingAnswer
            && answerSideHasAudio;
        replayChainRef.current = chainQuestionFirst;
        setReplayTarget(chainQuestionFirst ? 'question' : 'auto');
        setAudioSignal((value) => value + 1);
        // Built-in {{tts}} regions are AV tags in Anki, so R / Replay Audio must replay them even
        // when whole-card text reading is off. Whole-card fallback is replayed only when enabled.
        const sideHasExplicitTts = showingAnswer ? explicitTtsSides.answer : explicitTtsSides.question;
        if (sideHasExplicitTts || (voicePlaybackEnabled && !cardHasAttachedMedia)) {
            speakSide(showingAnswer);
        }
    }, [
        showingAnswer,
        explicitTtsSides,
        voicePlaybackEnabled,
        cardHasAttachedMedia,
        speakSide,
        answerSideHasAudio,
        cardDeckOptions.skipQuestionWhenReplayingAnswer,
    ]);

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

    const runReviewGestureAction = useCallback((action: ReviewGestureAction) => {
        if (!currentCard || action === 'off') return;

        if (action === 'showAnswer') {
            if (!showingAnswer) setShowingAnswer(true);
            return;
        }

        const answerGrades: Partial<Record<ReviewGestureAction, Grade>> = {
            again: 1,
            hard: 2,
            good: 3,
            easy: 4,
        };
        const grade = answerGrades[action];
        if (grade) {
            // AnkiDroid answer actions flip the card first, then grade it when repeated on
            // the answer side. This prevents an unseen answer from being scored by accident.
            if (!showingAnswer) setShowingAnswer(true);
            else void answerCard(grade);
            return;
        }

        if (action === 'undo') void undoLast();
        else if (action === 'edit') handleEditNote();
        else if (action === 'mark') handleToggleMarkNote();
        else if (action === 'bury') handleBury();
        else if (action === 'suspend') handleSuspend();
        else if (action === 'replayAudio') replayAudio();
        else if (action === 'flag') openFlagMenu();
        else if (action === 'tools') openMoreMenu();
        else if (action === 'decks') router.replace('/decks' as any);
    }, [
        currentCard,
        showingAnswer,
        answerCard,
        undoLast,
        handleEditNote,
        handleToggleMarkNote,
        handleBury,
        handleSuspend,
        replayAudio,
        openFlagMenu,
        openMoreMenu,
        router,
    ]);

    const handleCardTap = useCallback((xRatio: number, yRatio: number) => {
        if (!settings.ninePointTouchEnabled || !currentCard || whiteboardActive) return;
        const zone = reviewTapZoneAt(xRatio, yRatio);
        const actions = showingAnswer
            ? settings.answerTapActions ?? DEFAULT_ANSWER_TAP_ACTIONS
            : settings.questionTapActions ?? DEFAULT_QUESTION_TAP_ACTIONS;
        runReviewGestureAction(actions[zone]);
    }, [
        settings.ninePointTouchEnabled,
        settings.questionTapActions,
        settings.answerTapActions,
        currentCard,
        whiteboardActive,
        showingAnswer,
        runReviewGestureAction,
    ]);

    const gesturePanResponder = useMemo(() => {
        const shouldHandleGesture = (_event: unknown, gesture: { dx: number; dy: number; x0: number }) => {
            if (!settings.gesturesEnabled || !currentCard || whiteboardActive) return false;
            const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6;
            if (horizontal && Math.abs(gesture.dx) > 12) {
                return (gesture.dx > 0
                    ? settings.swipeRightAction ?? 'decks'
                    : settings.swipeLeftAction ?? 'tools') !== 'off';
            }
            const vertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.6;
            // AnkiMobile reserves vertical review gestures for the screen edges so long-card
            // scrolling and text selection continue to work through the center of the card.
            const beganAtVerticalEdge = gesture.x0 <= 36 || gesture.x0 >= width - 36;
            if (vertical && beganAtVerticalEdge && Math.abs(gesture.dy) > 12) {
                return (gesture.dy > 0
                    ? settings.swipeDownAction ?? 'off'
                    : settings.swipeUpAction ?? 'off') !== 'off';
            }
            return false;
        };

        return PanResponder.create({
            onMoveShouldSetPanResponder: shouldHandleGesture,
            // A parent ScrollView normally wins vertical drags on iOS. Capture only when the user
            // explicitly assigned an up/down action; "off" keeps normal long-card scrolling intact.
            onMoveShouldSetPanResponderCapture: shouldHandleGesture,
            onPanResponderRelease: (_event, gesture) => {
                if (!settings.gesturesEnabled || !currentCard || whiteboardActive) return;
                const threshold = swipeThresholdForSensitivity(settings.swipeSensitivity);
                const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy);
                if (!horizontal && gesture.x0 > 36 && gesture.x0 < width - 36) return;
                const distance = horizontal ? Math.abs(gesture.dx) : Math.abs(gesture.dy);
                if (distance < threshold) return;
                const action = horizontal
                    ? (gesture.dx > 0 ? settings.swipeRightAction ?? 'decks' : settings.swipeLeftAction ?? 'tools')
                    : (gesture.dy > 0 ? settings.swipeDownAction ?? 'off' : settings.swipeUpAction ?? 'off');
                runReviewGestureAction(action);
            },
        });
    }, [
        settings.gesturesEnabled,
        settings.swipeSensitivity,
        settings.swipeLeftAction,
        settings.swipeRightAction,
        settings.swipeUpAction,
        settings.swipeDownAction,
        currentCard,
        whiteboardActive,
        width,
        runReviewGestureAction,
    ]);

    // The whiteboard resets on each new card, mirroring AnkiDroid (ink clears as the card advances).
    useEffect(() => { whiteboardRef.current?.clear(); }, [currentCard?.cardId]);

    // One automatic TTS owner covers both whole-card reading and explicit Anki template tags.
    // The short debounce lets React discard superseded side/card effects before native speech is
    // enqueued; the generation-safe queue then serializes stop -> speak across the native bridge.
    useEffect(() => {
        const sideHasExplicitTts = showingAnswer ? explicitTtsSides.answer : explicitTtsSides.question;
        const shouldReadWholeCard = voicePlaybackEnabled;
        const shouldAutoPlayExplicitTts = scopeSettings.autoPlayAudio && sideHasExplicitTts;
        if (!shouldReadWholeCard && !shouldAutoPlayExplicitTts) return;
        const timer = setTimeout(() => speakSide(showingAnswer), shouldReadWholeCard ? 120 : 450);
        return () => {
            clearTimeout(timer);
            stopSpeech();
        };
    }, [
        voicePlaybackEnabled,
        scopeSettings.autoPlayAudio,
        showingAnswer,
        currentCard?.cardId,
        explicitTtsSides,
        speakSide,
        stopSpeech,
    ]);

    useEffect(() => stopSpeech, [stopSpeech]);

    // A stale signal must not leak into the next side/card: without this reset, the answer
    // WebView would mount with a nonzero signal (from an earlier R press) and play unasked.
    // Anki's "interrupt current audio when answering": flipping or moving to the next card
    // also stops whatever is still playing (the question WebView persists across cards).
    useEffect(() => {
        setAudioSignal(0);
        replayChainRef.current = false;
        setReplayTarget('auto');
        questionAudioActiveRef.current = false;
        answerAudioActiveRef.current = false;
        if (settings.interruptAudioOnAnswer) {
            setPauseSignal((value) => value + 1);
            stopSpeech();
        }
    }, [currentCard?.cardId, showingAnswer, settings.interruptAudioOnAnswer, stopSpeech]);

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
    }, [selectedDeckName, collectionVersion]);

    const reviewerDeckTitle = useMemo(() => {
        if (!selectedDeckName) return l('Bugünün kartları', 'Cards for Today');
        const displayName = getDeckDisplayName(selectedDeckName);
        const selectedDeck = getDeckByName(selectedDeckName);
        return selectedDeck?.isFiltered
            ? localizeFilteredDeckDisplayName(displayName, locale)
            : displayName;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDeckName, collectionVersion, locale, l]);

    // Present only for note types whose template embeds {{type:Field}} (built-in or custom).
    // Depending on the preference, the trusted input is either inserted at the template marker
    // or rendered as a native field alongside the card. Both paths feed the same answer diff.
    const typeAnswerField = !settings.neverTypeAnswer && renderPayload
        ? getTypeAnswerField(renderPayload.noteType.templates[renderPayload.card.ord])
        : null;
    const typeAnswerInCard = Boolean(typeAnswerField && settings.typeAnswerInCard);
    const submitTypedAnswer = useCallback((value: string) => {
        setTypedAnswer(value);
        setShowingAnswer(true);
    }, []);

    useEffect(() => {
        if (Platform.OS === 'web' || !typeAnswerField || typeAnswerInCard
            || settings.focusTypeAnswer === false || showingAnswer
            || optionsMenuVisible || deckPickerVisible) return;
        const timer = setTimeout(() => nativeTypeAnswerRef.current?.focus(), 50);
        return () => clearTimeout(timer);
    }, [
        currentCard?.cardId,
        typeAnswerField,
        typeAnswerInCard,
        settings.focusTypeAnswer,
        showingAnswer,
        optionsMenuVisible,
        deckPickerVisible,
    ]);

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
        if (Platform.OS === 'web' || pathname !== '/' || !currentCard || optionsMenuVisible || deckPickerVisible || catalogUnlockVisible) {
            nativeShortcutCaptureRef.current?.blur();
            return;
        }
        if (typeAnswerField && !showingAnswer && settings.focusTypeAnswer !== false) {
            nativeShortcutCaptureRef.current?.blur();
            return;
        }
        const timer = setTimeout(() => nativeShortcutCaptureRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [
        pathname,
        currentCard?.cardId,
        showingAnswer,
        optionsMenuVisible,
        deckPickerVisible,
        catalogUnlockVisible,
        typeAnswerField,
        settings.focusTypeAnswer,
    ]);

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>{t('common.loading')}</Text>
                </View>
            </View>
        );
    }

    const preview = getPreview();
    const subject = currentCard ? findSubject(currentCard.subject) : null;
    const answerScale = (settings.answerButtonScalePercent ?? 100) / 100;
    const gradeButton = (grade: Grade, label: string, time: string, color: string) => (
        <TouchableOpacity
            key={grade}
            style={[
                styles.answerBtn,
                settings.twoRowAnswerButtons && styles.answerBtnTwoRow,
                { backgroundColor: color, borderColor: color, minHeight: 52 * answerScale },
            ]}
            onPress={() => answerCard(grade)}
            accessibilityRole="button"
            accessibilityLabel={l(`${label}, sonraki gösterim ${time}`, `${label}, next review ${time}`)}
        >
            {settings.showNextReviewTimes && <Text numberOfLines={1} style={[styles.btnTime, { fontSize: FontSize.xs * answerScale }]}>{time}</Text>}
            <Text numberOfLines={1} style={[styles.btnLabel, { fontSize: (isCompact ? 14 : 16) * answerScale }]}>{label}</Text>
        </TouchableOpacity>
    );
    // Reserve the measured compact toolbar (and its optional palette) above the question. The
    // fallback protects the first frame before native layout measurement arrives.
    const whiteboardTopInset = whiteboardActive
        ? Math.max(whiteboardToolbarHeight, 52) + Spacing.md
        : 0;
    const isTrialCatalogScope = getBkaCatalogTier() === 'trial'
        && Boolean(selectedDeckName && getDeckByName(selectedDeckName)?.catalogPack === BKA_CATALOG_PACK);
    const trialPurchaseAction = isTrialCatalogScope ? (
        <TouchableOpacity
            style={styles.catalogPurchaseBtn}
            onPress={() => setCatalogUnlockVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={l('TUS Kartları tam paketini ücretsiz aç', 'Unlock the full TUS Cards package for free')}
        >
            <Text style={styles.catalogPurchaseBtnText}>🔓 {l('Tam paketi ücretsiz açın', 'Unlock the Full Pack for Free')}</Text>
            <Text style={styles.catalogPurchaseBtnHint}>
                {l('Ödeme olmadan 9.583 kartın tamamına erişin', 'Access all 9,583 cards without payment')}
            </Text>
        </TouchableOpacity>
    ) : null;

    const gradePresentation: Record<Grade, { label: string; time: string; color: string }> | null = preview ? {
        1: { label: t('anki.again'), time: preview.again, color: colors.btnAgain },
        2: { label: t('anki.hard'), time: preview.hard, color: colors.btnHard },
        3: { label: t('anki.good'), time: preview.good, color: colors.btnGood },
        4: { label: t('anki.easy'), time: preview.easy, color: colors.btnEasy },
    } : null;
    const answerButtons = showingAnswer && gradePresentation && settings.showAnswerButtons !== false ? (
        <View style={[styles.answerButtons, settings.twoRowAnswerButtons && styles.answerButtonsTwoRows]}>
            {visibleReviewerGrades(Boolean(settings.hideHardAndEasy)).map((grade) => {
                const presentation = gradePresentation[grade];
                return gradeButton(grade, presentation.label, presentation.time, presentation.color);
            })}
        </View>
    ) : null;

    const newStudyScreenEnabled = Boolean(settings.newStudyScreenEnabled);
    const toolbarPosition = newStudyScreenEnabled
        ? normalizeReviewerToolbarPosition(settings.reviewerToolbarPosition)
        : 'top';
    const hasFixedReviewControls = Boolean(currentCard && (!showingAnswer || answerButtons));
    const feedbackBottom = Math.max(insets.bottom, Spacing.md)
        + (hasFixedReviewControls ? (isCompact ? 78 : 86) : 0)
        + (toolbarPosition === 'bottom' && settings.showStudyTopBar !== false ? 54 : 0);
    const reviewerToolbar = newStudyScreenEnabled && settings.showStudyTopBar !== false ? (
        <View
            style={[
                styles.reviewerToolbar,
                toolbarPosition === 'top'
                    ? { paddingTop: insets.top }
                    : (!hasFixedReviewControls ? { paddingBottom: insets.bottom } : null),
            ]}
            accessibilityRole="toolbar"
        >
            <TouchableOpacity
                style={styles.toolbarIconButton}
                onPress={handleExitStudy}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel={l('Deste listesine dön', 'Back to deck list')}
                {...webTitle(l('Geri', 'Back'))}
            >
                <ReviewerBackIcon color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.toolbarScopeButton}
                onPress={openDeckPicker}
                accessibilityRole="button"
                accessibilityLabel={l(
                    `Deste seç. Geçerli kapsam: ${reviewerDeckTitle}`,
                    `Select deck. Current scope: ${reviewerDeckTitle}`,
                )}
                {...webTitle(l('Çalışılacak desteyi seç', 'Choose which deck to study'))}
            >
                {settings.showDeckTitle !== false && !isCompact ? (
                    <Text style={styles.toolbarDeckTitle} numberOfLines={1}>{reviewerDeckTitle}</Text>
                ) : null}
                {currentCard && settings.showRemainingCount ? (
                    <View
                        style={styles.queueCounts}
                        accessibilityLabel={l(
                            `${queueStats.newCount} yeni, ${queueStats.learningCount} öğrenme, ${queueStats.reviewCount} tekrar kartı`,
                            `${queueStats.newCount} new, ${queueStats.learningCount} learning, ${queueStats.reviewCount} review cards`,
                        )}
                    >
                        <Text style={[styles.queueCount, { color: colors.badgeNew }]}>{queueStats.newCount}</Text>
                        <Text style={[styles.queueCount, { color: colors.badgeLearn }]}>{queueStats.learningCount}</Text>
                        <Text style={[styles.queueCount, { color: colors.badgeReview }]}>{queueStats.reviewCount}</Text>
                    </View>
                ) : settings.showDeckTitle === false || isCompact ? (
                    <Text style={styles.toolbarDeckFallback}>▦</Text>
                ) : null}
                <DownChevron color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.toolbarStatusItems}>
                {autoAdvanceReminder ? (
                    <Text style={styles.autoAdvanceReminder} accessibilityLiveRegion="polite">
                        {l('Süre doldu', 'Time is up')}
                    </Text>
                ) : null}
                {cardDeckOptions.showTimer && currentCard ? (
                    <Text
                        style={styles.answerTimer}
                        accessibilityLabel={l(
                            `Bu kartta geçen süre: ${answerSeconds} saniye`,
                            `Time on this card: ${answerSeconds} seconds`,
                        )}
                    >{formatStopwatch(answerSeconds)}</Text>
                ) : null}
                {remainingMinutes !== null && !isCompact ? (
                    <Text
                        style={styles.remainingTime}
                        accessibilityLabel={l(
                            `Kalan tahmini süre: ${remainingMinutes} dakika`,
                            `Estimated time remaining: ${remainingMinutes} minutes`,
                        )}
                    >{l(`~${remainingMinutes} dk`, `~${remainingMinutes} min`)}</Text>
                ) : null}
            </View>

            {(currentCard || undoStack.length > 0) ? (
                <View style={styles.toolbarActions}>
                    <TouchableOpacity
                        style={[styles.toolbarIconButton, undoStack.length === 0 && styles.toolbarIconButtonDisabled]}
                        onPress={() => { void undoLast(); }}
                        disabled={undoStack.length === 0}
                        accessibilityRole="button"
                        accessibilityLabel={undoStack.length > 0
                            ? l('Son cevabı geri al', 'Undo last answer')
                            : l('Geri alınacak cevap yok', 'No answer to undo')}
                        accessibilityState={{ disabled: undoStack.length === 0 }}
                    >
                        <UndoReviewIcon color={undoStack.length > 0 ? colors.textSecondary : colors.textMuted} />
                    </TouchableOpacity>
                    {currentCard ? (
                        <>
                            <TouchableOpacity
                                style={styles.toolbarIconButton}
                                onPress={openFlagMenu}
                                accessibilityRole="button"
                                accessibilityLabel={l('Bayrakla işaretle', 'Flag card')}
                            >
                                <Text style={[styles.toolbarActionIcon, currentFlag > 0 && { color: FLAG_COLORS[currentFlag].color }]}>⚑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.toolbarIconButton}
                                onPress={openMoreMenu}
                                accessibilityRole="button"
                                accessibilityLabel={l('Kart ve not seçenekleri', 'Card and note options')}
                            >
                                <Text style={styles.toolbarActionIcon}>⋮</Text>
                            </TouchableOpacity>
                        </>
                    ) : null}
                </View>
            ) : null}
        </View>
    ) : null;

    const classicToolbar = !newStudyScreenEnabled && settings.showStudyTopBar !== false ? (
        <View style={[styles.classicToolbar, { paddingTop: insets.top }]} accessibilityRole="toolbar">
            <TouchableOpacity
                style={styles.toolbarIconButton}
                onPress={handleExitStudy}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel={l('Deste listesine dön', 'Back to deck list')}
            >
                <Text style={styles.classicBackIcon}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.classicTitleButton}
                onPress={openDeckPicker}
                accessibilityRole="button"
                accessibilityLabel={l(`Deste seç. Geçerli kapsam: ${reviewerDeckTitle}`, `Select deck. Current scope: ${reviewerDeckTitle}`)}
            >
                <Text style={styles.classicToolbarTitle} numberOfLines={1}>
                    {settings.showDeckTitle !== false ? reviewerDeckTitle : l('Bugünün Kartları', 'Cards for Today')}
                </Text>
                <DownChevron color={colors.textMuted} />
                {streak.current > 0 ? (
                    <View style={[styles.streakChip, !streak.studiedToday && styles.streakChipIdle]}>
                        <Text style={styles.streakChipText}>🔥 {streak.current}</Text>
                    </View>
                ) : null}
            </TouchableOpacity>
            {currentCard ? (
                <View style={styles.toolbarActions}>
                    <TouchableOpacity style={styles.toolbarIconButton} onPress={openFlagMenu} accessibilityRole="button" accessibilityLabel={l('Bayrakla işaretle', 'Flag card')}>
                        <Text style={[styles.toolbarActionIcon, currentFlag > 0 && { color: FLAG_COLORS[currentFlag].color }]}>⚑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.toolbarIconButton} onPress={openMoreMenu} accessibilityRole="button" accessibilityLabel={l('Kart ve not seçenekleri', 'Card and note options')}>
                        <Text style={styles.toolbarActionIcon}>⋮</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </View>
    ) : null;

    return (
        <View style={styles.container}>
            {settings.keepScreenOn ? <KeepAwakeGuard /> : null}
            {newStudyScreenEnabled && answerFeedback ? (
                <View
                    key={answerFeedback.nonce}
                    style={[
                        styles.answerFeedback,
                        styles.answerFeedbackLeft,
                        styles.answerFeedbackAgain,
                        { bottom: feedbackBottom },
                    ]}
                    pointerEvents="none"
                    accessibilityLiveRegion="polite"
                >
                    <Text style={styles.answerFeedbackText}>×</Text>
                </View>
            ) : null}
            {newStudyScreenEnabled ? (toolbarPosition === 'top' ? reviewerToolbar : null) : classicToolbar}

            <View
                style={[
                    styles.contentArea,
                    (settings.showStudyTopBar === false || (newStudyScreenEnabled && toolbarPosition === 'bottom')) && { paddingTop: insets.top },
                ]}
            >
            {!currentCard && deckDescription !== '' && (
                <Text style={styles.deckDescription} numberOfLines={2}>📝 {deckDescription}</Text>
            )}

            {whiteboardTopInset > 0 ? (
                // This participates in layout, so the scroll viewport itself begins below the
                // floating toolbar. The question therefore stays unobscured even while scrolling.
                <View style={{ height: whiteboardTopInset }} pointerEvents="none" />
            ) : null}

            <ScrollView
                ref={reviewerScrollRef}
                style={styles.cardScroll}
                contentContainerStyle={styles.cardArea}
            >
                {currentCard ? (
                    <View style={styles.cardContainer} {...gesturePanResponder.panHandlers}>
                        <View style={styles.cardMetaRow}>
                            <View style={styles.cardContext}>
                                <Text style={styles.cardSubject} numberOfLines={1}>
                                    {subject ? `${subject.icon} ${subject.name}` : '📝'}
                                </Text>
                                {currentCard.topic ? <Text style={styles.contextSeparator}>›</Text> : null}
                                {currentCard.topic ? (
                                    <Text style={styles.cardTopic} numberOfLines={1}>{currentCard.topic}</Text>
                                ) : null}
                                {previewMode ? (
                                    <View style={styles.previewBadge}>
                                        <Text style={styles.previewBadgeText}>{l('ÖNİZLEME', 'PREVIEW')}</Text>
                                    </View>
                                ) : null}
                            </View>
                            {streak.current > 0 ? (
                                <View
                                    style={[styles.streakChip, !streak.studiedToday && styles.streakChipIdle]}
                                    accessibilityLabel={l(`Günlük seri: ${streak.current} gün`, `Daily streak: ${streak.current} days`)}
                                >
                                    <Text style={styles.streakChipText}>🔥 {streak.current}</Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={[
                            styles.cardBody,
                            settings.studyFrameStyle === 'plain' && styles.cardBodyPlain,
                            settings.centerCardContent && styles.cardBodyCentered,
                        ]}>
                            {currentNoteMarked || currentFlag > 0 ? (
                                <View
                                    style={styles.cardIndicators}
                                    pointerEvents="none"
                                    accessible
                                    accessibilityLabel={[
                                        currentNoteMarked ? l('Not işaretli', 'Note marked') : '',
                                        currentFlag > 0 ? cardFlagName(locale, currentFlag) : '',
                                    ].filter(Boolean).join(', ')}
                                >
                                    <Text style={[styles.cardIndicator, styles.cardMarkIndicator, !currentNoteMarked && styles.cardIndicatorHidden]}>★</Text>
                                    <Text
                                        style={[
                                            styles.cardIndicator,
                                            currentFlag > 0 && { color: FLAG_COLORS[currentFlag].color },
                                            currentFlag === 0 && styles.cardIndicatorHidden,
                                        ]}
                                    >⚑</Text>
                                </View>
                            ) : null}
                            {renderPayload && !showingAnswer ? (
                                <CardWebView
                                    noteType={renderPayload.noteType}
                                    note={renderPayload.note}
                                    card={renderPayload.card}
                                    deck={renderPayload.deck}
                                    side="question"
                                    // On the answer side the signal falls back here only when the
                                    // back has no sound of its own (Anki's replay covers the front),
                                    // or when a replay chain is deliberately starting on the front.
                                    playAudioSignal={replayTarget === 'question'
                                        || (replayTarget === 'auto' && (!showingAnswer || !answerSideHasAudio))
                                        ? audioSignal
                                        : undefined}
                                    pauseAudioSignal={pauseSignal}
                                    onAudioActiveChange={handleQuestionAudioActive}
                                    cardZoomPercent={settings.cardZoomPercent}
                                    imageZoomPercent={settings.imageZoomPercent}
                                    showAudioPlayButtons={settings.showAudioPlayButtons}
                                    centerContent={settings.centerCardContent}
                                    frameStyle={settings.studyFrameStyle}
                                    scrollMode="intrinsic"
                                    typeAnswerInCard={typeAnswerInCard}
                                    autoFocusTypeAnswer={typeAnswerInCard && settings.focusTypeAnswer !== false}
                                    onTypedAnswerChange={typeAnswerInCard ? setTypedAnswer : undefined}
                                    onTypeAnswerSubmit={typeAnswerInCard ? submitTypedAnswer : undefined}
                                    onCardTap={settings.ninePointTouchEnabled ? handleCardTap : undefined}
                                />
                            ) : !renderPayload ? (
                                settings.ninePointTouchEnabled ? (
                                    <Pressable
                                        onLayout={(event) => setFallbackTapSurface(event.nativeEvent.layout)}
                                        onPress={(event) => handleCardTap(
                                            event.nativeEvent.locationX / fallbackTapSurface.width,
                                            event.nativeEvent.locationY / fallbackTapSurface.height,
                                        )}
                                    >
                                        <Text style={styles.questionText}>{currentCard.question}</Text>
                                    </Pressable>
                                ) : <Text style={styles.questionText}>{currentCard.question}</Text>
                            ) : null}

                            {typeAnswerField && !typeAnswerInCard && !showingAnswer && (
                                <TextInput
                                    ref={nativeTypeAnswerRef}
                                    style={styles.typeAnswerInput}
                                    value={typedAnswer}
                                    onChangeText={setTypedAnswer}
                                    placeholder={l('Yanıtınızı yazın…', 'Type your answer…')}
                                    placeholderTextColor={colors.textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    maxLength={MAX_TYPE_ANSWER_CHARS}
                                    returnKeyType="done"
                                    onSubmitEditing={() => submitTypedAnswer(typedAnswer)}
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
                                    playAudioSignal={replayTarget === 'answer'
                                        || (replayTarget === 'auto' && answerSideHasAudio)
                                        ? audioSignal
                                        : undefined}
                                    pauseAudioSignal={pauseSignal}
                                    onAudioActiveChange={handleAnswerAudioActive}
                                    cardZoomPercent={settings.cardZoomPercent}
                                    imageZoomPercent={settings.imageZoomPercent}
                                    showAudioPlayButtons={settings.showAudioPlayButtons}
                                    centerContent={settings.centerCardContent}
                                    frameStyle={settings.studyFrameStyle}
                                    scrollMode="intrinsic"
                                    onCardTap={settings.ninePointTouchEnabled ? handleCardTap : undefined}
                                />
                            ) : showingAnswer ? (
                                settings.ninePointTouchEnabled ? (
                                    <Pressable
                                        style={styles.answerSection}
                                        onLayout={(event) => setFallbackTapSurface(event.nativeEvent.layout)}
                                        onPress={(event) => handleCardTap(
                                            event.nativeEvent.locationX / fallbackTapSurface.width,
                                            event.nativeEvent.locationY / fallbackTapSurface.height,
                                        )}
                                    >
                                        <View style={styles.answerDivider} />
                                        <Text style={styles.answerText}>{currentCard.answer}</Text>
                                    </Pressable>
                                ) : (
                                    <View style={styles.answerSection}>
                                        <View style={styles.answerDivider} />
                                        <Text style={styles.answerText}>{currentCard.answer}</Text>
                                    </View>
                                )
                            ) : null}
                            {!newStudyScreenEnabled && !showingAnswer ? (
                                <TouchableOpacity
                                    style={[styles.showAnswerBtn, styles.classicInlineAnswerButton]}
                                    onPress={(settings.showAnswerLongPressMs ?? 0) === 0 ? () => setShowingAnswer(true) : undefined}
                                    onLongPress={(settings.showAnswerLongPressMs ?? 0) > 0 ? () => setShowingAnswer(true) : undefined}
                                    delayLongPress={settings.showAnswerLongPressMs ?? 0}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('anki.showAnswer')}
                                >
                                    <Text style={styles.showAnswerText}>👁️ {t('anki.showAnswer')}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        {!newStudyScreenEnabled && answerButtons ? (
                            <View style={styles.classicAnswerButtons}>{answerButtons}</View>
                        ) : null}
                        {!newStudyScreenEnabled ? (
                            <View style={styles.classicQueueInfo}>
                                {settings.showRemainingCount ? (
                                    <View style={styles.queueCounts}>
                                        <Text style={[styles.queueCount, { color: colors.badgeNew }]}>{queueStats.newCount}</Text>
                                        <Text style={styles.classicQueueSeparator}>+</Text>
                                        <Text style={[styles.queueCount, { color: colors.badgeLearn }]}>{queueStats.learningCount}</Text>
                                        <Text style={styles.classicQueueSeparator}>+</Text>
                                        <Text style={[styles.queueCount, { color: colors.badgeReview }]}>{queueStats.reviewCount}</Text>
                                    </View>
                                ) : null}
                                <Text style={styles.classicQueueText}>{l('Bugün', 'Today')}: {sessionStats.reviewed} {l('tekrar', 'reviews')}</Text>
                            </View>
                        ) : null}
                    </View>
                ) : nextLearningDue ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>⏳</Text>
                        <Text style={styles.emptyTitle}>{l('Şimdilik hepsi bu kadar!', 'That’s All for Now!')}</Text>
                        <Text style={styles.countdownText}>{countdown}</Text>
                        <Text style={styles.emptyDesc}>
                            {l('Şu anda hazır olan tüm kartları tamamladınız. ', 'You’ve completed every card currently available. ')}
                            {queueStats.learningCount > 0
                                ? l(
                                    `${queueStats.learningCount} öğrenme kartı zamanlayıcıda bekliyor`,
                                    `${queueStats.learningCount} learning ${queueStats.learningCount === 1 ? 'card is' : 'cards are'} waiting for the timer`,
                                )
                                : l('Bazı öğrenme kartları zamanlayıcıda bekliyor', 'Some learning cards are waiting for their timer')}
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
                            <Text style={styles.primaryActionText}>⚡ {l('Beklemeden çalış', 'Study Now')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => router.push('/settings')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Ayarları aç', 'Open settings')}
                        >
                            <Text style={styles.secondaryActionText}>⚙️ {l('Limit ve bekleme ayarları', 'Limits and learn-ahead settings')}</Text>
                        </TouchableOpacity>
                        {trialPurchaseAction}
                        <Text style={styles.emptySub}>
                            {l('Bugün', 'Today')} <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('kart tekrar edildi.', sessionStats.reviewed === 1 ? 'card was reviewed.' : 'cards were reviewed.')}
                        </Text>
                    </View>
                ) : dailyNewLimitReached ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyTitle}>{l('Günlük yeni kart limiti doldu', 'Daily New Card Limit Reached')}</Text>
                        <Text style={styles.emptyDesc}>
                            {l(
                                `Bugün ${sessionStats.newCardsToday || 0} yeni kart öğrendiniz.`,
                                `You learned ${sessionStats.newCardsToday || 0} new ${(sessionStats.newCardsToday || 0) === 1 ? 'card' : 'cards'} today.`,
                            )}
                            {heldBackNewCount > 0 ? l(
                                ` ${heldBackNewCount} yeni kart sırada — yarın otomatik olarak gösterilecek.`,
                                ` ${heldBackNewCount} new ${heldBackNewCount === 1 ? 'card is' : 'cards are'} queued and will appear automatically tomorrow.`,
                            ) : ''}
                            {l(' Devam etmek isterseniz limiti Ayarlar’dan artırabilirsiniz.', ' To continue, increase the limit in Settings.')}
                        </Text>
                        <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => router.push('/settings')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Ayarlardan limiti artır', 'Increase the limit in settings')}
                        >
                            <Text style={styles.secondaryActionText}>⚙️ {l('Limiti artır', 'Increase Limit')}</Text>
                        </TouchableOpacity>
                        {trialPurchaseAction}
                        <Text style={styles.emptySub}>
                            {l('Bugün', 'Today')} <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('kart tekrar edildi.', sessionStats.reviewed === 1 ? 'card was reviewed.' : 'cards were reviewed.')}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🎉</Text>
                        <Text style={styles.emptyTitle}>{l('Tebrikler!', 'Congratulations!')}</Text>
                        <Text style={styles.emptyDesc}>
                            {selectedTopic
                                ? l(
                                    `“${selectedTopic}” konusu için bugünlük tüm kartlar tamamlandı.`,
                                    `All cards in the “${selectedTopic}” topic are complete for today.`,
                                )
                                : selectedSubject
                                    ? l(
                                        `“${findSubject(selectedSubject)?.name ?? selectedSubject}” dersi için bugünlük tüm kartlar tamamlandı.`,
                                        `All cards in the “${findSubject(selectedSubject)?.name ?? selectedSubject}” subject are complete for today.`,
                                    )
                                    : l('Tüm dersler için bugünlük tüm kartlar tamamlandı.', 'All cards across all subjects are complete for today.')}
                        </Text>
                        {heldBackReviewCount > 0 && (
                            <Text style={styles.emptyInfo}>
                                {l(
                                    `📋 Günlük tekrar limiti doldu — ${heldBackReviewCount} tekrar kartı yarına kaldı.`,
                                    `📋 Today's review limit was reached — ${heldBackReviewCount} review cards are waiting for tomorrow.`,
                                )}
                            </Text>
                        )}
                        <Text style={styles.emptySub}>
                            {l('Bugün', 'Today')} <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> {l('kart tekrar edildi.', sessionStats.reviewed === 1 ? 'card was reviewed.' : 'cards were reviewed.')}
                        </Text>
                        {trialPurchaseAction}
                    </View>
                )}
            </ScrollView>

            {newStudyScreenEnabled && toolbarPosition === 'bottom' ? reviewerToolbar : null}

            {newStudyScreenEnabled && currentCard && (!showingAnswer || answerButtons) ? (
                <View
                    style={[
                        styles.reviewerAnswerArea,
                        { paddingBottom: Math.max(insets.bottom, isCompact ? Spacing.lg : Spacing.md) },
                    ]}
                >
                    {!showingAnswer ? (
                        <TouchableOpacity
                            style={styles.showAnswerBtn}
                            onPress={(settings.showAnswerLongPressMs ?? 0) === 0 ? () => setShowingAnswer(true) : undefined}
                            onLongPress={(settings.showAnswerLongPressMs ?? 0) > 0 ? () => setShowingAnswer(true) : undefined}
                            delayLongPress={settings.showAnswerLongPressMs ?? 0}
                            activeOpacity={0.82}
                            accessibilityRole="button"
                            accessibilityLabel={t('anki.showAnswer')}
                        >
                            <Text style={styles.showAnswerText}>{t('anki.showAnswer')}</Text>
                        </TouchableOpacity>
                    ) : answerButtons}
                </View>
            ) : null}

            {Platform.OS !== 'web' && pathname === '/' && currentCard && !optionsMenuVisible && !deckPickerVisible && !catalogUnlockVisible && (
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

            {currentCard && settings.showToolsOverlayButton && !optionsMenuVisible && !deckPickerVisible && !catalogUnlockVisible ? (
                <TouchableOpacity
                    style={[
                        styles.toolsOverlayButton,
                        settings.toolsOverlayPosition === 'left' ? styles.toolsOverlayLeft : styles.toolsOverlayRight,
                        { bottom: Math.max(insets.bottom, 12) + (hasFixedReviewControls ? 92 : 12) + (toolbarPosition === 'bottom' ? 54 : 0) },
                    ]}
                    onPress={openMoreMenu}
                    accessibilityRole="button"
                    accessibilityLabel={l('Araçlar', 'Tools')}
                >
                    <Text style={styles.toolsOverlayText}>⚙</Text>
                </TouchableOpacity>
            ) : null}

            {currentCard && (
                <WhiteboardOverlay
                    ref={whiteboardRef}
                    active={whiteboardActive}
                    stylusOnly={whiteboardStylusOnly}
                    onContentChange={setWhiteboardHasContent}
                    onToolbarHeightChange={setWhiteboardToolbarHeight}
                    toolbarTopOffset={0}
                    onDone={() => setWhiteboardActive(false)}
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
                title={l('Deste seç', 'Select Deck')}
                allDecksLabel={l('Tüm desteler', 'All Decks')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setDeckPickerVisible(false)}
                onSelect={handlePickDeck}
                onCreateDeck={(name) => {
                    const created = createDeck(getAvailableDeckName(name));
                    invalidateCollection();
                    return created.name;
                }}
            />
            <CatalogUnlockSheet
                visible={catalogUnlockVisible}
                onClose={() => setCatalogUnlockVisible(false)}
                onUnlocked={(rootDeckName) => {
                    setCatalogUnlockVisible(false);
                    setSelectedDeckName(rootDeckName);
                }}
            />
        </View>
    );
}

function createStyles(colors: ColorScheme, isCompact: boolean) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    hardwareKeyboardCapture: { position: 'absolute', width: 1, height: 1, left: -10, bottom: 0, opacity: 0 },
    answerFeedback: {
        position: 'absolute',
        zIndex: 300,
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.md,
    },
    answerFeedbackLeft: { left: Spacing.lg },
    answerFeedbackAgain: { backgroundColor: colors.btnAgain },
    answerFeedbackText: { color: colors.white, fontSize: 27, lineHeight: 31, fontWeight: '800' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
    loadingText: { fontSize: FontSize.md, color: colors.textMuted },

    reviewerToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 54,
        paddingHorizontal: isCompact ? Spacing.xs : Spacing.lg,
        backgroundColor: colors.bgCard,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.borderLight,
    },
    classicToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 62,
        paddingHorizontal: isCompact ? Spacing.xs : Spacing.lg,
        backgroundColor: colors.bgCard,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    classicBackIcon: { fontSize: 40, lineHeight: 42, fontWeight: '300', color: colors.accent },
    classicTitleButton: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.xs },
    classicToolbarTitle: { flexShrink: 1, fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    toolbarIconButton: { width: 42, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    toolbarIconButtonDisabled: { opacity: 0.34 },
    toolbarScopeButton: {
        flex: 1,
        minWidth: 56,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: isCompact ? 'center' : 'flex-start',
        gap: isCompact ? 7 : 10,
        paddingHorizontal: isCompact ? Spacing.xs : Spacing.sm,
    },
    toolbarDeckTitle: { minWidth: 0, maxWidth: 220, flexShrink: 1, fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary },
    toolbarDeckFallback: { fontSize: 19, color: colors.textMuted },
    toolbarStatusItems: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    toolbarActions: { flexDirection: 'row', alignItems: 'center' },
    toolbarActionIcon: { fontSize: 23, lineHeight: 25, color: colors.textSecondary },

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

    contentArea: { flex: 1, position: 'relative', overflow: 'hidden' },
    cardContext: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
    contextSeparator: { color: colors.textMuted, fontSize: FontSize.md },
    cardScroll: { flex: 1, minHeight: 0 },
    cardArea: {
        flexGrow: 1,
        paddingHorizontal: isCompact ? Spacing.md : Spacing.xxl,
        paddingVertical: isCompact ? Spacing.sm : Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardContainer: { width: '100%', maxWidth: 760, flexGrow: 1, justifyContent: 'center' },
    cardMetaRow: {
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: isCompact ? Spacing.xs : Spacing.sm,
        marginBottom: Spacing.xs,
    },

    cardSubject: { flexShrink: 0, maxWidth: isCompact ? 100 : 220, fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
    cardTopic: { flex: 1, minWidth: 0, fontSize: FontSize.sm, color: colors.textMuted },
    previewBadge: {
        flexShrink: 0,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
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
    cardBody: {
        position: 'relative',
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: isCompact ? Spacing.md : Spacing.xl,
        ...Shadows.md,
        minHeight: isCompact ? 220 : 260,
    },
    cardBodyPlain: {
        borderWidth: 0,
        borderRadius: 0,
        backgroundColor: colors.bgPrimary,
        shadowOpacity: 0,
        elevation: 0,
    },
    cardBodyCentered: { minHeight: isCompact ? 320 : 420, justifyContent: 'center' },
    cardIndicators: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        right: Spacing.sm,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardIndicator: {
        width: 34,
        height: 34,
        borderRadius: 17,
        overflow: 'hidden',
        textAlign: 'center',
        lineHeight: 32,
        fontSize: 20,
        color: colors.textSecondary,
        backgroundColor: colors.bgSecondary,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    cardMarkIndicator: { color: colors.btnHard },
    cardIndicatorHidden: { opacity: 0 },
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
    toolsOverlayButton: {
        position: 'absolute',
        zIndex: 240,
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        ...Shadows.md,
    },
    toolsOverlayLeft: { left: Spacing.md },
    toolsOverlayRight: { right: Spacing.md },
    toolsOverlayText: { fontSize: 23, color: colors.accent },

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
        width: '100%',
        maxWidth: 760,
        minHeight: 54,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xl,
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.sm,
    },
    showAnswerText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
    classicInlineAnswerButton: { marginTop: Spacing.xl },
    classicAnswerButtons: { marginTop: Spacing.md },
    classicQueueInfo: { alignItems: 'center', gap: Spacing.xs, paddingTop: Spacing.md },
    classicQueueSeparator: { color: colors.textMuted, fontSize: FontSize.sm },
    classicQueueText: { color: colors.textMuted, fontSize: FontSize.sm },

    reviewerAnswerArea: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: isCompact ? Spacing.md : Spacing.xxl,
        paddingTop: Spacing.sm,
        paddingBottom: isCompact ? Spacing.lg : Spacing.md,
        backgroundColor: colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    answerButtons: { width: '100%', maxWidth: 760, flexDirection: 'row', gap: isCompact ? 6 : 10 },
    answerButtonsTwoRows: { flexWrap: 'wrap' },
    answerBtn: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 56,
        paddingVertical: isCompact ? 10 : 14,
        paddingHorizontal: 4,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        gap: 2,
        ...Shadows.sm,
    },
    answerBtnTwoRow: { flexBasis: '47%', flexGrow: 1 },
    btnTime: { color: colors.white, opacity: 0.78, fontSize: FontSize.xs, fontWeight: '700' },
    btnLabel: { color: colors.white, fontSize: isCompact ? 14 : 16, fontWeight: '800' },

    answerTimer: {
        flexShrink: 0,
        fontSize: FontSize.sm,
        fontWeight: '700',
        color: colors.textSecondary,
        fontVariant: ['tabular-nums'] as any,
    },
    autoAdvanceReminder: {
        flexShrink: 0,
        fontSize: FontSize.xs,
        fontWeight: '700',
        color: colors.btnHard,
        backgroundColor: colors.btnHardBg,
        borderRadius: BorderRadius.full,
        paddingHorizontal: 8,
        paddingVertical: 2,
        overflow: 'hidden',
    },
    remainingTime: { flexShrink: 0, fontSize: FontSize.sm, color: colors.textMuted, fontVariant: ['tabular-nums'] as any },
    queueCounts: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: isCompact ? 7 : 9 },
    queueCount: { fontSize: FontSize.md, fontWeight: '800', fontVariant: ['tabular-nums'] as any },

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
    catalogPurchaseBtn: {
        width: '100%',
        maxWidth: 420,
        marginTop: Spacing.lg,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.accent,
        alignItems: 'center',
    },
    catalogPurchaseBtnText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
    catalogPurchaseBtnHint: { color: colors.white, opacity: 0.82, fontSize: FontSize.xs, marginTop: 3 },
    emptySub: { fontSize: FontSize.md, color: colors.textSecondary, marginTop: Spacing.lg },
    });
}
