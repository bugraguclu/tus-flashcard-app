// The collection-wide search scan: results identical to evaluating every card against its full
// note, note type and card blob, while the large note-type JSON (CSS and templates, twice for an
// imported type) is read once per type and note JSON only when the query reads note content.
// Search semantics: https://docs.ankiweb.net/searching.html (independently implemented).
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {} }));

import { cardAddedMs, matchingCollectionCardIds, noteEditedMs } from './collectionCardSearch';
import { compileCardMatcher } from './cardSearchMatch';
import { getBrowserCardCount, getBrowserRowIdsMatchingText } from './browserRepository';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';

const NOW = Date.now();
const TYPE_PADDING = 'x'.repeat(4000);

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
/** Every string cell any query handed back, so the test can see what crossed into JS. */
let cells: string[] = [];
let rowsRead = 0;

function recording(base: SyncDb): SyncDb {
    const record = <T>(rows: T[]): T[] => {
        rowsRead += rows.length;
        for (const row of rows) for (const value of Object.values(row as object)) if (typeof value === 'string') cells.push(value);
        return rows;
    };
    return {
        ...base,
        getAllSync: (sql: string, ...params: any[]) => record(base.getAllSync(sql, ...params)),
        getFirstSync: (sql: string, ...params: any[]) => {
            const row = base.getFirstSync(sql, ...params);
            if (row) record([row]);
            return row;
        },
    };
}

const typeJson = (id: number, name: string, templates: string[]) => JSON.stringify({
    id, name, kind: 'standard', sortFieldIdx: 0, mod: 0, css: `.card {} /* ${TYPE_PADDING} */`,
    fields: ['Front', 'Back'].map((field, ord) => ({ name: field, ord })),
    templates: templates.map((template, ord) => ({ name: template, ord, qfmt: `{{Front}}${TYPE_PADDING}`, afmt: '{{Back}}' })),
    ankiRaw: { css: TYPE_PADDING, tmpls: templates.map((template) => ({ name: template, qfmt: TYPE_PADDING })) },
});

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    const base = createAppDb(SQL);
    base.runSync('INSERT INTO note_types (id, name, data) VALUES (1, ?, ?)', 'Basic', typeJson(1, 'Basic', ['Card 1', 'Card 2']));
    base.runSync('INSERT INTO note_types (id, name, data) VALUES (2, ?, ?)', 'Imported', typeJson(2, 'Imported', ['Recto']));
    base.runSync('INSERT INTO note_types (id, name, data) VALUES (3, ?, ?)', 'Broken', '{not json');
    base.runSync('INSERT INTO decks (id, name, data) VALUES (1, ?, ?)', 'Tıp::Anatomi', '{}');
    base.runSync('INSERT INTO decks (id, name, data) VALUES (2, ?, ?)', 'Fizik', '{}');
    const notes: Array<[number, number, string, number]> = [];
    for (let id = 1; id <= 12; id++) {
        const tags = id % 3 === 0 ? [] : id % 3 === 1 ? ['marked', 'Ünite::İmmünoloji'] : ['fizik'];
        const fields = [`soru ${id} <b>résumé</b>`, id % 2 ? 'answer text' : 'başka cevap'];
        notes.push([id, id % 4 === 0 ? 2 : 1, JSON.stringify({ id, guid: `g${id}`, noteTypeId: 1, mod: id % 5 === 0 ? 1_700_000_000 + id : Math.floor((NOW - id * 3_600_000) / 1000), tags, fields }), id % 5 === 0 ? 0 : NOW - id * 3_600_000]);
    }
    notes.push([13, 1, '{broken', NOW]); // unreadable note
    notes.push([14, 1, JSON.stringify({ id: 14, tags: ['marked'] }), NOW]); // no field list
    notes.push([15, 3, JSON.stringify({ id: 15, tags: ['marked'], fields: ['soru'] }), NOW]); // unreadable note type
    notes.push([16, 9, JSON.stringify({ id: 16, tags: ['marked'], fields: ['soru'] }), NOW]); // missing note type
    for (const [id, typeId, data, editedAt] of notes) {
        base.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)', id, typeId, '', '', data, editedAt);
    }
    const today = localDayNumber(NOW, 4);
    let cardId = 100;
    for (const [noteId, typeId] of notes) {
        for (const ord of typeId === 1 ? [0, 1] : [0]) {
            cardId += 1;
            const review = cardId % 3 !== 0;
            const ankiData = cardId % 4 === 0 ? '' : JSON.stringify({ s: cardId % 20, d: 1 + (cardId % 9), lrt: Math.floor(NOW / 1000) - (cardId % 10) * 86_400 });
            const data = cardId === 105 ? '{broken card' : JSON.stringify({ id: cardId, ankiData, lastReview: NOW - 86_400_000 });
            base.runSync(
                `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
                cardId, noteId, cardId % 2 ? 1 : 2, ord, review ? 2 : 0, review ? (cardId % 5 === 0 ? -1 : 2) : 0,
                review ? today - 1 + (cardId % 3) : cardId, review ? cardId % 7 : 0, review ? 2500 : 0, cardId % 4, cardId % 3,
                cardId % 4, data, cardId % 6 === 0 ? 0 : NOW - (cardId % 4) * 86_400_000,
            );
        }
    }
    base.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data) VALUES (900, 1, 77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)', '{}');
    base.runSync('INSERT INTO revlog (id, cardId, ease, ivl, lastIvl, factor, time, type) VALUES (?, 102, 3, 1, 0, 2500, 1000, 0)', NOW - 1000);
    base.runSync('INSERT INTO revlog (id, cardId, ease, ivl, lastIvl, factor, time, type) VALUES (?, 103, 1, 1, 0, 2500, 1000, 1)', NOW - 2000);
    db = recording(base);
    h.db = db;
    cells = [];
    rowsRead = 0;
});

/** The evaluator before the scan was narrowed: every column, note and note type on every row. */
function referenceIds(query: string): number[] {
    const nowMs = Date.now();
    const matcher = compileCardMatcher(query, {
        today: localDayNumber(nowMs, 4), nowMs, learnAheadMinutes: 0, dayCutoffMs: nextRolloverMs(nowMs, 4) - 86_400_000,
        ratedWithin: (cardId, days, ease) => db.getAllSync<{ cardId: number }>(`SELECT cardId FROM revlog WHERE id >= ? AND ${ease === null ? 'ease > 0' : 'ease = ?'}`, nextRolloverMs(nowMs, 4) - days * 86_400_000, ...(ease === null ? [] : [ease])).some((row) => row.cardId === cardId),
        introducedWithin: (cardId, days) => db.getAllSync<{ cardId: number }>('SELECT cardId FROM revlog WHERE ease > 0 AND type IN (0, 1, 2) GROUP BY cardId HAVING MIN(id) >= ?', nextRolloverMs(nowMs, 4) - days * 86_400_000).some((row) => row.cardId === cardId),
    });
    const ids: number[] = [];
    for (const row of db.getAllSync<any>(`SELECT c.*, n.data AS noteData, n.updated_at AS noteEditedAt, nt.data AS typeData, d.name AS deckName
        FROM anki_cards c JOIN notes n ON n.id = c.noteId JOIN note_types nt ON nt.id = n.noteTypeId JOIN decks d ON d.id = c.deckId`)) {
        let note: any; let type: any; let fields: Record<string, string>;
        try {
            note = JSON.parse(row.noteData); type = JSON.parse(row.typeData);
            fields = Object.fromEntries(note.fields.map((value: string, i: number) => [type.fields[i]?.name ?? `__field_${i}`, value]));
        } catch { continue; }
        let card: any; try { card = JSON.parse(row.data); } catch { card = {}; }
        const fsrs = parseAnkiCardData(card.ankiData);
        if (!matcher || matcher({
            cardId: row.id, noteId: row.noteId, deckName: row.deckName, text: note.fields.join(' '), tags: note.tags ?? [],
            templateOrd: row.ord, queue: row.queue, type: row.type, due: row.due, ivl: row.ivl, factor: row.factor,
            reps: row.reps, lapses: row.lapses, flags: row.flags, fields, noteTypeName: type.name, templateName: type.templates[row.ord]?.name,
            createdAtMs: cardAddedMs(row.id, row.created_at, nowMs), noteEditedAtMs: noteEditedMs(note, row.noteEditedAt),
            memoryState: memoryStateFromCardData(fsrs), decay: fsrs.decay, lastReviewedAtMs: card.lastReview,
            lastReviewTimeSecs: fsrs.lastReviewTimeSecs,
        })) ids.push(row.id);
    }
    return ids.sort((a, b) => a - b);
}

const QUERIES = [
    'soru', 'résumé', 'nc:resume', 'answer', 'Front:soru*', 'back:"başka cevap"', 're:cev', 'w:answer', 'soru_1',
    'tag:marked', 'tag:ünite', 'tag:none', '-tag:fizik', 'edited:1', 'edited:30', 'note:Basic', 'note:Imp*', 'card:2',
    'card:Recto', 'prop:s>5', 'prop:d<0.5', 'prop:r<0.95', 'prop:ivl>=3', 'prop:due<=0', 'prop:pos<200', 'prop:ease=2.5',
    'is:due', 'is:new', 'is:suspended', 'is:review -is:suspended', 'deck:tıp', 'deck:Fizik', 'added:1', 'added:3',
    'flag:1', 'nid:1,2,14', 'cid:101,105,900', 'rated:1', 'rated:1:3', 'introduced:1', 'is:new or tag:marked',
    'deck:Fizik -soru', '(tag:marked or tag:fizik) prop:reps>1', '-is:due',
];

describe('matchingCollectionCardIds', () => {
    it.each(QUERIES)('matches exactly what the full-row evaluator matched for %s', (query) => {
        expect(matchingCollectionCardIds(query).sort((a, b) => a - b)).toEqual(referenceIds(query));
    });

    it('reads each note type once per search, not once per card', () => {
        const types = db.getAllSync<{ data: string }>('SELECT data FROM note_types').map((row) => row.data);
        for (const query of ['soru', 'is:due', 'note:Basic', 'tag:marked prop:s>2']) {
            cells = [];
            matchingCollectionCardIds(query);
            for (const type of types) expect(cells.filter((cell) => cell === type).length).toBeLessThanOrEqual(1);
        }
    });

    it('reads no note JSON for a search of card columns and reads each note once otherwise', () => {
        const notes = db.getAllSync<{ data: string }>('SELECT data FROM notes').map((row) => row.data);
        cells = [];
        matchingCollectionCardIds('deck:Fizik is:due prop:ivl>1 flag:1');
        expect(cells.filter((cell) => notes.includes(cell))).toEqual([]);
        for (const query of ['soru', 'tag:marked', 'edited:1']) {
            cells = [];
            matchingCollectionCardIds(query);
            for (const note of notes) expect(cells.filter((cell) => cell === note).length).toBeLessThanOrEqual(1);
        }
    });
});

describe('browser filters', () => {
    const cardCount = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM anki_cards')!.n;
    const noteCount = () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes')!.n;

    it('evaluates marked, state and tag filters together in one pass over the cards', () => {
        // The browser's sorted listing reads the card blob in SQL, which needs it to be valid JSON.
        db.runSync('UPDATE anki_cards SET data = ? WHERE id = 105', '{}');
        const query = { markedOnly: true, cardState: 'due' as const, tags: ['fizik', 'ünite::immünoloji'] };
        const expected = referenceIds('tag:marked').filter((id) => referenceIds('is:due').includes(id)
            && referenceIds('tag:fizik or tag:ünite::immünoloji').includes(id));
        const bound = cardCount() + noteCount() + 20;
        rowsRead = 0;
        expect(getBrowserCardCount(query)).toBe(expected.length);
        expect(rowsRead).toBeLessThanOrEqual(bound);
        const textMatches = referenceIds('soru');
        const expectedText = expected.filter((id) => textMatches.includes(id));
        rowsRead = 0;
        const listed = getBrowserRowIdsMatchingText(query, 'soru');
        // The text search, its filters and the sorted id listing; never one scan per filter.
        expect(rowsRead).toBeLessThanOrEqual(bound + cardCount());
        expect(listed.sort((a, b) => a - b)).toEqual(expectedText);
        expect(expectedText.length).toBeGreaterThan(0);
    });
});
