import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnkiCard, Note } from './models';
import type { AppSettings, Card, CardState } from './types';

// Shared in-memory state for the mocked noteManager. createTusCard mints a fresh (timestamp-like)
// id the way the real one does; findTusCardIdByFirstField dedupes by exact question text.
const cardStore = new Map<number, AnkiCard>();
const questionByCardId = new Map<number, string>();
const created = { nextId: 1 };

function storedCard(id: number, overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id, noteId: id, deckId: 1, ord: 0, mod: 0, usn: -1,
        type: 0, queue: 0, due: 1, ivl: 0, factor: 0,
        reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        ...overrides,
    };
}

vi.mock('./db', () => ({
    getDB: () => ({
        execSync: () => {},
        runSync: () => {},
        getFirstSync: () => null, // migration flags unset -> migrations always run
    }),
}));

vi.mock('./noteManager', () => ({
    getAnkiCard: (id: number) => cardStore.get(id) ?? null,
    saveAnkiCard: (card: AnkiCard) => { cardStore.set(card.id, card); },
    findTusCardIdByFirstField: (question: string) => {
        for (const [id, q] of questionByCardId) {
            if (q.trim() === question.trim()) return id;
        }
        return null;
    },
    createTusCard: (input: { subject: string; topic: string; question: string; answer: string }) => {
        const id = 1_000_000 + created.nextId++;
        const card = storedCard(id);
        cardStore.set(id, card);
        questionByCardId.set(id, input.question);
        return { note: {} as Note, card };
    },
}));

// Import after the mocks are registered.
import { migrateLegacyCustomCardsToAnki, migrateLegacyCardStatesToAnki } from './legacyMigration';
import { ankiCardIdFromLegacyCardId } from './ankiState';

const settings: AppSettings = {
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10, 60],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseIntervalMultiplier: 0.7,
    minLapseInterval: 1,
    queueOrder: 'after',
    newCardOrder: 'sequential',
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    learnAheadMinutes: 0,
    algorithm: 'ANKI_V3',
};

function customCard(id: number, question: string): Card {
    return { id, subject: 'anatomi', topic: 'Genel', question, answer: `A-${question}` };
}

function reviewState(cardId: number): CardState {
    return {
        cardId,
        interval: 12,
        repetition: 5,
        dueDate: '2026-03-20',
        dueTime: 0,
        status: 'review',
        suspended: false,
        buried: false,
        easeFactor: 2.5,
        learningStep: -1,
        relearningStep: -1,
        lastReviewedAtMs: 0,
        elapsedDays: 0,
        lapses: 1,
    };
}

beforeEach(() => {
    cardStore.clear();
    questionByCardId.clear();
    created.nextId = 1;
});

describe('legacy custom-cards migration (dedupe + id map)', () => {
    it('dedupes by first field and records both new and duplicate ids (F2, A1)', () => {
        const result = migrateLegacyCustomCardsToAnki([
            customCard(111, 'Q1'),
            customCard(222, 'Q1'), // duplicate of 111
            customCard(333, 'Q2'),
        ]);

        expect(result.migratedCards).toBe(2);
        expect(result.duplicateCards).toBe(1);

        // The duplicate maps to the SAME anki card as the original, so its progress can still land.
        expect(result.legacyIdToAnkiCardId[222]).toBe(result.legacyIdToAnkiCardId[111]);
        expect(result.legacyIdToAnkiCardId[333]).not.toBe(result.legacyIdToAnkiCardId[111]);
        // Only two cards were actually created despite three inputs.
        expect(cardStore.size).toBe(2);
    });
});

describe('legacy card-state migration (id resolution + guards)', () => {
    it('routes custom-card progress through the id map (A1)', () => {
        const custom = migrateLegacyCustomCardsToAnki([customCard(111, 'Q1')]);
        const newId = custom.legacyIdToAnkiCardId[111];

        const result = migrateLegacyCardStatesToAnki(
            { '111': reviewState(111) },
            settings,
            {},
            custom.legacyIdToAnkiCardId,
        );

        expect(result.migratedCards).toBe(1);
        const migrated = cardStore.get(newId)!;
        expect(migrated.ivl).toBe(12);
        expect(migrated.type).toBe(2); // review
        // No phantom card was created at the raw legacy id.
        expect(cardStore.has(111)).toBe(false);
    });

    it('falls back to legacyId * 1000 for seeded cards and preserves that id (F1)', () => {
        const seededId = ankiCardIdFromLegacyCardId(5); // 5000
        cardStore.set(seededId, storedCard(seededId));

        const result = migrateLegacyCardStatesToAnki({ '5': reviewState(5) }, settings);

        expect(result.migratedCards).toBe(1);
        // Progress lands on 5000, and there is NO fork onto the raw legacy id 5.
        expect(cardStore.get(seededId)!.ivl).toBe(12);
        expect(cardStore.has(5)).toBe(false);
    });

    it('skips non-numeric legacy keys without crashing on NaN (F4)', () => {
        const result = migrateLegacyCardStatesToAnki({ abc: reviewState(0) }, settings);

        expect(result.migratedCards).toBe(0);
        expect(result.skippedCards).toBe(1);
        expect(cardStore.size).toBe(0);
    });
});
