// Saving a note type creates the cards its notes are now missing, as Anki does when a front
// template changes or a card type is added, and never removes, moves or reschedules a card
// (https://docs.ankiweb.net/templates/generation.html#card-generation--deletion). The cases follow
// Anki 26.09.3 as probed by scripts/anki-oracle/notetype_card_generation.py: the new card joins its
// siblings' home deck, shares a new sibling's position or takes a fresh one, a note without cards
// gets none, and a cloze note gets a card only for a cloze number that has none.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, indexed: [] as number[] }));
vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: (card: { id: number }) => { holder.indexed.push(card.id); },
}));

import { BUILTIN_NOTE_TYPES, type AnkiCard, type NoteType } from './models';
import { CATALOG_INSTALL_KEY, CATALOG_PACK_ID } from './catalogRows';
import { createNote, getCardsForNote, saveAnkiCard } from './noteStore';
import { saveNoteType } from './noteTypeStore';
import { createDeck } from './deckStore';
import { addField, moveField, removeField, renameField, renameNoteType, setCss, updateTemplate } from './noteTypeEditor';
import { changesCardGeneration, generateMissingCardsForNoteType } from './noteTypeCardGeneration';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; holder.indexed.length = 0; });
afterEach(() => db.close());

const field = (name: string, ord: number) => ({ name, ord, sticky: false, rtl: false });

/** Card 2 exists only for notes that fill Extra. */
const CONDITIONAL: NoteType = {
    id: 9100,
    name: 'Conditional',
    kind: 'standard',
    fields: [field('Front', 0), field('Back', 1), field('Extra', 2)],
    templates: [
        { name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' },
        { name: 'Card 2', ord: 1, qfmt: '{{#Extra}}{{Back}}{{/Extra}}', afmt: '{{Front}}' },
    ],
    css: '',
    sortFieldIdx: 0,
    mod: 0,
};
const UNCONDITIONAL = updateTemplate(CONDITIONAL, 1, { qfmt: '{{Back}}' });
const CLOZE = BUILTIN_NOTE_TYPES.find((type) => type.kind === 'cloze' && type.name === 'Cloze')!;

const allCards = (): AnkiCard[] => db
    .getAllSync<{ data: string }>('SELECT data FROM anki_cards ORDER BY id')
    .map((row) => JSON.parse(row.data));
const ordsOf = (noteId: number) => getCardsForNote(noteId).map((card) => card.ord);

describe('generateMissingCardsForNoteType', () => {
    it('gives every note the card its changed front now renders, beside its sibling, as a new card', () => {
        const deckA = createDeck('A');
        const deckB = createDeck('B');
        const filtered = createDeck('Filtered');
        saveNoteType(CONDITIONAL);
        const fresh = createNote(CONDITIONAL, ['f1', 'b1', ''], deckA.id);
        const complete = createNote(CONDITIONAL, ['f2', 'b2', 'x'], deckA.id);
        const reviewed = createNote(CONDITIONAL, ['f3', 'b3', ''], deckB.id);
        const resting = createNote(CONDITIONAL, ['f4', 'b4', ''], deckA.id);
        const stillEmpty = createNote(CONDITIONAL, ['f5', '', ''], deckA.id);
        saveAnkiCard({ ...reviewed.cards[0], type: 2, queue: 2, ivl: 9, reps: 3, factor: 2500, due: 40 });
        // A review card lent to a filtered deck: its home is deck A.
        saveAnkiCard({ ...resting.cards[0], type: 2, queue: 2, ivl: 5, reps: 2, factor: 2500, deckId: filtered.id, odid: deckA.id, odue: 30, due: -1 });
        expect([fresh, reviewed, resting, stillEmpty].map(({ note }) => ordsOf(note.id))).toEqual([[0], [0], [0], [0]]);
        expect(ordsOf(complete.note.id)).toEqual([0, 1]);
        const before = allCards();
        const highestPosition = Math.max(...before.filter((card) => card.type === 0).map((card) => card.due));

        saveNoteType(UNCONDITIONAL);
        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(3);

        // Every card that existed is exactly as it was: deck, due, interval, queue.
        const after = allCards();
        expect(after.filter((card) => before.some((old) => old.id === card.id))).toEqual(before);
        const created = after.filter((card) => !before.some((old) => old.id === card.id));
        expect(created.map((card) => card.noteId).sort()).toEqual([fresh.note.id, reviewed.note.id, resting.note.id].sort());
        for (const card of created) {
            expect(card).toMatchObject({ ord: 1, type: 0, queue: 0, ivl: 0, reps: 0, lapses: 0, factor: 0, odid: 0, odue: 0, usn: -1 });
        }
        const createdFor = (noteId: number) => created.find((card) => card.noteId === noteId)!;
        // Beside the sibling; the one lent to a filtered deck is joined in its home deck.
        expect(createdFor(fresh.note.id).deckId).toBe(deckA.id);
        expect(createdFor(reviewed.note.id).deckId).toBe(deckB.id);
        expect(createdFor(resting.note.id).deckId).toBe(deckA.id);
        // A sibling that is still new shares its position; otherwise each note takes a fresh one.
        expect(createdFor(fresh.note.id).due).toBe(fresh.cards[0].due);
        const freshPositions = [createdFor(reviewed.note.id).due, createdFor(resting.note.id).due];
        expect(new Set(freshPositions).size).toBe(2);
        expect(Math.min(...freshPositions)).toBe(highestPosition + 1);
        // A front that is still empty gets no card, and a complete note no second one.
        expect(ordsOf(stillEmpty.note.id)).toEqual([0]);
        expect(ordsOf(complete.note.id)).toEqual([0, 1]);
        // The new cards are searchable.
        expect([...holder.indexed].sort()).toEqual(created.map((card) => card.id).sort());
    });

    it('adds nothing when it runs again', () => {
        const deck = createDeck('A');
        saveNoteType(CONDITIONAL);
        createNote(CONDITIONAL, ['f1', 'b1', ''], deck.id);
        createNote(CONDITIONAL, ['f2', 'b2', ''], deck.id);
        saveNoteType(UNCONDITIONAL);
        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(2);
        const once = allCards();

        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(0);
        expect(allCards()).toEqual(once);
    });

    it('leaves the notes of other types alone', () => {
        const deck = createDeck('A');
        saveNoteType(UNCONDITIONAL);
        const other = { ...CONDITIONAL, id: 9101, name: 'Other' };
        saveNoteType(other);
        const untouched = createNote(other, ['f', 'b', ''], deck.id);

        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(0);
        expect(ordsOf(untouched.note.id)).toEqual([0]);
    });

    it('gives a cloze note a card only for a cloze number that has none', () => {
        const deck = createDeck('A');
        const two = createNote(CLOZE, ['{{c1::one}} {{c2::two}}', ''], deck.id);
        const gap = createNote(CLOZE, ['{{c1::one}} {{c3::three}}', ''], deck.id);
        const noCloze = createNote(CLOZE, ['{{c2::two}}', ''], deck.id);
        // A gap as an earlier save left it, and a note whose text lost its cloze but kept the card.
        db.runSync('DELETE FROM anki_cards WHERE noteId = ? AND ord = 2', gap.note.id);
        db.runSync("UPDATE notes SET data = json_set(data, '$.fields[0]', 'plain') WHERE id = ?", noCloze.note.id);
        expect([two, gap, noCloze].map(({ note }) => ordsOf(note.id))).toEqual([[0, 1], [0], [1]]);

        // A second template is not a second card per note: a cloze type's cards come from the text.
        const changed: NoteType = {
            ...CLOZE,
            id: 9200,
            templates: [
                { ...CLOZE.templates[0], qfmt: '<i>{{cloze:Text}}</i>' },
                { name: 'Stray', ord: 1, qfmt: '{{cloze:Text}}?', afmt: '{{cloze:Text}}' },
            ],
        };
        saveNoteType(changed);
        db.runSync('UPDATE notes SET noteTypeId = ?', changed.id);

        expect(generateMissingCardsForNoteType(changed)).toBe(1);
        expect([two, gap, noCloze].map(({ note }) => ordsOf(note.id))).toEqual([[0, 1], [0, 2], [1]]);
        expect(getCardsForNote(gap.note.id)[1]).toMatchObject({ ord: 2, type: 0, queue: 0, deckId: deck.id, due: gap.cards[0].due });
    });

    it('skips a note the catalog locks and still serves the others', () => {
        const deck = createDeck('A');
        saveNoteType(CONDITIONAL);
        const locked = createNote(CONDITIONAL, ['f1', 'b1', ''], deck.id);
        const own = createNote(CONDITIONAL, ['f2', 'b2', ''], deck.id);
        db.runSync("UPDATE notes SET data = json_set(data, '$.catalogPack', ?) WHERE id = ?", CATALOG_PACK_ID, locked.note.id);
        saveNoteType(UNCONDITIONAL);

        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(1);
        expect(ordsOf(locked.note.id)).toEqual([0]);
        expect(ordsOf(own.note.id)).toEqual([0, 1]);

        // Once the catalog is bought its notes are the learner's to change, and get their card.
        db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', CATALOG_INSTALL_KEY, 'full');
        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(1);
        expect(getCardsForNote(locked.note.id)[1]).toMatchObject({ ord: 1, deckId: deck.id, catalogPack: CATALOG_PACK_ID });
    });

    it('skips a note that has no card at all', () => {
        const deck = createDeck('A');
        saveNoteType(CONDITIONAL);
        const cardless = createNote(CONDITIONAL, ['f1', 'b1', ''], deck.id);
        db.runSync('DELETE FROM anki_cards WHERE noteId = ?', cardless.note.id);
        saveNoteType(UNCONDITIONAL);

        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(0);
        expect(allCards()).toEqual([]);
    });

    it('skips a note whose stored data cannot be read', () => {
        const deck = createDeck('A');
        saveNoteType(CONDITIONAL);
        const broken = createNote(CONDITIONAL, ['f1', 'b1', ''], deck.id);
        const sound = createNote(CONDITIONAL, ['f2', 'b2', ''], deck.id);
        db.runSync("UPDATE notes SET data = '{' WHERE id = ?", broken.note.id);
        saveNoteType(UNCONDITIONAL);

        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(1);
        expect(ordsOf(broken.note.id)).toEqual([0]);
        expect(ordsOf(sound.note.id)).toEqual([0, 1]);
    });

    it('puts the card beside the first sibling when the siblings sit in different decks', () => {
        const deckA = createDeck('A');
        const deckB = createDeck('B');
        const three: NoteType = {
            ...CONDITIONAL,
            id: 9102,
            templates: [
                CONDITIONAL.templates[0],
                { name: 'Card 2', ord: 1, qfmt: '{{Back}}', afmt: '{{Front}}' },
                { name: 'Card 3', ord: 2, qfmt: '{{#Extra}}{{Front}}{{/Extra}}', afmt: '{{Back}}' },
            ],
        };
        saveNoteType(three);
        const { note, cards } = createNote(three, ['f', 'b', ''], deckA.id);
        saveAnkiCard({ ...cards[1], deckId: deckB.id });
        const changed = updateTemplate(three, 2, { qfmt: '{{Front}}!' });
        saveNoteType(changed);

        expect(generateMissingCardsForNoteType(changed)).toBe(1);
        expect(getCardsForNote(note.id).map((card) => [card.ord, card.deckId])).toEqual([[0, deckA.id], [1, deckB.id], [2, deckA.id]]);
    });

    it('keeps nothing when a card cannot be written', () => {
        const deck = createDeck('A');
        saveNoteType(CONDITIONAL);
        for (let i = 0; i < 3; i++) createNote(CONDITIONAL, [`f${i}`, `b${i}`, ''], deck.id);
        saveNoteType(UNCONDITIONAL);
        const before = allCards();
        const run = db.runSync;
        let inserts = 0;
        db.runSync = (sql: string, ...params: unknown[]) => {
            if (/INSERT INTO anki_cards/.test(sql) && ++inserts === 2) throw new Error('disk full');
            run(sql, ...params);
        };

        expect(() => generateMissingCardsForNoteType(UNCONDITIONAL)).toThrow('disk full');
        db.runSync = run;
        expect(allCards()).toEqual(before);
        // The transaction was closed: the walk can run again.
        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(3);
    });

    it('reads the cards once, not once per note, when no note lacks a card', () => {
        const deck = createDeck('A');
        saveNoteType(UNCONDITIONAL);
        for (let i = 0; i < 40; i++) createNote(UNCONDITIONAL, [`f${i}`, `b${i}`, ''], deck.id);
        let statements = 0;
        const counted = <T extends (...args: any[]) => any>(run: T) => ((...args: any[]) => { statements++; return run(...args); }) as T;
        db.getAllSync = counted(db.getAllSync);
        db.getFirstSync = counted(db.getFirstSync);
        db.runSync = counted(db.runSync);
        db.execSync = counted(db.execSync);

        expect(generateMissingCardsForNoteType(UNCONDITIONAL)).toBe(0);
        expect(statements).toBeLessThanOrEqual(2);
    });
});

describe('changesCardGeneration', () => {
    it('is true for what decides which cards a note has', () => {
        expect(changesCardGeneration(CONDITIONAL, UNCONDITIONAL)).toBe(true);
        expect(changesCardGeneration(CONDITIONAL, renameField(CONDITIONAL, 2, 'More'))).toBe(true);
        expect(changesCardGeneration(CONDITIONAL, addField(CONDITIONAL, 'Hint').noteType)).toBe(true);
        expect(changesCardGeneration(CONDITIONAL, removeField(CONDITIONAL, 2).noteType)).toBe(true);
        expect(changesCardGeneration(CONDITIONAL, moveField(CONDITIONAL, 2, 0).noteType)).toBe(true);
        expect(changesCardGeneration(CONDITIONAL, {
            ...CONDITIONAL,
            templates: [...CONDITIONAL.templates, { name: 'Card 3', ord: 2, qfmt: '{{Back}}?', afmt: '{{Front}}' }],
        })).toBe(true);
    });

    it('is false for a name, a back template and the styling', () => {
        expect(changesCardGeneration(CONDITIONAL, renameNoteType(CONDITIONAL, 'Renamed'))).toBe(false);
        expect(changesCardGeneration(CONDITIONAL, updateTemplate(CONDITIONAL, 1, { afmt: '{{Front}}<br>', name: 'Reverse' }))).toBe(false);
        expect(changesCardGeneration(CONDITIONAL, setCss(CONDITIONAL, '.card { color: red; }'))).toBe(false);
        expect(changesCardGeneration(CONDITIONAL, { ...CONDITIONAL })).toBe(false);
    });
});
