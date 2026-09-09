import { describe, expect, it, vi } from 'vitest';
import { observeStartupRun, StartupCoordinator } from './startupCoordinator';

function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('StartupCoordinator', () => {
    it('keeps startup single-flight while an attempt is running', async () => {
        const pending = deferred();
        const core = vi.fn(() => pending.promise);
        const coordinator = new StartupCoordinator();

        const first = coordinator.start(core);
        const second = coordinator.start(core);

        expect(second).toBe(first);
        expect(first.generation).toBe(1);
        await Promise.resolve();
        expect(core).toHaveBeenCalledTimes(1);

        pending.resolve();
        await first.promise;
        expect(coordinator.state).toBe('succeeded');
    });

    it('reports a UI timeout without cancelling or failing the core attempt', async () => {
        vi.useFakeTimers();
        try {
            const pending = deferred();
            const coordinator = new StartupCoordinator();
            const run = coordinator.start(() => pending.promise);
            const observation = observeStartupRun(run, 30_000);

            await vi.advanceTimersByTimeAsync(30_000);
            await expect(observation).resolves.toEqual({ kind: 'timeout', generation: 1 });
            expect(coordinator.state).toBe('running');

            pending.resolve();
            await run.promise;
            expect(coordinator.state).toBe('succeeded');
        } finally {
            vi.useRealTimers();
        }
    });

    it('allows a new generation only after a genuine failure', async () => {
        const firstAttempt = deferred();
        const secondAttempt = deferred();
        const core = vi.fn()
            .mockImplementationOnce(() => firstAttempt.promise)
            .mockImplementationOnce(() => secondAttempt.promise);
        const coordinator = new StartupCoordinator();

        const first = coordinator.start(core);
        firstAttempt.reject(new Error('migration failed'));
        await expect(first.promise).rejects.toThrow('migration failed');
        expect(coordinator.state).toBe('failed');

        const second = coordinator.start(core);
        expect(second.generation).toBe(2);
        expect(second).not.toBe(first);
        secondAttempt.resolve();
        await second.promise;
        expect(coordinator.state).toBe('succeeded');
        expect(core).toHaveBeenCalledTimes(2);
    });
});
