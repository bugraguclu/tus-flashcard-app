// Deck overview: https://docs.ankiweb.net/studying.html#overview-screen (description, Unbury)
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getAnkiCard, saveAnkiCard } from './noteStore';
import { createDeck, getBuriedKindsForDeck, unburyDeck } from './deckStore';
import { deckDescriptionText } from './deckNavigation';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

describe('Unbury by kind', () => {
    it('counts and unburies manual and sibling burials separately', () => {
        const deck = createDeck('Deck');
        const { cards } = createNote(BUILTIN_NOTE_TYPES.find(t => t.id === 2)!, ['F', 'B'], deck.id);
        saveAnkiCard({ ...cards[0], queue: -3 });
        saveAnkiCard({ ...cards[1], queue: -2 });
        expect(getBuriedKindsForDeck(deck.id)).toEqual({ manual: 1, siblings: 1 });
        expect(unburyDeck(deck.id, 4, 'manual')).toBe(1);
        expect(getAnkiCard(cards[0].id)?.queue).toBe(0);
        expect(getAnkiCard(cards[1].id)?.queue).toBe(-2);
        expect(unburyDeck(deck.id, 4, 'siblings')).toBe(1);
        expect(getBuriedKindsForDeck(deck.id)).toEqual({ manual: 0, siblings: 0 });
    });
});

describe('deck description text (DST-11)', () => {
    it('turns imported HTML into readable lines instead of raw tags', () => {
        expect(deckDescriptionText('<h2>TUS</h2><p>Kalp &amp; damar<br>notları</p><ul><li>Bir</li><li>İki</li></ul><style>.x{}</style>'))
            .toBe('TUS\n\nKalp & damar\nnotları\n\n• Bir\n\n• İki');
        expect(deckDescriptionText('Plain text')).toBe('Plain text');
    });
});
