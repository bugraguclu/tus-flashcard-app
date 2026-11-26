import { beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';

const holder = vi.hoisted(() => ({
    db: null as any,
}));

vi.mock('./db', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./db')>();
    return {
        ...actual,
        getDB: () => holder.db,
    };
});

import { initAnkiData } from './ankiInit';
import { getDeckListSnapshot } from './deckListSnapshot';
import { createDeck, deleteDeck, getAllDecks, getDeckByName } from './deckManager';
import { getAllNotes, getNoteType } from './noteManager';
import { collectionHasNotes } from './accountLocalState';
import { DEFAULT_SETTINGS } from './storage';
import { renderCardHtml } from './templates';
import {
    STARTER_DEMO_BASIC_DECK,
    STARTER_DEMO_CLINICAL_DECK,
    STARTER_DEMO_SEEDED_KEY,
    STARTER_DEMO_TAG,
    buildStarterDemoNoteFields,
    seedStarterDemoDecksIfFresh,
} from './starterDemoDecks';

async function createMemoryDb() {
    const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    const raw = new SQL.Database();
    raw.run(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE deck_configs (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0);
        CREATE TABLE note_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0);
        CREATE TABLE notes (id INTEGER PRIMARY KEY, noteTypeId INTEGER NOT NULL, sfld TEXT, csum INTEGER, tags TEXT, data TEXT NOT NULL, updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0);
        CREATE TABLE anki_cards (
            id INTEGER PRIMARY KEY, noteId INTEGER NOT NULL, deckId INTEGER NOT NULL,
            ord INTEGER DEFAULT 0, type INTEGER DEFAULT 0, queue INTEGER DEFAULT 0,
            due INTEGER DEFAULT 0, ivl INTEGER DEFAULT 0, factor INTEGER DEFAULT 2500,
            reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, "left" INTEGER DEFAULT 0,
            flags INTEGER DEFAULT 0, data TEXT NOT NULL, updated_at INTEGER, created_at INTEGER,
            usn INTEGER, tombstone INTEGER DEFAULT 0
        );
        CREATE TABLE revlog (id INTEGER PRIMARY KEY, cardId INTEGER, usn INTEGER, ease INTEGER, ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER);
        CREATE TABLE cards_fts (card_id TEXT, deck TEXT, front TEXT, back TEXT, tags TEXT);
        CREATE TABLE graves (oid INTEGER, type INTEGER, usn INTEGER);
        CREATE TABLE deleted_notes (id INTEGER PRIMARY KEY, deleted_at INTEGER, data TEXT);
        CREATE TABLE deleted_cards (id INTEGER PRIMARY KEY, deleted_at INTEGER, data TEXT);
        CREATE TABLE deleted_decks (id INTEGER PRIMARY KEY, deleted_at INTEGER, data TEXT);
    `);

    return {
        execSync(sql: string) {
            raw.exec(sql);
        },
        runSync(sql: string, ...params: any[]) {
            raw.run(sql, params);
        },
        getAllSync<T = any>(sql: string, ...params: any[]): T[] {
            const result = raw.exec(sql, params.length ? params : undefined);
            if (!result.length) return [];
            return result[0].values.map((values) => Object.fromEntries(
                result[0].columns.map((column, index) => [column, values[index]]),
            ) as T);
        },
        getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
            return this.getAllSync<T>(sql, ...params)[0] ?? null;
        },
    };
}

describe('starterDemoDecks', () => {
    beforeEach(async () => {
        holder.db = await createMemoryDb();
        initAnkiData();
    });

    it('seeds Temel Bilimler (expanded, 6 courses, 24 cards) and Klinik Bilimler (collapsed, 5 courses, 20 cards) on a fresh collection', () => {
        const result = seedStarterDemoDecksIfFresh();
        expect(result).toEqual({ seeded: true, decksCreated: 13, cardsCreated: 44 });

        const basic = getDeckByName(STARTER_DEMO_BASIC_DECK)!;
        const clinical = getDeckByName(STARTER_DEMO_CLINICAL_DECK)!;
        expect(basic.collapsed).toBe(false);
        expect(clinical.collapsed).toBe(true);

        const snapshot = getDeckListSnapshot(DEFAULT_SETTINGS);
        // Empty Varsayılan is hidden once starter decks exist.
        expect(snapshot.tree.map((node) => node.deck.name)).toEqual([
            STARTER_DEMO_BASIC_DECK,
            STARTER_DEMO_CLINICAL_DECK,
        ]);
        expect(snapshot.tree[0].newCount).toBe(24);
        expect(snapshot.tree[0].children.map((c) => c.deck.name)).toEqual([
            'Temel Bilimler::Anatomi',
            'Temel Bilimler::FHE',
            'Temel Bilimler::Biyokimya',
            'Temel Bilimler::Mikrobiyoloji',
            'Temel Bilimler::Patoloji',
            'Temel Bilimler::Farmakoloji',
        ]);
        expect(snapshot.tree[1].newCount).toBe(20);
        expect(snapshot.tree[1].children.map((c) => c.deck.name)).toEqual([
            'Klinik Bilimler::Dahiliye',
            'Klinik Bilimler::Pediatri',
            'Klinik Bilimler::Genel Cerrahi',
            'Klinik Bilimler::Küçük Stajlar',
            'Klinik Bilimler::Kadın Doğum',
        ]);

        // Starter demo cards do not suppress the one-time Welcome page.
        expect(collectionHasNotes()).toBe(false);

        // Every seeded note renders a valid Cloze question without scripts.
        const clozeType = getNoteType(3)!;
        const notes = getAllNotes();
        expect(notes).toHaveLength(44);
        for (const note of notes) {
            expect(note.tags).toEqual([STARTER_DEMO_TAG]);
            const html = renderCardHtml(clozeType, note, 0, 'question', { clozeOrd: 1 });
            expect(html).toMatch(/class="cloze"/);
            expect(html.toLowerCase()).not.toContain('<script');
        }
    });

    it('is idempotent and never re-adds deleted starter decks', () => {
        expect(seedStarterDemoDecksIfFresh().seeded).toBe(true);
        const clinical = getDeckByName(STARTER_DEMO_CLINICAL_DECK)!;
        deleteDeck(clinical.id);

        const second = seedStarterDemoDecksIfFresh();
        expect(second).toEqual({ seeded: false, decksCreated: 0, cardsCreated: 0 });
        expect(getDeckByName(STARTER_DEMO_CLINICAL_DECK)).toBeNull();
    });

    it('skips seeding when the learner already has custom decks', () => {
        createDeck('Kendi Destem');
        const result = seedStarterDemoDecksIfFresh();
        expect(result).toEqual({ seeded: false, decksCreated: 0, cardsCreated: 0 });
        expect(getAllDecks().map((d) => d.name).sort()).toEqual(['Kendi Destem', 'Varsayılan']);
        expect(
            holder.db.getFirstSync('SELECT value FROM settings WHERE key = ?', STARTER_DEMO_SEEDED_KEY)?.value,
        ).toBe('skipped');
    });

    it('converts multi-cloze demo parts so only activeCloze becomes {{c1::...}}', () => {
        const [text, extra] = buildStarterDemoNoteFields({
            id: 'test',
            deckId: 'anatomi',
            course: 'Anatomi',
            topic: '2026/2',
            activeCloze: 2,
            parts: [
                { type: 'text', value: 'A: ' },
                { type: 'cloze', index: 1, answer: 'First' },
                { type: 'text', value: '\nB: ' },
                { type: 'cloze', index: 2, answer: 'Second' },
            ],
            extra: 'Not',
        });
        expect(text).toBe('A: <b>First</b><br>B: {{c1::Second}}');
        expect(extra).toBe('Not');
    });
});
