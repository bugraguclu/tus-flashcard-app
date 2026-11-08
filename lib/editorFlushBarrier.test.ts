import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorFlushBarrier } from './editorFlushBarrier';

// Found on the iPhone 17 Pro simulator (2026-11-08): an edit typed just before ✓ was saved
// without its last words, because the field's message arrived after the save had read the fields.
afterEach(() => vi.useRealTimers());

describe('EditorFlushBarrier', () => {
    it('waits until the field answers with the token it was sent', async () => {
        const barrier = new EditorFlushBarrier();
        const sent: number[] = [];
        let done = false;
        const wait = barrier.request((token) => sent.push(token)).then(() => { done = true; });
        await Promise.resolve();
        expect(done).toBe(false);

        barrier.settle(sent[0] + 1);
        await Promise.resolve();
        expect(done).toBe(false);

        barrier.settle(sent[0]);
        await wait;
        expect(done).toBe(true);
        expect(barrier.waiting).toBe(0);
    });

    it('lets the save go ahead when the field never answers', async () => {
        vi.useFakeTimers();
        const barrier = new EditorFlushBarrier(400);
        let done = false;
        void barrier.request(() => undefined).then(() => { done = true; });
        await vi.advanceTimersByTimeAsync(399);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
    });

    it('does not wait on a field it could not reach, and releases every wait on unmount', async () => {
        const barrier = new EditorFlushBarrier();
        await barrier.request(() => { throw new Error('no WebView'); });

        const waits = [barrier.request(() => undefined), barrier.request(() => undefined)];
        expect(barrier.waiting).toBe(2);
        barrier.settleAll();
        await Promise.all(waits);
        expect(barrier.waiting).toBe(0);
    });
});
