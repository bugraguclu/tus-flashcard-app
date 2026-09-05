import type { AnkiCard, Note } from './models';
import type { FsrsMemoryState } from './fsrs';

/**
 * Simple flashcard shape used for legacy data and seed content.
 * Not the primary runtime card model — see AnkiCard in models.ts and StudyCard below.
 */
export interface Card {
    id: number;
    subject: string;
    topic: string;
    question: string;
    answer: string;
}

/**
 * A TUS subject grouping with its associated topics.
 * Note: Subject.id is a string slug (e.g. "anatomy"), unlike Card.id which is a numeric DB id.
 * The two id types are intentionally different and are not joined directly at the type level.
 */
export interface Subject {
    /** Slug identifier, e.g. "anatomy". */
    id: string;
    /** Display name shown in UI. */
    name: string;
    /** Single emoji character used as the subject's visual marker (e.g. "🫀"). */
    icon: string;
    /** Topics belonging to this subject. */
    topics: string[];
}

/** Anki's ReviewCardOrder, minus the two FSRS-only retrievability orders. */
export type ReviewSortOrder =
    | 'dueRandom'
    | 'dueThenDeck'
    | 'deckThenDue'
    | 'intervalsAsc'
    | 'intervalsDesc'
    | 'easeAsc'
    | 'easeDesc'
    | 'relativeOverdueness'
    | 'random'
    | 'added'
    | 'reverseAdded';

/**
 * Anki's AnswerAction: what Auto Advance does once the answer's dwell time expires.
 * 'showReminder' leaves the card in place and only nudges the learner.
 */
export type AutoAdvanceAnswerAction = 'bury' | 'again' | 'good' | 'hard' | 'showReminder';

/** What Auto Advance does when the question-side dwell time expires. */
export type AutoAdvanceQuestionAction = 'showAnswer' | 'showReminder';

/**
 * Anki's NewCardGatherPriority: which new cards are collected for today, and in what order they
 * arrive. The gather step runs before the sort step, so "order gathered" stays meaningful.
 */
export type NewCardGatherOrder =
    | 'deck'
    | 'deckThenRandomNotes'
    | 'ascendingPosition'
    | 'descendingPosition'
    | 'randomNotes'
    | 'randomCards';

/** Anki's NewCardSortOrder. */
export type NewCardSortOrder =
    | 'template'
    | 'noSort'
    | 'templateThenRandom'
    | 'randomNoteThenTemplate'
    | 'randomCard';

export interface CardState {
    cardId: number;

    interval: number;
    repetition: number;
    /** YYYY-MM-DD. Active for review/new cards. Set to today for learning cards (unused). */
    dueDate: string;
    /** Epoch ms. Active for learning cards (intra-day scheduling). Must be 0 for review/new. */
    dueTime: number;
    status: 'new' | 'learning' | 'review';
    suspended: boolean;
    buried: boolean;

    // Anki V3 scheduler fields
    easeFactor: number;
    learningStep: number;
    relearningStep: number;
    lastReviewedAtMs: number;
    elapsedDays: number;
    lapses: number;

    /**
     * FSRS memory state, when the card has one. Null/undefined means the card has never been
     * scheduled by FSRS, which is also how a brand-new card starts.
     */
    memoryState?: FsrsMemoryState | null;
    /** The desired retention the card was last scheduled with (Anki's `dr`). */
    desiredRetention?: number;
    /** The forgetting-curve decay the card was last scheduled with (Anki's `decay`). */
    decay?: number;
}

export interface ScheduleResult {
    interval: number;
    isLearning: boolean;
    minutesUntilDue?: number;
    /** Engine-specific state updates merged into cardState. */
    stateUpdates: Partial<CardState>;
}

export interface IntervalPreview {
    again: string;
    hard: string;
    good: string;
    easy: string;
    againMinutes: number;
    hardMinutes?: number;
}

/** 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type Grade = 1 | 2 | 3 | 4;

/**
 * The scheduler in use. FSRS replaces only the interval maths; learning steps, burying, limits
 * and the queue builder are shared, exactly as in Anki.
 */
export type AlgorithmType = 'ANKI_V3' | 'FSRS';

export interface SchedulerEngine {
    name: string;
    description: string;
    schedule: (cardState: CardState, grade: Grade, settings: AppSettings, nowMs?: number) => ScheduleResult;
    previewIntervals: (cardState: CardState, settings: AppSettings, nowMs?: number) => IntervalPreview;
}

/** 'system' follows the OS light/dark setting; 'light'/'dark' pin it. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** UI language preference. `system` follows the device locale at runtime. */
export type AppLanguage = 'system' | 'tr' | 'en';

/**
 * Single-character (or named, e.g. "Space") key bindings for the study screen, web only.
 * showAnswer reveals the card; again/hard/good/easy submit that grade once the answer is shown.
 */
export interface KeyBindings {
    showAnswer: string;
    again: string;
    hard: string;
    good: string;
    easy: string;
    /** Replay the shown side's audio (Anki: R). */
    replayAudio: string;
    /** Bury the current card (Anki: -). */
    buryCard: string;
    /** Suspend the current card (Anki: @). */
    suspendCard: string;
    /** Toggle the note's mark (Anki: *). */
    markNote: string;
}

export type ReviewGestureAction =
    | 'off'
    | 'showAnswer'
    | 'again'
    | 'hard'
    | 'good'
    | 'easy'
    | 'undo'
    /** Open the note editor with the current study deck as its destination. */
    | 'addNote'
    | 'edit'
    | 'mark'
    | 'bury'
    | 'suspend'
    | 'replayAudio'
    | 'flag'
    | 'tools'
    | 'decks';

/** Backwards-compatible name for settings/import code written before vertical gestures. */
export type ReviewSwipeAction = ReviewGestureAction;

export type ReviewTapZone =
    | 'topLeft'
    | 'topCenter'
    | 'topRight'
    | 'middleLeft'
    | 'middleCenter'
    | 'middleRight'
    | 'bottomLeft'
    | 'bottomCenter'
    | 'bottomRight';

export type ReviewTapActionMap = Record<ReviewTapZone, ReviewGestureAction>;

/** AnkiDroid-compatible "more than n reviews due" reminder thresholds. */
export type StudyNotificationThreshold = 0 | 10 | 25 | 50 | 75 | 100 | 150 | 200 | 500;

export interface AppSettings {
    language: AppLanguage;
    themeMode: ThemeMode;
    keyBindings: KeyBindings;
    /** Auto-reveal the answer a few seconds after a card appears, if the user hasn't already. */
    autoAdvance: boolean;
    /** Anki Preferences: stop the playing audio when the answer is shown or graded. */
    interruptAudioOnAnswer: boolean;
    /** Default audio playback speed (e.g. 0.75, 1.0, 1.25, 1.5, 2.0). */
    audioPlaybackRate?: number;
    /** Anki Preferences: show the remaining new/learning/review counts while studying. */
    showRemainingCount: boolean;
    /** Anki Preferences: show the next review time above each answer button. */
    showNextReviewTimes: boolean;
    /** AnkiDroid General: add new notes to the current deck or always to Default. */
    newCardDeckMode?: 'current' | 'default';
    /** AnkiDroid note-editor display/input preferences. */
    editorFontSize?: number;
    editorCapitalizeSentences?: boolean;
    editorToolbarVisible?: boolean;
    editorToolbarScrollable?: boolean;
    /** Convert an image pasted into the rich editor to a collection-owned PNG attachment. */
    pasteClipboardImagesAsPng?: boolean;
    /** Reviewer presentation preferences shared by the study screen and CardWebView. */
    /** Opt in to the redesigned reviewer; false keeps the established classic reviewer. */
    newStudyScreenEnabled?: boolean;
    studyFrameStyle?: 'card' | 'plain';
    showAudioPlayButtons?: boolean;
    showAnswerFeedback?: boolean;
    showAnswerButtons?: boolean;
    hideHardAndEasy?: boolean;
    showStudyTopBar?: boolean;
    /** Compact reviewer toolbar placement; the answer controls remain in their fixed footer. */
    reviewerToolbarPosition?: 'top' | 'bottom';
    /** AnkiMobile's floating Tools button, useful when the top toolbar is hidden. */
    showToolsOverlayButton?: boolean;
    toolsOverlayPosition?: 'left' | 'right';
    /** AnkiMobile's "Never Type Answer" preference. */
    neverTypeAnswer?: boolean;
    /** Put the trusted {{type:Field}} input at the template marker so #typeans CSS applies. */
    typeAnswerInCard?: boolean;
    /** Focus a visible typed-answer input when a new question opens. */
    focusTypeAnswer?: boolean;
    showDeckTitle?: boolean;
    centerCardContent?: boolean;
    showRemainingTime?: boolean;
    /** Anki's reviewer Timebox length in whole minutes (0-9999); zero disables it. */
    timeboxMinutes?: number;
    /** Prevent the device from sleeping while the reviewer is open. */
    keepScreenOn?: boolean;
    /** Touch reviewer controls. Nine-zone taps follow AnkiMobile's question/answer defaults. */
    ninePointTouchEnabled?: boolean;
    questionTapActions?: ReviewTapActionMap;
    answerTapActions?: ReviewTapActionMap;
    gesturesEnabled?: boolean;
    swipeSensitivity?: number;
    swipeLeftAction?: ReviewGestureAction;
    swipeRightAction?: ReviewGestureAction;
    swipeUpAction?: ReviewGestureAction;
    swipeDownAction?: ReviewGestureAction;
    /** Android-only AnkiDroid navigation conveniences. */
    fullScreenNavigationDrawer?: boolean;
    doubleBackToExit?: boolean;
    /** Accessibility scaling and accidental-tap protection. Values are percentages/ms. */
    cardZoomPercent?: number;
    imageZoomPercent?: number;
    answerButtonScalePercent?: number;
    twoRowAnswerButtons?: boolean;
    browserFontScalePercent?: number;
    /** AnkiDroid Appearance: show audio attachment names in browser question/answer text. */
    showBrowserAudioFilenames?: boolean;
    showAnswerLongPressMs?: number;
    answerDoubleTapMs?: number;
    /** Automatic local collection backup policy. */
    autoBackupEnabled?: boolean;
    backupIntervalMinutes?: number;
    backupDailyCopies?: number;
    backupWeeklyCopies?: number;
    backupMonthlyCopies?: number;
    /** AnkiMobile: show one local reminder at the selected time when reviews are waiting. */
    studyNotificationsEnabled?: boolean;
    /** Zero means any pending review; other values mean strictly more than that many reviews. */
    studyNotificationThreshold?: StudyNotificationThreshold;
    /** Local clock time used by the daily review reminder. */
    studyNotificationHour?: number;
    studyNotificationMinute?: number;
    dailyNewLimit: number;
    dailyReviewLimit: number;
    /** Minutes between learning steps for new cards. */
    learningSteps: number[];
    /** Minutes between relearning steps after a lapse. */
    lapseSteps: number[];
    /** Days until a learning card graduates to review. */
    graduatingInterval: number;
    /** Days assigned when a new card is answered "Easy" (skips learning). */
    easyInterval: number;
    startingEase: number;
    /**
     * Multiplier applied to a review card's interval when it lapses ("Again" on a review).
     * UNIT: a fraction in 0.0–1.0 (e.g. 0 = reset to minIvl, 0.7 = keep 70%) — NOT a 0–100 percent.
     * Persisted as DeckConfig.newIvlPercent and shown in the UI as a percentage, but always
     * stored and consumed as a fraction. Mirrors Anki's lapse `mult`.
     */
    lapseIntervalMultiplier: number;
    /** Minimum interval (days) after a lapse. Maps to Anki DeckConfig.minIvl. */
    minLapseInterval: number;
    /**
     * Where new cards sit relative to reviews (learning always comes first). Mirrors Anki's
     * new-card placement: 'mix' spreads new cards evenly through the reviews (Anki default),
     * 'before' shows all new cards ahead of reviews, 'after' shows them behind.
     */
    queueOrder: 'mix' | 'before' | 'after';
    newCardOrder: 'sequential' | 'random';
    /** Anki v3 "new card gather order". Configs written by older builds carry legacy names. */
    newCardGatherOrder: NewCardGatherOrder;
    /** Anki v3 "review sort order": due date + daily random tiebreak, or by interval length. */
    reviewSortOrder: ReviewSortOrder;
    /** Anki's "new card sort order": how gathered new cards are ordered before being served. */
    newCardSortOrder?: NewCardSortOrder;
    /** Anki v3 "interday learning/review order": where day-boundary learning cards sit. */
    interdayLearningMix?: 'mix' | 'before' | 'after';
    /** Play a card's [sound:] attachments automatically when the side is shown. */
    autoPlayAudio: boolean;
    /** Anki Audio: replaying on the answer side plays only the answer's own sounds. */
    skipQuestionWhenReplayingAnswer?: boolean;
    /** Anki Timers (per preset): show the elapsed answer timer while studying. */
    showAnswerTimer?: boolean;
    /** Anki Timers (per preset): cap recorded answer time, and the displayed timer, at this. */
    maxAnswerSeconds?: number;
    /** Anki Timers (per preset): freeze the timer as soon as the answer is revealed. */
    stopTimerOnAnswer?: boolean;
    /** Anki Auto Advance (per preset). Zero disables that step. */
    secondsToShowQuestion?: number;
    secondsToShowAnswer?: number;
    questionAction?: AutoAdvanceQuestionAction;
    waitForAudio?: boolean;
    answerAction?: AutoAdvanceAnswerAction;
    /**
     * Anki Daily Limits, collection-wide: when false, new cards also consume the review limit,
     * so a day's total workload never exceeds the review cap.
     */
    newCardsIgnoreReviewLimit?: boolean;
    /**
     * Anki Daily Limits, collection-wide: when true, a parent deck's limit still caps a subdeck
     * studied on its own. When false, only the selected deck and its descendants apply.
     */
    limitsStartFromTop?: boolean;
    /** Per-weekday review load factor, Monday-first (1 normal, 0.5 reduced, 0 none). */
    easyDays: number[];
    hardIntervalMultiplier: number;
    easyBonus: number;
    intervalModifier: number;
    maxInterval: number;
    /** Hour of day when the study day rolls over. Must be in the range 0..23. */
    dayRolloverHour: number;
    /**
     * Minutes an intraday learning card may be shown before its step timer expires, once there
     * is nothing else left to study. Mirrors Anki's collection preference `learn_ahead_secs`
     * (Anki defaults to 20 minutes; 0 always waits for the timer and shows the countdown).
     */
    learnAheadMinutes: number;
    algorithm: AlgorithmType;

    /**
     * FSRS. The toggle is collection-wide in Anki; the parameters, desired retention and the
     * historical-retention assumption belong to the deck preset.
     */
    fsrsEnabled?: boolean;
    /** 21 FSRS-6 parameters. An empty/short list means "use the shipped defaults". */
    fsrsParameters?: number[];
    /** Target recall probability at review time (0.70–0.99). */
    desiredRetention?: number;
    /** Assumed past retention when converting an SM-2 card that has no usable review log. */
    historicalRetention?: number;
    /** Reviews logged before this epoch-ms timestamp are ignored when deriving memory states. */
    ignoreRevlogsBeforeMs?: number;
    /**
     * Anki's "reschedule cards on change": whether enabling FSRS or re-optimizing also rewrites
     * existing due dates, rather than only affecting future answers.
     */
    fsrsRescheduleOnChange?: boolean;
    /** Anki's collection-wide "short-term scheduling with learning steps" switch. */
    fsrsShortTermWithSteps?: boolean;
}

export interface SessionStats {
    reviewed: number;
    correct: number;
    wrong: number;
    startTime: number;
    newCardsToday: number;
    date: string;
}

/** Card returned by the study queue — combines note content with scheduling state. */
export interface StudyCard {
    cardId: number;
    legacyCardId: number;
    noteId: number;
    deckId: number;
    subject: string;
    topic: string;
    question: string;
    answer: string;
    /** The note carries Anki's reserved "marked" tag (browser star / filters). */
    noteMarked: boolean;
    /** Card template ordinal, needed by Anki's new-card sort orders. */
    templateOrd: number;
    state: CardState;
    rawCard?: AnkiCard;
    /** Present on browser/detail reads to avoid one SQLite note lookup per rendered card. */
    rawNote?: Note;
    /**
     * Present only for a browser row in Notes mode. Anki treats that row as the note and
     * aggregates card-specific columns across every card generated by the note.
     */
    browserNoteSummary?: {
        cardCount: number;
        deckCount: number;
        deckNames: string[];
        totalReviews: number;
        totalLapses: number;
        averageIntervalDays: number | null;
        averageEaseFactor: number | null;
        suspendedCardCount: number;
        buriedCardCount: number;
        flaggedCardCount: number;
    };
}
