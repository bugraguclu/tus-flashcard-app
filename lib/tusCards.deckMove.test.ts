// The editor's deck picker moves a card like the browser's Change Deck:
// https://docs.ankiweb.net/browsing.html#cards (Change Deck); FSRS memory is re-derived later.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG } from './models';
import { createNote, getAnkiCard, saveAnkiCard } from './noteStore';
import { createDeck } from './deckStore';
import { assignDeckConfig, saveDeckConfig } from './deckPresets';
import { updateTusCardByCardId } from './tusCards';
import { memoryStateFromCardData, parseAnkiCardData, withFsrsMemoryState } from './fsrsCardData';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

function reviewedCard(deckId: number) {
    const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front', 'Back'], deckId);
    const ankiData = withFsrsMemoryState(undefined, { stability: 12, difficulty: 5 }, 0.9, 0.2);
    saveAnkiCard({ ...cards[0], type: 2, queue: 2, ivl: 12, reps: 4, ankiData });
    return getAnkiCard(cards[0].id)!;
}
const memory = (id: number) => memoryStateFromCardData(parseAnkiCardData(getAnkiCard(id)?.ankiData));

describe('editor deck change', () => {
    it('clears the FSRS memory state like Change Deck and keeps the schedule', () => {
        const from = createDeck('From');
        const to = createDeck('To');
        const card = reviewedCard(from.id);
        expect(memory(card.id)).toEqual({ stability: 12, difficulty: 5 });
        updateTusCardByCardId(card.id, { question: 'Front', answer: 'Back', deckId: to.id });
        expect(getAnkiCard(card.id)).toMatchObject({ deckId: to.id, ivl: 12, reps: 4, due: card.due });
        expect(memory(card.id)).toBeNull();
    });

    it('keeps the memory state when the deck is unchanged', () => {
        const deck = createDeck('Same');
        const card = reviewedCard(deck.id);
        updateTusCardByCardId(card.id, { question: 'Front edited', answer: 'Back', deckId: deck.id });
        expect(memory(card.id)).toEqual({ stability: 12, difficulty: 5 });
    });

    it('remaps remaining learning steps for a destination preset with other steps', () => {
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, learningSteps: [1, 10] });
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, learningSteps: [1, 10, 60] });
        const from = createDeck('From');
        const to = createDeck('To');
        assignDeckConfig(to.id, 2);
        const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front', 'Back'], from.id);
        saveAnkiCard({ ...cards[0], type: 1, queue: 1, left: 1 });
        updateTusCardByCardId(cards[0].id, { question: 'Front', answer: 'Back', deckId: to.id });
        expect(getAnkiCard(cards[0].id)?.left).toBe(2);
    });
});
