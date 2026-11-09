import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    LatestSnapshotGeneration,
    ScreenSnapshotRepository,
    runAfterFrames,
    runAfterInteractionsWithin,
} from './screenSnapshotLoader';

describe('heavy-screen snapshot loading', () => {
    it('does not let an older deck/filter generation overwrite the newest result', async () => {
        const generation = new LatestSnapshotGeneration();
        const committed: string[] = [];
        let finishOld!: (value: string) => void;
        let finishNew!: (value: string) => void;
        const oldResult = new Promise<string>((resolve) => { finishOld = resolve; });
        const newResult = new Promise<string>((resolve) => { finishNew = resolve; });

        const oldToken = generation.begin();
        const oldCommit = oldResult.then((value) => generation.commit(oldToken, () => committed.push(value)));
        const newToken = generation.begin();
        const newCommit = newResult.then((value) => generation.commit(newToken, () => committed.push(value)));

        finishNew('new-deck');
        await newCommit;
        finishOld('old-deck');
        await oldCommit;

        expect(committed).toEqual(['new-deck']);
    });

    it('builds one snapshot for an identical scope/range/revision key', () => {
        const repository = new ScreenSnapshotRepository<{ value: number }>();
        let builds = 0;
        const create = () => ({ value: ++builds });

        const first = repository.getOrCreate('scope:range:revision', create);
        const second = repository.getOrCreate('scope:range:revision', create);

        expect(first).toBe(second);
        expect(builds).toBe(1);
    });
});

describe('runAfterInteractionsWithin', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    /** A stand-in for `InteractionManager`: interactions settle only when the test says so. */
    function interactions() {
        let pending: (() => void) | null = null;
        let cancelled = false;
        return {
            schedule: (callback: () => void) => {
                pending = callback;
                return { cancel: () => { cancelled = true; } };
            },
            settle: () => pending?.(),
            get cancelled() { return cancelled; },
        };
    }

    it('runs once interactions settle and not again when the wait runs out', () => {
        vi.useFakeTimers();
        const manager = interactions();
        const work = vi.fn();
        runAfterInteractionsWithin(work, manager.schedule, 500);

        manager.settle();
        expect(work).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1000);
        expect(work).toHaveBeenCalledTimes(1);
    });

    it('runs after the longest wait when an animation never ends, and only once', () => {
        vi.useFakeTimers();
        const manager = interactions();
        const work = vi.fn();
        runAfterInteractionsWithin(work, manager.schedule, 500);

        vi.advanceTimersByTime(499);
        expect(work).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(work).toHaveBeenCalledTimes(1);
        expect(manager.cancelled).toBe(true);
        manager.settle();
        expect(work).toHaveBeenCalledTimes(1);
    });

    it('never runs once cancelled', () => {
        vi.useFakeTimers();
        const manager = interactions();
        const work = vi.fn();
        runAfterInteractionsWithin(work, manager.schedule, 500).cancel();

        expect(manager.cancelled).toBe(true);
        manager.settle();
        vi.advanceTimersByTime(1000);
        expect(work).not.toHaveBeenCalled();
    });
});

describe('runAfterFrames', () => {
    /** A stand-in for the display: a frame happens only when the test draws one. */
    function display() {
        const queued = new Map<number, () => void>();
        let nextHandle = 1;
        return {
            request: (callback: () => void) => {
                queued.set(nextHandle, callback);
                return nextHandle++;
            },
            cancel: (handle: number) => { queued.delete(handle); },
            drawFrame: () => {
                const callbacks = [...queued.values()];
                queued.clear();
                callbacks.forEach((callback) => callback());
            },
            get waiting() { return queued.size; },
        };
    }

    it('lets the frames be drawn before the work starts', () => {
        const screen = display();
        const work = vi.fn();
        runAfterFrames(work, 3, screen.request, screen.cancel);

        expect(work).not.toHaveBeenCalled();
        screen.drawFrame();
        screen.drawFrame();
        expect(work).not.toHaveBeenCalled();
        screen.drawFrame();
        expect(work).toHaveBeenCalledTimes(1);
        expect(screen.waiting).toBe(0);
    });

    it('never runs work that was cancelled between two frames', () => {
        const screen = display();
        const work = vi.fn();
        const task = runAfterFrames(work, 2, screen.request, screen.cancel);

        screen.drawFrame();
        task.cancel();
        expect(screen.waiting).toBe(0);
        screen.drawFrame();
        screen.drawFrame();
        expect(work).not.toHaveBeenCalled();
    });

    it('waits for one frame at least', () => {
        const screen = display();
        const work = vi.fn();
        runAfterFrames(work, 0, screen.request, screen.cancel);

        expect(work).not.toHaveBeenCalled();
        screen.drawFrame();
        expect(work).toHaveBeenCalledTimes(1);
    });

    it('still runs when the wait runs out with no frame drawn', () => {
        vi.useFakeTimers();
        const screen = display();
        const work = vi.fn();
        runAfterInteractionsWithin(work, (callback) => runAfterFrames(callback, 3, screen.request, screen.cancel), 500);

        screen.drawFrame();
        vi.advanceTimersByTime(500);
        expect(work).toHaveBeenCalledTimes(1);
        // The frames it no longer waits for are given back, and a late one does not run it twice.
        expect(screen.waiting).toBe(0);
        screen.drawFrame();
        expect(work).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
