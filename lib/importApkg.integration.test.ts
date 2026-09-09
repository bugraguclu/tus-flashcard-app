import { describe, it, expect, beforeAll, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import JSZip from 'jszip';

// importApkg pulls in importNotes/noteManager/mediaStore (which import the RN db
// layer); the glue under test here doesn't use them, so stub them out.
vi.mock('./importNotes', () => ({ importRows: () => ({ added: 0, duplicates: 0, emptyRows: 0 }) }));
vi.mock('./noteManager', () => ({ getNoteType: () => null }));
const media = vi.hoisted(() => ({ saved: [] as { filename: string; size: number }[] }));
vi.mock('./mediaStore', () => ({
    saveMediaBytes: async (filename: string, bytes: Uint8Array) => {
        media.saved.push({ filename, size: bytes.length });
    },
}));

import { extractCollectionBytes, importMediaFromZip, readAnkiNotes } from './importApkg';
import { readAnkiProgress } from './importApkgProgress';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

function buildAnkiCollectionBytes(): Uint8Array {
    const db: Database = new SQL.Database();
    db.run('CREATE TABLE col (models text)');
    db.run('INSERT INTO col (models) VALUES (?)', [JSON.stringify({ '100': { type: 0 } })]);
    db.run('CREATE TABLE notes (id integer primary key, guid text, mid integer, flds text, tags text)');
    db.run('INSERT INTO notes (id, guid, mid, flds, tags) VALUES (1, ?, 100, ?, ?)', ['g-kalp', 'Kalp\x1fPompa\x1fFizyoloji', 'exam cardio']);
    db.run('INSERT INTO notes (id, guid, mid, flds, tags) VALUES (2, ?, 100, ?, ?)', ['g-akciger', 'Akciğer\x1fSolunum', '']);
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
    const modernCollection = new Uint8Array(Buffer.from('KLUv/QRYuQAAbW9kZXJuIGNvbGxlY3Rpb24gYnl0ZXPtQ4PX', 'base64'));

    it('extracts collection.anki2 bytes from a package', async () => {
        const collection = buildAnkiCollectionBytes();
        const zip = new JSZip();
        zip.file('collection.anki2', collection);
        zip.file('media', '{}');
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });

        const extracted = await extractCollectionBytes(zipBytes);
        expect(extracted.length).toBe(collection.length);
    });

    it('extracts the newer zstd-compressed collection.anki21b format', async () => {
        const zip = new JSZip();
        zip.file('collection.anki21b', modernCollection);
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        expect(new TextDecoder().decode(await extractCollectionBytes(zipBytes))).toBe('modern collection bytes');
    });

    it('prefers a new-format collection instead of importing its collection.anki2 stub', async () => {
        // New-format exports ship the real data as .anki21b plus a stub .anki2 whose only purpose
        // is to show old Anki versions an upgrade notice. The stub must not be silently imported.
        const zip = new JSZip();
        zip.file('collection.anki21b', modernCollection);
        zip.file('collection.anki2', buildAnkiCollectionBytes());
        zip.file('media', '{}');
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        expect(new TextDecoder().decode(await extractCollectionBytes(zipBytes))).toBe('modern collection bytes');
    });

    it('prefers collection.anki21 when a legacy export contains both legacy files', async () => {
        const newer = buildAnkiCollectionBytes();
        const zip = new JSZip();
        zip.file('collection.anki21', newer);
        zip.file('collection.anki2', new Uint8Array([9, 9]));
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        const extracted = await extractCollectionBytes(zipBytes);
        expect(extracted.length).toBe(newer.length);
    });

    it('reads notes (flds split by \\x1f, tags by whitespace) from a real Anki SQLite', () => {
        const reader = wrapReader(buildAnkiCollectionBytes());
        expect(readAnkiNotes(reader as any)).toEqual([
            { guid: 'g-kalp', fields: ['Kalp', 'Pompa', 'Fizyoloji'], tags: ['exam', 'cardio'], cloze: false, hasMedia: false },
            { guid: 'g-akciger', fields: ['Akciğer', 'Solunum'], tags: [], cloze: false, hasMedia: false },
        ]);
    });

    it('reads scheduling state and revlog joined to note guids from a real Anki SQLite', () => {
        const db: Database = new SQL.Database();
        db.run('CREATE TABLE col (models text, crt integer)');
        db.run('INSERT INTO col (models, crt) VALUES (?, ?)', [JSON.stringify({ '100': { type: 0 } }), 1600000000]);
        db.run('CREATE TABLE notes (id integer primary key, guid text, mid integer, flds text, tags text)');
        db.run('INSERT INTO notes VALUES (1, ?, 100, ?, ?)', ['g-kalp', 'Kalp\x1fPompa', '']);
        db.run(`CREATE TABLE cards (id integer primary key, nid integer, ord integer, type integer,
                queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer,
                "left" integer, odue integer, odid integer)`);
        db.run('INSERT INTO cards VALUES (10, 1, 0, 2, 2, 105, 21, 2350, 8, 1, 0, 0, 0)');
        db.run(`CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer,
                ivl integer, lastIvl integer, factor integer, time integer, type integer)`);
        db.run('INSERT INTO revlog VALUES (1700000000000, 10, -1, 3, 21, 10, 2350, 4200, 1)');
        const reader = wrapReader(db.export());
        db.close();

        expect(readAnkiProgress(reader as any)).toEqual({
            crt: 1600000000,
            cards: [{
                ankiCardId: 10, guid: 'g-kalp', ord: 0, type: 2, queue: 2, due: 105,
                ivl: 21, factor: 2350, reps: 8, lapses: 1, left: 0, odue: 0, odid: 0,
            }],
            revlog: [{ id: 1700000000000, cid: 10, ease: 3, ivl: 21, lastIvl: 10, factor: 2350, time: 4200, type: 1 }],
        });
    });

    it('copies media files listed in the manifest and skips unlisted/missing entries', async () => {
        media.saved.length = 0;
        const zip = new JSZip();
        zip.file('media', JSON.stringify({ '0': 'kalp.png', '1': 'ses.mp3', '2': 'missing.png' }));
        zip.file('0', new Uint8Array([1, 2, 3]));
        zip.file('1', new Uint8Array([4, 5]));
        // '2' has a manifest entry but no zip entry; '99' has an entry but no manifest row.
        zip.file('99', new Uint8Array([9]));

        const counts = await importMediaFromZip(zip);
        expect(counts).toEqual({ imported: 2, skipped: 1, filenames: ['kalp.png', 'ses.mp3'] });
        expect(media.saved).toEqual([
            { filename: 'kalp.png', size: 3 },
            { filename: 'ses.mp3', size: 2 },
        ]);
    });

    it('does not store active document/code media from an untrusted package', async () => {
        media.saved.length = 0;
        const zip = new JSZip();
        zip.file('media', JSON.stringify({
            '0': 'safe.png',
            '1': 'active.svg',
            '2': 'page.html',
            '3': 'code.js',
        }));
        zip.file('0', new Uint8Array([1]));
        zip.file('1', new Uint8Array([2]));
        zip.file('2', new Uint8Array([3]));
        zip.file('3', new Uint8Array([4]));

        const counts = await importMediaFromZip(zip);
        expect(counts).toEqual({ imported: 1, skipped: 3, filenames: ['safe.png'] });
        expect(media.saved).toEqual([{ filename: 'safe.png', size: 1 }]);
    });
});
