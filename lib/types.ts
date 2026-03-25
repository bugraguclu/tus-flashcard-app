// ============================================================
// TUS Flashcard - TypeScript Type Definitions
// ============================================================

export interface Card {
    id: number;
    subject: string;
    topic: string;
    question: string;
    answer: string;
}

export interface Subject {
    id: string;
    name: string;
    icon: string;
    topics: string[];
}

export interface CardState {
    // Bridge identifier used at CardState↔AnkiCard boundary.
    // TODO(boundary): when CardState is fully retired from hot paths, remove this.
    cardId?: number;

    // Common fields
    interval: number;
    repetition: number;
    dueDate: string;
    dueTime: number;
    status: 'new' | 'learning' | 'review';
    suspended: boolean;
    buried: boolean;

    // SM-2 / Anki specific
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
    // Engine-specific state updates merged into cardState
    stateUpdates: Partial<CardState>;
}

export interface IntervalPreview {
    again: string;
    hard: string;
    good: string;
    easy: string;
    againMinutes?: number;
    hardMinutes?: number;
}

export type Grade = 1 | 2 | 3 | 4; // Tekrar=1, Zor=2, İyi=3, Kolay=4

export type AlgorithmType = 'ANKI_V3';

export interface SchedulerEngine {
    name: string;
    description: string;
    schedule: (cardState: CardState, grade: Grade, settings: AppSettings, nowMs?: number) => ScheduleResult;
    previewIntervals: (cardState: CardState, settings: AppSettings, nowMs?: number) => IntervalPreview;
    initCardState: (settings: AppSettings) => Partial<CardState>;
}

export interface AppSettings {
    dailyNewLimit: number;
    dailyReviewLimit: number;
    learningSteps: number[];       // minutes for new cards
    lapseSteps: number[];          // minutes for relearning after a lapse
    graduatingInterval: number;    // days
    easyInterval: number;          // days
    startingEase: number;
    lapseNewInterval: number;
    minLapseInterval: number;          // minimum interval after a lapse (days), Anki DeckConfig.minIvl
    queueOrder: 'learning-review-new' | 'learning-new-review';
    newCardOrder: 'sequential' | 'random';
    hardIntervalMultiplier: number;
    easyBonus: number;
    intervalModifier: number;
    maxInterval: number;
    dayRolloverHour: number;
    algorithm: AlgorithmType;
}

export interface SessionStats {
    reviewed: number;
    correct: number;
    wrong: number;
    startTime: number;
    newCardsToday: number;
    date?: string;
}

export interface UndoEntry {
    cardId: number;
    previousState: CardState;
    card: Card;
}
