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

/** Tekrar=1, Zor=2, İyi=3, Kolay=4 (Again, Hard, Good, Easy). */
export type Grade = 1 | 2 | 3 | 4;

export type AlgorithmType = 'ANKI_V3';

export interface SchedulerEngine {
    name: string;
    description: string;
    schedule: (cardState: CardState, grade: Grade, settings: AppSettings, nowMs?: number) => ScheduleResult;
    previewIntervals: (cardState: CardState, settings: AppSettings, nowMs?: number) => IntervalPreview;
}

export interface AppSettings {
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
     * Multiplier applied to current interval when a review card is answered "Again".
     * Range: 0.0 to 1.0 (e.g. 0 resets, 0.7 keeps 70% of the interval).
     * Maps to Anki DeckConfig.newIvlPercent.
     */
    lapseIntervalMultiplier: number;
    /** Minimum interval (days) after a lapse. Maps to Anki DeckConfig.minIvl. */
    minLapseInterval: number;
    queueOrder: 'learning-review-new' | 'learning-new-review';
    newCardOrder: 'sequential' | 'random';
    hardIntervalMultiplier: number;
    easyBonus: number;
    intervalModifier: number;
    maxInterval: number;
    /** Hour of day when the study day rolls over. Must be in the range 0..23. */
    dayRolloverHour: number;
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
    state: CardState;
    rawCard?: AnkiCard;
}
