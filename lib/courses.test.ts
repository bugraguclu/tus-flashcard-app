// Tests for dynamic course creation: slug generation, deck wiring, registry persistence.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import { createCourse } from './courses';
import {
    getAllSubjects,
    getSubjectIdSet,
    getSubjectsForDeck,
    invalidateSubjectsCache,
    resolveSubjectDeckId,
    slugifySubjectId,
} from './subjects';
import { getDeck, getDeckByName, saveDeck } from './deckManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
    invalidateSubjectsCache();
    saveDeck({ id: 1, name: 'Python', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
});

afterEach(() => {
    db.close();
});

describe('slugifySubjectId', () => {
    it('transliterates Turkish characters and normalizes separators', () => {
        expect(slugifySubjectId('Dosya İşlemleri')).toBe('dosya-islemleri');
        expect(slugifySubjectId('Görüntü & Ses')).toBe('goruntu-ses');
        expect(slugifySubjectId('  C++ 101  ')).toBe('c-101');
    });

    it('never returns an empty slug', () => {
        expect(slugifySubjectId('☕️')).toBe('ders');
    });
});

describe('createCourse', () => {
    it('creates a subject with its own deck under the root deck', () => {
        const result = createCourse('Dosya İşlemleri', { icon: '📁' });
        expect(result.created).toBe(true);
        expect(result.subject.id).toBe('dosya-islemleri');

        const deck = getDeckByName('Python::Dosya İşlemleri');
        expect(deck).not.toBeNull();
        expect(resolveSubjectDeckId('dosya-islemleri')).toBe(deck!.id);

        // Registry round-trip: visible after a cache reset (fresh app start).
        invalidateSubjectsCache();
        expect(getAllSubjects().some((subject) => subject.id === 'dosya-islemleri')).toBe(true);
        expect(getSubjectIdSet().has('dosya-islemleri')).toBe(true);
    });

    it('rejects a duplicate course name within the same deck', () => {
        const first = createCourse('Aşı', { parentDeckName: 'Sıfır' });
        expect(first.created).toBe(true);

        const dup = createCourse('aşı', { parentDeckName: 'Sıfır' });
        expect(dup.created).toBe(false);
        expect(dup.error).toBe('Bu isimde bir ders zaten var.');
        expect(dup.subject.id).toBe(first.subject.id);
    });

    it('allows the same course name in a different deck (courses are deck-specific)', () => {
        const a = createCourse('Aşı', { parentDeckName: 'Sıfır' });
        const b = createCourse('Aşı', { parentDeckName: 'Bir' });
        expect(a.created).toBe(true);
        expect(b.created).toBe(true);
        expect(b.subject.id).toBe('asi-2');
        expect(getDeckByName('Sıfır::Aşı')).not.toBeNull();
        expect(getDeckByName('Bir::Aşı')).not.toBeNull();
    });

    it('rejects an empty name', () => {
        const result = createCourse('   ');
        expect(result.created).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('disambiguates slug collisions with a numeric suffix', () => {
        const first = createCourse('Yeni Konu');
        const second = createCourse('Yeni  Konu!');
        expect(first.created).toBe(true);
        expect(second.created).toBe(true);
        expect(second.subject.id).toBe('yeni-konu-2');
    });

    it('creates a parent deck entry when the root deck was renamed', () => {
        saveDeck({ id: 1, name: 'Kurs', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        const result = createCourse('Ağ Programlama');
        expect(result.created).toBe(true);
        expect(getDeckByName('Kurs::Ağ Programlama')).not.toBeNull();
        expect(getDeck(resolveSubjectDeckId(result.subject.id))?.name).toBe('Kurs::Ağ Programlama');
    });
});

describe('getSubjectsForDeck', () => {
    it('lists only the deck subtree\'s own courses; an empty deck lists none', () => {
        const asi = createCourse('Aşı', { parentDeckName: 'Sıfır' });
        createCourse('Tarih', { parentDeckName: 'Bir' });

        const inSifir = getSubjectsForDeck('Sıfır');
        expect(inSifir.map((s) => s.id)).toEqual([asi.subject.id]);

        // A course added to one deck must never leak into another deck's list.
        expect(getSubjectsForDeck('Bir').some((s) => s.id === asi.subject.id)).toBe(false);

        saveDeck({ id: 99, name: 'Boş', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        expect(getSubjectsForDeck('Boş')).toEqual([]);
    });

    it('falls back to the full list without a deck context', () => {
        expect(getSubjectsForDeck(null).length).toBe(getAllSubjects().length);
    });
});
