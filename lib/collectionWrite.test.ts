import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ flush: vi.fn(), readOnly: vi.fn() }));
vi.mock('./db', () => ({
    flushDatabaseWrites: storage.flush,
    readOnlyTabMessage: storage.readOnly,
}));
import { commitCollectionWrite } from './collectionWrite';

beforeEach(() => {
    storage.flush.mockReset().mockResolvedValue(undefined);
    storage.readOnly.mockReset().mockReturnValue(null);
});

describe('collection operation acknowledgement', () => {
    it('keeps success pending until the durable commit completes', async () => {
        let finish!: () => void;
        storage.flush.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
        const success = vi.fn();
        const pending = commitCollectionWrite(() => ({ noteId: 42 })).then(success);
        await vi.waitFor(() => expect(storage.flush).toHaveBeenCalledOnce());
        expect(success).not.toHaveBeenCalled();
        finish();
        await pending;
        expect(success).toHaveBeenCalledWith({ noteId: 42 });
    });

    it('propagates storage failure and rolls back a retryable mutation', async () => {
        storage.flush.mockRejectedValue(new Error('Quota exceeded'));
        const rollback = vi.fn();
        const success = vi.fn();
        await expect(commitCollectionWrite(() => 42, rollback).then(success)).rejects.toThrow('Quota exceeded');
        expect(success).not.toHaveBeenCalled();
        expect(rollback).toHaveBeenCalledWith(42);
    });

    it('rejects a read-only tab before changing the collection', async () => {
        storage.readOnly.mockReturnValue('Bu sekme salt okunur.');
        const write = vi.fn();
        await expect(commitCollectionWrite(write)).rejects.toThrow('Bu sekme salt okunur.');
        expect(write).not.toHaveBeenCalled();
        expect(storage.flush).not.toHaveBeenCalled();
    });

    it('awaits every asynchronous import step before flushing', async () => {
        let finish!: () => void;
        const pending = commitCollectionWrite(() => new Promise<string>((resolve) => { finish = () => resolve('imported'); }));
        expect(storage.flush).not.toHaveBeenCalled();
        finish();
        await expect(pending).resolves.toBe('imported');
        expect(storage.flush).toHaveBeenCalledOnce();
    });

    it('does not flush or acknowledge a failed mutation', async () => {
        await expect(commitCollectionWrite(() => { throw new Error('SQL failed'); })).rejects.toThrow('SQL failed');
        expect(storage.flush).not.toHaveBeenCalled();
    });
});
