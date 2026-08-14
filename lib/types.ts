import type { AnkiCard } from './models';

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

export type AlgorithmType = 'ANKI_V3';

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

export interface AppSettings {
    language: AppLanguage;
    themeMode: ThemeMode;
    keyBindings: KeyBindings;
    /** Auto-reveal the answer a few seconds after a card appears, if the user hasn't already. */
    autoAdvance: boolean;
    /** Anki Preferences: stop the playing audio when the answer is shown or graded. */
    interruptAudioOnAnswer: boolean;
    /** Anki Preferences: show the remaining new/learning/review counts while studying. */
    showRemainingCount: boolean;
    /** Anki Preferences: show the next review time above each answer button. */
    showNextReviewTimes: boolean;
    /** AnkiDroid General: add new notes to the current deck or always to Default. */
    newCardDeckMode?: 'current' | 'default';
    /** Reviewer presentation preferences shared by the study screen and CardWebView. */
    studyFrameStyle?: 'card' | 'plain';
    showAudioPlayButtons?: boolean;
    showAnswerFeedback?: boolean;
    showAnswerButtons?: boolean;
    hideHardAndEasy?: boolean;
    showStudyTopBar?: boolean;
    showDeckTitle?: boolean;
    centerCardContent?: boolean;
    showRemainingTime?: boolean;
    answerButtonsPosition?: 'top' | 'bottom';
    /** App-owned local image URI used behind the reviewer. */
    studyBackgroundImageUri?: string | null;
    /** Anki's timebox reminder. Zero disables it. */
    timeboxMinutes?: number;
    /** Prevent the device from sleeping while the reviewer is open. */
    keepScreenOn?: boolean;
    /** Touch reviewer controls. Swipes are intentionally opt-in. */
    gesturesEnabled?: boolean;
    swipeSensitivity?: number;
    /** Accessibility scaling and accidental-tap protection. Values are percentages/ms. */
    cardZoomPercent?: number;
    imageZoomPercent?: number;
    answerButtonScalePercent?: number;
    twoRowAnswerButtons?: boolean;
    browserFontScalePercent?: number;
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
    /** Anki v3 "new card gather order": course/topic order (our default), raw position, or random. */
    newCardGatherOrder: 'topic' | 'position' | 'random';
    /** Anki v3 "review sort order": due date + daily random tiebreak, or by interval length. */
    reviewSortOrder: 'dueRandom' | 'intervalsAsc' | 'intervalsDesc';
    /** Play a card's [sound:] attachments automatically when the side is shown. */
    autoPlayAudio: boolean;
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
    state: CardState;
    rawCard?: AnkiCard;
}
