import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, flush: vi.fn(), readOnly: vi.fn() }));
vi.mock('./db', () => ({ getDB: () => h.db, flushDatabaseWrites: h.flush, readOnlyTabMessage: h.readOnly }));

import { commitSettingsWrite } from './settingsWrite';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    h.db = db = createAppDb(SQL);
    h.flush.mockReset().mockResolvedValue(undefined);
    h.readOnly.mockReset().mockReturnValue(null);
});
afterEach(() => db.close());

const read = (key: string) => db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
const write = (key: string, value: string) => db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);

describe('durable settings writes', () => {
    it('withholds completion until the durable commit and rejects a read-only tab before mutation', async () => {
        let finish!: () => void;
        h.flush.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
        const done = vi.fn();
        const pending = commitSettingsWrite(['layout'], () => write('layout', 'new')).then(done);
        await vi.waitFor(() => expect(h.flush).toHaveBeenCalledOnce());
        expect(done).not.toHaveBeenCalled();
        finish();
        await pending;
        expect(done).toHaveBeenCalledOnce();
        h.readOnly.mockReturnValue('read-only tab');
        await expect(commitSettingsWrite(['layout'], () => write('layout', 'lost'))).rejects.toThrow('read-only tab');
        expect(read('layout')).toBe('new');
    });

    it('rolls back the plan and draft together after a failed commit so retry creates one plan', async () => {
        write('plans', 'existing');
        write('draft', 'unfinished');
        h.flush.mockRejectedValueOnce(new Error('Quota exceeded'));
        const create = () => commitSettingsWrite(['plans', 'draft'], () => {
            write('plans', 'existing + new plan');
            db.runSync('DELETE FROM settings WHERE key = ?', 'draft');
        });
        await expect(create()).rejects.toThrow('Quota exceeded');
        expect(read('plans')).toBe('existing');
        expect(read('draft')).toBe('unfinished');
        await create();
        expect(read('plans')).toBe('existing + new plan');
        expect(read('draft')).toBeNull();
    });

    it('does not roll back a newer edit when an older commit fails', async () => {
        write('draft', 'old');
        let fail!: (error: Error) => void;
        h.flush.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { fail = reject; }));
        const pending = commitSettingsWrite(['draft'], () => write('draft', 'first'));
        await vi.waitFor(() => expect(h.flush).toHaveBeenCalledOnce());
        write('draft', 'newer');
        fail(new Error('Quota exceeded'));
        await expect(pending).rejects.toThrow();
        expect(read('draft')).toBe('newer');
    });

    it('rolls back a partial SQL mutation and never flushes an unreadable starting state', async () => {
        write('plans', 'existing');
        await expect(commitSettingsWrite(['plans'], () => {
            write('plans', 'new');
            throw new Error('SQL failed');
        })).rejects.toThrow('SQL failed');
        expect(read('plans')).toBe('existing');
        const readFailure = vi.spyOn(db, 'getFirstSync').mockImplementation(() => { throw new Error('SQLite busy'); });
        const mutate = vi.fn();
        try {
            await expect(commitSettingsWrite(['plans'], mutate)).rejects.toThrow('SQLite busy');
            expect(mutate).not.toHaveBeenCalled();
            expect(h.flush).not.toHaveBeenCalled();
        } finally {
            readFailure.mockRestore();
        }
    });
});
