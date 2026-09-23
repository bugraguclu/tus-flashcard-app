import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Note } from './models';

const store = new Map<number, Note>();
const dbCalls: string[] = [];
let failOnCard: number | null = null;

vi.mock('./db', () => ({
    getDB: () => ({
        getFirstSync: (sql: string, id: number) => {
            if (/FROM notes WHERE id = \?/.test(sql)) {
                const note = store.get(id);
                return note ? { data: JSON.stringify(note) } : null;
            }
            return null;
        },
        runSync: (sql: string, ...params: any[]) => {
            dbCalls.push(sql);
            if (failOnCard !== null && /DELETE FROM revlog/.test(sql) && params[0] === failOnCard) throw new Error('write failed');
            if (/INSERT OR REPLACE INTO notes/.test(sql)) {
                const [id, , , , , data] = params;
                store.set(id as number, JSON.parse(data as string));
            }
        },
        execSync: (sql: string) => { dbCalls.push(sql); },
    }),
    buildFtsPrefixQuery: (q: string) => q,
}));

import { deleteAnkiCardsOnly, isNoteMarked, MARKED_TAG, toggleNoteMark } from './noteManager';

function note(overrides: Partial<Note> = {}): Note {
    return {
        id: 1, guid: 'g', noteTypeId: 1, mod: 0, usn: -1,
        tags: [], fields: ['Q', 'A'], sfld: 'Q', csum: 1, flags: 0,
        ...overrides,
    };
}

describe('note marking (Anki-style "marked" tag)', () => {
    beforeEach(() => {
        store.clear();
        dbCalls.length = 0;
        failOnCard = null;
    });

    it('toggles the reserved tag on and off', () => {
        store.set(1, note());

        expect(isNoteMarked(store.get(1)!)).toBe(false);

        const markedNow = toggleNoteMark(1);
        expect(markedNow).toBe(true);
        expect(store.get(1)!.tags).toContain(MARKED_TAG);

        const markedAgain = toggleNoteMark(1);
        expect(markedAgain).toBe(false);
        expect(store.get(1)!.tags).not.toContain(MARKED_TAG);
    });

    it('preserves other tags when toggling', () => {
        store.set(1, note({ tags: ['anatomi'] }));

        toggleNoteMark(1);

        expect(store.get(1)!.tags).toEqual(expect.arrayContaining(['anatomi', MARKED_TAG]));
    });

    it('is a no-op when the note does not exist', () => {
        expect(toggleNoteMark(999)).toBe(false);
    });

    it('deletes a bulk empty-card selection in one transaction', () => {
        deleteAnkiCardsOnly([10, 11, 10]);

        expect(dbCalls[0]).toBe('BEGIN TRANSACTION;');
        expect(dbCalls.at(-1)).toBe('COMMIT;');
        expect(dbCalls.filter((sql) => /DELETE FROM anki_cards/.test(sql))).toHaveLength(2);
        expect(dbCalls.filter((sql) => /INSERT INTO graves/.test(sql))).toHaveLength(2);
    });

    it('rolls back when a bulk empty-card deletion fails', () => {
        failOnCard = 11;

        expect(() => deleteAnkiCardsOnly([10, 11])).toThrow('write failed');
        expect(dbCalls[0]).toBe('BEGIN TRANSACTION;');
        expect(dbCalls.at(-1)).toBe('ROLLBACK;');
    });
});
