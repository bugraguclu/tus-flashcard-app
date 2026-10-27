// Anki's search language, term by term. Behaviour reference (independently implemented):
// https://docs.ankiweb.net/searching.html
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';
import { compileCardMatcher, type CardMatcherOptions, type CardSearchContext } from './cardSearchMatch';
import { SearchSyntaxError } from './searchQuery';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {} }));
import { matchingCollectionCardIds, setSearchCurrentDeckName } from './collectionCardSearch';

const OPTIONS: CardMatcherOptions = {
    today: 100,
    nowMs: new Date(2026, 8, 22, 12).getTime(),
    learnAheadMinutes: 20,
    dayCutoffMs: new Date(2026, 8, 22, 4).getTime(),
};

function card(overrides: Partial<CardSearchContext> = {}): CardSearchContext {
    const fieldList = overrides.fieldList ?? ['dog', 'answer'];
    return {
        cardId: 1, noteId: 1, deckName: 'Immunology', text: fieldList.join(' '), tags: [], templateOrd: 0,
        queue: 0, type: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, flags: 0,
        fields: { Front: fieldList[0], Back: fieldList[1] ?? '' }, fieldList, sortFieldIndex: 0,
        noteTypeName: 'Basic', templateName: 'Card 1', noteTypeId: 7, deckId: 3, filteredDeckNames: [], presetName: 'Default',
        customData: null,
        ...overrides,
    };
}
const matches = (query: string, target: CardSearchContext) => compileCardMatcher(query, OPTIONS)!(target);

describe('case folding', () => {
    it('folds English and Turkish i forms together in names', () => {
        expect(matches('deck:immunology', card({ deckName: 'Immunology' }))).toBe(true);
        expect(matches('deck:IMMUNOLOGY', card({ deckName: 'immunology' }))).toBe(true);
        expect(matches('deck:isi', card({ deckName: 'Isı' }))).toBe(true);
        expect(matches('deck:ısı', card({ deckName: 'İSİ' }))).toBe(true);
        expect(matches('tag:info', card({ tags: ['Info::Sub'] }))).toBe(true);
        expect(matches('tag:ünite', card({ tags: ['ÜNİTE'] }))).toBe(true);
        expect(matches('image:x', card({ fields: { Image: 'x' }, fieldList: ['x'] }))).toBe(true);
        expect(matches('note:basic', card({ noteTypeName: 'BASIC' }))).toBe(true);
    });

    it('keeps accents: only nc: ignores them, as in Anki', () => {
        expect(matches('deck:cografya', card({ deckName: 'Coğrafya' }))).toBe(false);
        expect(matches('cografya', card({ fieldList: ['Coğrafya'] }))).toBe(false);
        expect(matches('nc:cografya', card({ fieldList: ['Coğrafya'] }))).toBe(true);
        expect(matches('front:nc:cografya', card({ fields: { Front: 'Coğrafya' } }))).toBe(true);
    });

    it('folds case in plain text for every script', () => {
        expect(matches('KALP', card({ fieldList: ['kalp kası'] }))).toBe(true);
        expect(matches('ığdır', card({ fieldList: ['IĞDIR'] }))).toBe(true);
    });
});

describe('field searches compare the whole field', () => {
    const underdog = card({ fields: { Front: 'underdog', Back: '' }, fieldList: ['underdog', ''] });
    it('needs wildcards for a partial match', () => {
        expect(matches('front:dog', underdog)).toBe(false);
        expect(matches('front:*dog', underdog)).toBe(true);
        expect(matches('front:*dog*', underdog)).toBe(true);
        expect(matches('front:underdog', underdog)).toBe(true);
        expect(matches('front:under_og', underdog)).toBe(true);
        expect(matches('front:under\\_og', underdog)).toBe(false);
    });
    it('finds empty, non-empty and existing fields', () => {
        expect(matches('back:', underdog)).toBe(true);
        expect(matches('front:', underdog)).toBe(false);
        expect(matches('front:_*', underdog)).toBe(true);
        expect(matches('back:_*', underdog)).toBe(false);
        expect(matches('back:*', underdog)).toBe(true);
        expect(matches('missing:*', underdog)).toBe(false);
    });
    it('takes wildcards in the field name and reads regex values', () => {
        expect(matches('fr*:underdog', underdog)).toBe(true);
        expect(matches('f_ont:underdog', underdog)).toBe(true);
        expect(matches('front:re:^under', underdog)).toBe(true);
        expect(matches('front:re:^dog', underdog)).toBe(false);
        expect(matches('front:re:(?-i)^UNDER', underdog)).toBe(false);
    });
    it('compares the stored HTML', () => {
        const bold = card({ fields: { Front: '<b>dog</b>' }, fieldList: ['<b>dog</b>'] });
        expect(matches('front:dog', bold)).toBe(false);
        expect(matches('front:*dog*', bold)).toBe(true);
    });
});

describe('plain text', () => {
    it('reads stored HTML, plus the sort field without formatting', () => {
        const formatted = card({ fieldList: ['exa<b>mple</b>', 'ba<i>na</i>na &amp; co'] });
        expect(matches('example', formatted)).toBe(true); // sort field, formatting removed
        expect(matches('banana', formatted)).toBe(false); // another field: formatting is searched as written
        expect(matches('&amp;', formatted)).toBe(true);
        expect(matches('"na &amp; co"', formatted)).toBe(true);
    });
    it('treats _ as one character and keeps escaped wildcards literal', () => {
        expect(matches('d_g', card({ fieldList: ['dig'] }))).toBe(true);
        expect(matches('d\\_g', card({ fieldList: ['dig'] }))).toBe(false);
        expect(matches('d\\_g', card({ fieldList: ['d_g'] }))).toBe(true);
        expect(matches('a\\*b', card({ fieldList: ['a*b'] }))).toBe(true);
        expect(matches('a\\*b', card({ fieldList: ['axb'] }))).toBe(false);
        expect(matches('3\\:30', card({ fieldList: ['at 3:30'] }))).toBe(true);
    });
    it('finds whole words with w:, including prefix and suffix wildcards', () => {
        const target = card({ fieldList: ['the doggy <b>exam</b>ple'] });
        expect(matches('w:dog', target)).toBe(false);
        expect(matches('w:dog*', target)).toBe(true);
        expect(matches('w:*ggy', target)).toBe(true);
        expect(matches('w:exam', target)).toBe(true);
        expect(matches('w:ğ', card({ fieldList: ['a Ğ b'] }))).toBe(true);
    });
    it('reads through cloze markup with sc:', () => {
        const cloze = card({ fieldList: ['{{c1::mne}}monic {{c2::ok::hint}}'] });
        expect(matches('mnemonic', cloze)).toBe(false);
        expect(matches('sc:mnemonic', cloze)).toBe(true);
        expect(matches('sc:"mnemonic ok"', cloze)).toBe(true);
    });
});

describe('tags and decks', () => {
    it('reads tag regexes per tag and tag:* as every note', () => {
        const tagged = card({ tags: ['parent::child', 'lesson-18'] });
        expect(matches('tag:re:^parent$', tagged)).toBe(false);
        expect(matches('tag:re:^parent', tagged)).toBe(true);
        expect(matches('"tag:re:lesson-(1[7-9]|2[0-5])"', tagged)).toBe(true);
        expect(matches('tag:*', card({ tags: [] }))).toBe(true);
        expect(matches('tag:les_on-18', tagged)).toBe(true);
    });
    it('reads deck wildcards, deck:* and filtered membership', () => {
        expect(matches('deck:*', card())).toBe(true);
        expect(matches('deck:imm_nology', card())).toBe(true);
        expect(matches('deck:Session', card({ filteredDeckNames: ['Session'] }))).toBe(true);
        expect(matches('deck:filtered', card({ filteredDeckNames: ['Session'] }))).toBe(true);
        expect(matches('-deck:filtered', card())).toBe(true);
    });
    it('reads presets, ids, duplicates and custom data', () => {
        expect(matches('preset:default', card())).toBe(true);
        expect(matches('preset:"TUS hızlı"', card())).toBe(false);
        expect(matches('mid:7', card())).toBe(true);
        expect(matches('did:3,4', card())).toBe(true);
        expect(matches('did:4', card({ homeDeckId: 4 }))).toBe(true);
        expect(matches('dupe:7,dog', card({ fieldList: ['<b>dog</b>'] }))).toBe(true);
        expect(matches('dupe:7,Dog', card({ fieldList: ['dog'] }))).toBe(false);
        expect(matches('has-cd:v', card({ customData: { v: 'reschedule', n: 6 } }))).toBe(true);
        expect(matches('prop:cds:v=reschedule', card({ customData: { v: 'reschedule' } }))).toBe(true);
        expect(matches('prop:cdn:n>5', card({ customData: { n: 6 } }))).toBe(true);
        expect(matches('prop:cdn:n>5', card({ customData: null }))).toBe(false);
    });
    it('rejects malformed ids', () => {
        expect(() => matches('mid:abc', card())).toThrow(SearchSyntaxError);
        expect(() => matches('dupe:x', card())).toThrow(SearchSyntaxError);
    });
});

describe('review-log days', () => {
    const offsets = (list: number[]) => ({ ...OPTIONS, revlogDayOffsets: () => list });
    it('reads prop:rated and prop:resched as days relative to today', () => {
        expect(compileCardMatcher('prop:rated=0', offsets([0]))!(card())).toBe(true);
        expect(compileCardMatcher('prop:rated=-1', offsets([0]))!(card())).toBe(false);
        expect(compileCardMatcher('prop:rated>-7', offsets([-3]))!(card())).toBe(true);
        expect(compileCardMatcher('resched:1', offsets([0]))!(card())).toBe(true);
        expect(compileCardMatcher('resched:2', offsets([-2]))!(card())).toBe(false);
    });
});

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });

describe('collection scan', () => {
    const NOW = Date.now();
    beforeEach(() => {
        h.db = createAppDb(SQL);
        const db = h.db;
        db.runSync('INSERT INTO note_types (id, name, data) VALUES (5, ?, ?)', 'Basic', JSON.stringify({ id: 5, name: 'Basic', sortFieldIdx: 0, fields: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }], templates: [{ name: 'Card 1', ord: 0 }] }));
        db.runSync('INSERT INTO deck_configs (id, data) VALUES (1, ?), (2, ?)', JSON.stringify({ id: 1, name: 'Default' }), JSON.stringify({ id: 2, name: 'Fast' }));
        db.runSync('INSERT INTO decks (id, name, data) VALUES (1, ?, ?)', 'Home', JSON.stringify({ id: 1, name: 'Home', configId: 2 }));
        db.runSync('INSERT INTO decks (id, name, data) VALUES (2, ?, ?)', 'Other', JSON.stringify({ id: 2, name: 'Other', configId: 1 }));
        db.runSync('INSERT INTO decks (id, name, data) VALUES (3, ?, ?)', 'Session', JSON.stringify({ id: 3, name: 'Session', isFiltered: true, searchQuery: 'deck:Home', searchLimit: 10, searchOrder: 0, filteredBuildAt: 5 }));
        db.runSync('INSERT INTO decks (id, name, data) VALUES (4, ?, ?)', 'Imported F', JSON.stringify({ id: 4, name: 'Imported F', isFiltered: true }));
        for (const [noteId, front] of [[1, 'one'], [2, 'two'], [3, 'three']] as const) {
            db.runSync('INSERT INTO notes (id, noteTypeId, sfld, data, updated_at) VALUES (?, 5, ?, ?, ?)', noteId, front, JSON.stringify({ id: noteId, noteTypeId: 5, fields: [front, ''], tags: [], mod: Math.floor(NOW / 1000) - noteId * 86_400 * 10 }), NOW);
        }
        const insert = (id: number, noteId: number, deckId: number, data: object) => db.runSync(
            'INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data, created_at) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, ?, ?)',
            id, noteId, deckId, JSON.stringify({ id, ...data }), NOW,
        );
        insert(NOW - 40 * 86_400_000, 1, 1, { ankiData: JSON.stringify({ cd: { v: 'x' } }) }); // authored 40 days ago
        insert(NOW - 1000, 2, 2, {});
        insert(77, 3, 4, { odid: 1 }); // physically in an imported filtered deck; id is not a timestamp
        db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'filtered_membership_v1:3', JSON.stringify({
            buildAt: 5, signature: JSON.stringify(['deck:Home', 10, 0, undefined, undefined, undefined]), ids: [NOW - 40 * 86_400_000],
        }));
        db.runSync('INSERT INTO revlog (id, cardId, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, 0, 0, 0, 0, 0, 4)', NOW - 500, NOW - 1000);
    });
    afterEach(() => setSearchCurrentDeckName(null));
    const ids = (query: string) => matchingCollectionCardIds(query).sort((a, b) => a - b);
    const first = () => NOW - 40 * 86_400_000;

    it('finds cards by filtered membership, home deck and preset', () => {
        expect(ids('deck:Session')).toEqual([first()]);
        expect(ids('deck:filtered')).toEqual([77, first()]);
        expect(ids('deck:Home')).toEqual([77, first()]);
        expect(ids('preset:fast')).toEqual([77, first()]);
        expect(ids('did:1')).toEqual([77, first()]);
        expect(ids('mid:5')).toHaveLength(3);
        expect(ids('has-cd:v')).toEqual([first()]);
    });

    it('ignores a stale membership row', () => {
        h.db.runSync("UPDATE decks SET data = json_set(data, '$.filteredBuildAt', 6) WHERE id = 3");
        expect(ids('deck:Session')).toEqual([]);
    });

    it('reads added: from the card id, as Anki does, and edited: from the note mod', () => {
        expect(ids('added:1')).toEqual([77, NOW - 1000]);
        expect(ids('edited:1')).toEqual([]);
        expect(ids('edited:15')).toEqual([first()]);
    });

    it('reads deck:current from the screen that owns the deck selection', () => {
        expect(ids('deck:current')).toHaveLength(3);
        setSearchCurrentDeckName('Other');
        expect(ids('deck:current')).toEqual([NOW - 1000]);
    });

    it('includes a learning card due today in prop:due<=0 for the collection scan (filtered SQL path)', () => {
        h.db.runSync('UPDATE anki_cards SET type = 1, queue = 1, due = ? WHERE id = 77', Date.now() + 60_000);
        expect(ids('prop:due<=0')).toEqual([77]);
        expect(ids('prop:due<=0 is:learn')).toEqual([77]);
    });

    it('finds manual reschedules', () => {
        expect(ids('resched:1')).toEqual([NOW - 1000]);
        expect(ids('prop:resched=0')).toEqual([NOW - 1000]);
        expect(ids('rated:1')).toEqual([]);
    });
});

describe('prop:due on learning cards (FLT-9)', () => {
    const learning = (dueMs: number) => card({ type: 1, queue: 1, due: dueMs });
    it('reads an intraday learning card due today as day 0', () => {
        const laterToday = OPTIONS.nowMs + 3_600_000;
        expect(matches('prop:due=0', learning(laterToday))).toBe(true);
        expect(matches('prop:due<=0', learning(laterToday))).toBe(true);
        expect(matches('prop:due>=1', learning(laterToday))).toBe(false);
        expect(matches('prop:due=-2', learning(OPTIONS.dayCutoffMs + 86_400_000 - 2.5 * 86_400_000))).toBe(true);
        expect(matches('prop:due=0', card({ type: 2, queue: 2, due: OPTIONS.today }))).toBe(true);
        expect(matches('prop:due=0', card({ type: 0, queue: 0, due: 100 }))).toBe(false);
    });
});
