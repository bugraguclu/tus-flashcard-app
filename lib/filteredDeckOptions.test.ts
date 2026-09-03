import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import {
    ankiFilteredOrderFromLegacy,
    DEFAULT_PREVIEW_DELAYS,
    extractDeckNameFromSearch,
    FILTERED_DECK_ORDER_UI,
    FILTERED_SEARCH_ORDER,
    formatPreviewDelays,
    parsePreviewDelays,
    previewDelaySecondsForGrade,
    replaceDeckNameInSearch,
} from './filteredDeckOptions';
import { filteredOrderLabel } from './i18n';
import { runMigrations } from './db';

describe('filtered deck options', () => {
    it('presents every gather order in the same sequence as Anki', () => {
        expect(FILTERED_DECK_ORDER_UI.map((order) => filteredOrderLabel('en', order))).toEqual([
            'Oldest seen first',
            'Random',
            'Increasing intervals',
            'Decreasing intervals',
            'Most lapses',
            'Order added',
            'Order due',
            'Latest added first',
            'Ascending retrievability',
            'Descending retrievability',
            'Relative overdueness',
        ]);
    });

    it('keeps scheduler ids stable when labels are localized', () => {
        expect(FILTERED_DECK_ORDER_UI.map((order) => filteredOrderLabel('tr', order))).toEqual([
            'En eski görülen önce',
            'Rastgele',
            'Aralıklar (artan)',
            'Aralıklar (azalan)',
            'En çok unutulan',
            'Ekleniş sırası',
            'Vade sırası',
            'Son eklenen önce',
            'Hatırlanabilirlik (artan)',
            'Hatırlanabilirlik (azalan)',
            'Göreceli gecikme',
        ]);
    });
});

// Anki's ordinals: proto/anki/decks.proto, Deck.Filtered.SearchTerm.Order.
describe('filtered deck gather order ordinals', () => {
    it('matches Anki’s enum, and the picker lists them in enum order', () => {
        expect(FILTERED_SEARCH_ORDER).toEqual({
            oldestReviewedFirst: 0,
            random: 1,
            intervalsAscending: 2,
            intervalsDescending: 3,
            lapses: 4,
            added: 5,
            due: 6,
            reverseAdded: 7,
            retrievabilityAscending: 8,
            retrievabilityDescending: 9,
            relativeOverdueness: 10,
        });
        expect([...FILTERED_DECK_ORDER_UI]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('maps each legacy ordinal onto the order it used to mean', () => {
        expect(ankiFilteredOrderFromLegacy(0)).toBe(FILTERED_SEARCH_ORDER.due);
        expect(ankiFilteredOrderFromLegacy(1)).toBe(FILTERED_SEARCH_ORDER.random);
        expect(ankiFilteredOrderFromLegacy(2)).toBe(FILTERED_SEARCH_ORDER.intervalsAscending);
        expect(ankiFilteredOrderFromLegacy(3)).toBe(FILTERED_SEARCH_ORDER.intervalsDescending);
        expect(ankiFilteredOrderFromLegacy(4)).toBe(FILTERED_SEARCH_ORDER.added);
        expect(ankiFilteredOrderFromLegacy(5)).toBe(FILTERED_SEARCH_ORDER.reverseAdded);
        expect(ankiFilteredOrderFromLegacy(6)).toBe(FILTERED_SEARCH_ORDER.lapses);
        expect(ankiFilteredOrderFromLegacy(7)).toBe(FILTERED_SEARCH_ORDER.oldestReviewedFirst);
        expect(ankiFilteredOrderFromLegacy(8)).toBe(FILTERED_SEARCH_ORDER.retrievabilityAscending);
        expect(ankiFilteredOrderFromLegacy(9)).toBe(FILTERED_SEARCH_ORDER.retrievabilityDescending);
    });

    it('falls back to Anki’s default order for anything unrecognised', () => {
        expect(ankiFilteredOrderFromLegacy(undefined)).toBe(FILTERED_SEARCH_ORDER.due);
        expect(ankiFilteredOrderFromLegacy('x')).toBe(FILTERED_SEARCH_ORDER.due);
        expect(ankiFilteredOrderFromLegacy(42)).toBe(FILTERED_SEARCH_ORDER.due);
    });
});

describe('filtered deck preview delays', () => {
    it('defaults to Anki\u2019s preview_again/hard/good_secs of 60, 600 and 0', () => {
        expect(DEFAULT_PREVIEW_DELAYS).toEqual([60, 600, 0]);
        expect(parsePreviewDelays(undefined)).toEqual([60, 600, 0]);
        expect(parsePreviewDelays(null)).toEqual([60, 600, 0]);
        expect(parsePreviewDelays('')).toEqual([60, 600, 0]);
    });

    it('parses space and comma separated input', () => {
        expect(parsePreviewDelays('60 600 0')).toEqual([60, 600, 0]);
        expect(parsePreviewDelays('60, 600, 0')).toEqual([60, 600, 0]);
        expect(parsePreviewDelays([30, 90, 1200])).toEqual([30, 90, 1200]);
    });

    it('falls back per position when a value is missing or unusable', () => {
        expect(parsePreviewDelays('15 120')).toEqual([15, 120, 0]);
        expect(parsePreviewDelays('abc 120 5')).toEqual([60, 120, 5]);
        expect(parsePreviewDelays([-5, 120, 5])).toEqual([60, 120, 5]);
    });

    it('drops a fourth value left by decks written before Easy became non-configurable', () => {
        expect(parsePreviewDelays([10, 60, 600, 0])).toEqual([10, 60, 600]);
        expect(parsePreviewDelays('10 60 600 0')).toEqual([10, 60, 600]);
    });

    it('formats delays back into the string the options form edits', () => {
        expect(formatPreviewDelays([60, 600, 0])).toBe('60 600 0');
        expect(formatPreviewDelays(undefined)).toBe('60 600 0');
    });

    it('maps the reviewer\u2019s grades onto the stored delays', () => {
        const delays = [60, 600, 30];
        expect(previewDelaySecondsForGrade(delays, 1)).toBe(60);
        expect(previewDelaySecondsForGrade(delays, 2)).toBe(600);
        expect(previewDelaySecondsForGrade(delays, 3)).toBe(30);
    });

    it('always retires the card on Easy, whatever the deck stores', () => {
        // preview_filter.rs answers Easy with a hard-coded zero, and zero means "leave the session".
        expect(previewDelaySecondsForGrade([60, 600, 30], 4)).toBe(0);
        expect(previewDelaySecondsForGrade([60, 600, 30, 999], 4)).toBe(0);
        expect(previewDelaySecondsForGrade(undefined, 4)).toBe(0);
    });

    it('treats a zero delay on Again, Hard or Good as retiring the card too', () => {
        expect(previewDelaySecondsForGrade([0, 0, 0], 1)).toBe(0);
        expect(previewDelaySecondsForGrade(undefined, 3)).toBe(0);
    });
});

describe('migration 10: stored filtered-deck order', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;

    beforeAll(async () => {
        SQL = await initSqlJs();
    });

    beforeEach(() => {
        db = createAppDb(SQL);
        // Stand where an existing collection stood before this change: schema v9, decks saved
        // with the old local numbering.
        db.execSync('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);');
        db.runSync('INSERT INTO schema_version (version) VALUES (9)');
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        db.close();
    });

    const saveRawDeck = (id: number, deck: Record<string, unknown>) => {
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            id,
            String(deck.name),
            JSON.stringify(deck),
        );
    };
    const readDeck = (id: number) => JSON.parse(
        db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', id)!.data,
    );

    it('rewrites both filter terms of a filtered deck and leaves normal decks alone', () => {
        saveRawDeck(1, {
            id: 1, name: 'Oturum', isFiltered: true,
            searchQuery: 'deck:"Tıp"', searchOrder: 4,
            searchQuery2: 'deck:"Tıp" is:due', searchOrder2: 0,
        });
        saveRawDeck(2, { id: 2, name: 'Tıp', isFiltered: false, searchOrder: 4 });

        runMigrations(db as never);

        expect(readDeck(1)).toMatchObject({
            searchOrder: FILTERED_SEARCH_ORDER.added,
            searchOrder2: FILTERED_SEARCH_ORDER.due,
        });
        // A normal deck has no gather order; its stray field must not be reinterpreted.
        expect(readDeck(2).searchOrder).toBe(4);
        expect(db.getFirstSync<{ version: number }>('SELECT version FROM schema_version')?.version).toBe(10);
    });

    it('leaves a filtered deck without a stored order untouched', () => {
        saveRawDeck(3, { id: 3, name: 'Oturum', isFiltered: true, searchQuery: 'deck:"Tıp"' });

        runMigrations(db as never);

        expect(readDeck(3).searchOrder).toBeUndefined();
    });
});

describe('extractDeckNameFromSearch', () => {
    it('extracts quoted deck name from search query', () => {
        expect(extractDeckNameFromSearch('deck:"TUS Kartları::Anatomi" is:due')).toBe('TUS Kartları::Anatomi');
        expect(extractDeckNameFromSearch('deck:"Dahiliye"')).toBe('Dahiliye');
    });

    it('extracts unquoted deck name from search query', () => {
        expect(extractDeckNameFromSearch('deck:Anatomi is:due')).toBe('Anatomi');
    });

    it('ignores negated deck filters', () => {
        expect(extractDeckNameFromSearch('-deck:"Excluded" deck:"Included"')).toBe('Included');
        expect(extractDeckNameFromSearch('-deck:"Excluded" is:due')).toBeNull();
    });

    it('returns null when no deck term exists', () => {
        expect(extractDeckNameFromSearch('is:due tag:zor')).toBeNull();
        expect(extractDeckNameFromSearch('')).toBeNull();
    });
});

describe('replaceDeckNameInSearch', () => {
    it('replaces existing quoted deck name in query', () => {
        expect(replaceDeckNameInSearch('deck:"TUS Kartları" is:due', 'Anatomi')).toBe('deck:Anatomi is:due');
        expect(replaceDeckNameInSearch('deck:"Eski Deste" is:due', 'Yeni :: Alt Deste')).toBe('deck:"Yeni :: Alt Deste" is:due');
    });

    it('replaces existing unquoted deck name in query', () => {
        expect(replaceDeckNameInSearch('deck:Python is:due', 'TUS Kartları::Deneme')).toBe('deck:"TUS Kartları::Deneme" is:due');
    });

    it('prepends deck term when no deck term is present in query', () => {
        expect(replaceDeckNameInSearch('is:due tag:zor', 'Anatomi')).toBe('deck:Anatomi is:due tag:zor');
        expect(replaceDeckNameInSearch('', 'Anatomi')).toBe('deck:Anatomi');
    });

    it('removes deck term when newDeckName is null (whole collection / all decks)', () => {
        expect(replaceDeckNameInSearch('deck:"TUS Kartları" is:due', null)).toBe('is:due');
        expect(replaceDeckNameInSearch('deck:Anatomi', null)).toBe('');
        expect(replaceDeckNameInSearch('is:due tag:zor', null)).toBe('is:due tag:zor');
    });
});
