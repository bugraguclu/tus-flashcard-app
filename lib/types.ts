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
    // Common fields
    interval: number;
    repetition: number;
    dueDate: string;
    dueTime: number;
    status: 'new' | 'learning' | 'review';
    suspended: boolean;
    buried: boolean;

    // SM-2 specific
    easeFactor: number;
    learningStep: number;

    // FSRS specific
    stability: number;
    difficulty: number;
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

export type AlgorithmType = 'FSRS' | 'SM2' | 'EXPERIMENTAL';

export interface SchedulerEngine {
    name: string;
    description: string;
    schedule: (cardState: CardState, grade: Grade, settings: AppSettings) => ScheduleResult;
    previewIntervals: (cardState: CardState, settings: AppSettings) => IntervalPreview;
    initCardState: (settings: AppSettings) => Partial<CardState>;
}

export interface AppSettings {
    dailyNewLimit: number;
    learningSteps: number[];       // minutes
    graduatingInterval: number;    // days
    easyInterval: number;          // days
    startingEase: number;
    lapseNewInterval: number;
    algorithm: AlgorithmType;
    desiredRetention: number;      // FSRS: 0.9 = 90%
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
