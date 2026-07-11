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
        const result = createCourse('Dosya İşlemleri', '📁');
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

    it('rejects a name that collides with an existing course', () => {
        const result = createCourse('Temeller');
        expect(result.created).toBe(false);
        expect(result.error).toBe('Bu isimde bir ders zaten var.');
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
