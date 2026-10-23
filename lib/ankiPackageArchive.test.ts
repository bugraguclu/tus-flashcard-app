// AKT-13: the pristine package copy is kept only when it can be exported byte for byte.
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, saved: [] as string[] }));
vi.mock('./db', () => ({ getDB: () => h.db }));
vi.mock('./mediaStore', () => ({
    saveMediaBytes: async (name: string) => { h.saved.push(name); },
    readMediaBytes: async () => new Uint8Array([1]),
    sanitizeMediaFilename: (name: string) => name,
}));
import { preserveOriginalAnkiPackage, pristineOriginalForExport } from './ankiPackageArchive';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); h.saved = []; });

it('does not store a second copy of a package that can never be exported byte for byte', async () => {
    const meta = await preserveOriginalAnkiPackage(new Uint8Array([1, 2, 3]), { noteCount: 1, cardCount: 1, exactEligible: false });
    expect(h.saved).toEqual([]);
    expect(meta.archiveName).toBe('');
    expect(await pristineOriginalForExport([{ sourcePackageId: meta.id } as any], [{ sourcePackageId: meta.id } as any], true)).toBeNull();
});

it('keeps the copy of a pristine import', async () => {
    const meta = await preserveOriginalAnkiPackage(new Uint8Array([4, 5]), { noteCount: 1, cardCount: 1, exactEligible: true });
    expect(h.saved).toEqual([meta.archiveName]);
    expect(await pristineOriginalForExport([{ sourcePackageId: meta.id } as any], [{ sourcePackageId: meta.id } as any], true)).not.toBeNull();
});
