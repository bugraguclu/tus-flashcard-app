import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    LatestSnapshotGeneration,
    ScreenSnapshotRepository,
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
