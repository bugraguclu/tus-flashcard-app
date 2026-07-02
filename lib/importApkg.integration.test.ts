import { describe, it, expect, beforeAll, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import JSZip from 'jszip';

// importApkg pulls in importNotes/noteManager (which import the RN db layer);
// the glue under test here doesn't use them, so stub them out.
vi.mock('./importNotes', () => ({ importRows: () => ({ added: 0, duplicates: 0, emptyRows: 0 }) }));
vi.mock('./noteManager', () => ({ getNoteType: () => null }));

import { extractCollectionBytes, readAnkiNotes } from './importApkg';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

function buildAnkiCollectionBytes(): Uint8Array {
    const db: Database = new SQL.Database();
    db.run('CREATE TABLE col (models text)');
    db.run('INSERT INTO col (models) VALUES (?)', [JSON.stringify({ '100': { type: 0 } })]);
    db.run('CREATE TABLE notes (id integer primary key, mid integer, flds text, tags text)');
    db.run('INSERT INTO notes (id, mid, flds, tags) VALUES (1, 100, ?, ?)', ['Kalp\x1fPompa\x1fFizyoloji', 'exam cardio']);
    db.run('INSERT INTO notes (id, mid, flds, tags) VALUES (2, 100, ?, ?)', ['Akciğer\x1fSolunum', '']);
    const bytes = db.export();
    db.close();
    return bytes;
}

function wrapReader(bytes: Uint8Array) {
    const db = new SQL.Database(bytes);
    const getAllSync = <T = any>(sql: string): T[] => {
        const results = db.exec(sql);
        if (results.length === 0) return [];
        const { columns, values } = results[0];
        return values.map((row) => {
            const obj: Record<string, any> = {};
            columns.forEach((col, i) => (obj[col] = row[i]));
            return obj as T;
        });
    };
    return {
        getAllSync,
        getFirstSync<T = any>(sql: string): T | null {
            const rows = getAllSync<T>(sql);
            return rows.length ? rows[0] : null;
        },
    };
}

describe('apkg glue (real sql.js + jszip)', () => {
    it('extracts collection.anki2 bytes from a package', async () => {
        const collection = buildAnkiCollectionBytes();
        const zip = new JSZip();
        zip.file('collection.anki2', collection);
        zip.file('media', '{}');
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });

        const extracted = await extractCollectionBytes(zipBytes);
        expect(extracted.length).toBe(collection.length);
    });

    it('rejects the newer compressed collection.anki21b format', async () => {
        const zip = new JSZip();
        zip.file('collection.anki21b', new Uint8Array([1, 2, 3]));
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        await expect(extractCollectionBytes(zipBytes)).rejects.toThrow(/[Ee]ski/);
    });

    it('reads notes (flds split by \\x1f, tags by whitespace) from a real Anki SQLite', () => {
        const reader = wrapReader(buildAnkiCollectionBytes());
        expect(readAnkiNotes(reader as any)).toEqual([
            { fields: ['Kalp', 'Pompa', 'Fizyoloji'], tags: ['exam', 'cardio'], cloze: false, hasMedia: false },
            { fields: ['Akciğer', 'Solunum'], tags: [], cloze: false, hasMedia: false },
        ]);
    });
});
