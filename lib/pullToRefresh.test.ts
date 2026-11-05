import { describe, expect, it, vi } from 'vitest';
import {
    CLOSE_ANIMATION_MS,
    DONE_HOLD_MS,
    MIN_REFRESH_MS,
    PULL_TRIGGER_DISTANCE,
    isPullArmed,
    pullDistance,
    pullPhase,
    pullPhaseText,
    runPullRefresh,
    type RefreshRunState,
} from './pullToRefresh';

const tr = (turkish: string) => turkish;
const labels = { refreshing: 'Çalışmalarınız yenileniyor…', done: 'Çalışmalarınız yenilendi!' };

/** A clock that only moves when the run sleeps, so every wait is visible in `slept`. */
function fakeClock() {
    let now = 0;
    const slept: number[] = [];
    return {
        now: () => now,
        sleep: async (ms: number) => {
            slept.push(ms);
            now += ms;
        },
        advance: (ms: number) => {
            now += ms;
        },
        slept,
    };
}

describe('pull-to-refresh thresholds', () => {
    it('measures the pull from a negative (rubber-band) offset only', () => {
        expect(pullDistance(-40)).toBe(40);
        expect(pullDistance(0)).toBe(0);
        expect(pullDistance(120)).toBe(0);
    });

    it('arms once the list is pulled past the trigger distance', () => {
        expect(isPullArmed(-(PULL_TRIGGER_DISTANCE - 1))).toBe(false);
        expect(isPullArmed(-PULL_TRIGGER_DISTANCE)).toBe(true);
        expect(isPullArmed(300)).toBe(false);
    });

    it('lets a running refresh win over the finger position', () => {
        expect(pullPhase('idle', false)).toBe('pulling');
        expect(pullPhase('idle', true)).toBe('armed');
        expect(pullPhase('refreshing', true)).toBe('refreshing');
        expect(pullPhase('done', false)).toBe('done');
    });
});

describe('pull-to-refresh copy', () => {
    it('says yenileme, never senkronize', () => {
        const phases = ['pulling', 'armed', 'refreshing', 'done', 'failed'] as const;
        const texts = phases.map((phase) => pullPhaseText(phase, labels, tr));
        expect(texts).toEqual([
            'Yenilemek için çekin',
            'Yenilemek için bırakın',
            'Çalışmalarınız yenileniyor…',
            'Çalışmalarınız yenilendi!',
            'Yenilenemedi, yeniden deneyin',
        ]);
        for (const text of texts) expect(text.toLocaleLowerCase('tr')).not.toContain('senkron');
    });

    it('has English copy', () => {
        const en = (_turkish: string, english: string) => english;
        expect(pullPhaseText('pulling', labels, en)).toBe('Pull to refresh');
        expect(pullPhaseText('armed', labels, en)).toBe('Release to refresh');
    });
});

describe('runPullRefresh', () => {
    it('refreshes, holds the spinner at least MIN_REFRESH_MS, shows done, then folds away', async () => {
        const clock = fakeClock();
        const states: RefreshRunState[] = [];
        const refresh = vi.fn();
        const close = vi.fn();

        const outcome = await runPullRefresh({
            refresh,
            isBusy: () => false,
            isMounted: () => true,
            onState: (state) => states.push(state),
            close,
            now: clock.now,
            sleep: clock.sleep,
        });

        expect(outcome).toBe('done');
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(states).toEqual(['refreshing', 'done', 'idle']);
        expect(close).toHaveBeenCalledTimes(1);
        expect(clock.slept).toEqual([MIN_REFRESH_MS, DONE_HOLD_MS, CLOSE_ANIMATION_MS]);
    });

    it('does not pad a refresh that already took longer than the minimum', async () => {
        const clock = fakeClock();
        await runPullRefresh({
            refresh: async () => clock.advance(MIN_REFRESH_MS + 200),
            isBusy: () => false,
            isMounted: () => true,
            onState: () => undefined,
            close: () => undefined,
            now: clock.now,
            sleep: clock.sleep,
        });
        expect(clock.slept).toEqual([DONE_HOLD_MS, CLOSE_ANIMATION_MS]);
    });

    it('keeps the spinner until the screen has finished loading what it asked for', async () => {
        const clock = fakeClock();
        const states: RefreshRunState[] = [];
        let busyChecks = 0;
        await runPullRefresh({
            refresh: () => undefined,
            // Busy for three polls, as a deferred snapshot is while it builds.
            isBusy: () => ++busyChecks <= 3,
            isMounted: () => true,
            onState: (state) => states.push(state),
            close: () => undefined,
            now: clock.now,
            sleep: clock.sleep,
        });
        expect(clock.slept).toEqual([MIN_REFRESH_MS, 50, 50, 50, DONE_HOLD_MS, CLOSE_ANIMATION_MS]);
        expect(states).toEqual(['refreshing', 'done', 'idle']);
    });

    it('reports a failed refresh instead of claiming it refreshed', async () => {
        const clock = fakeClock();
        const states: RefreshRunState[] = [];
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const outcome = await runPullRefresh({
            refresh: async () => { throw new Error('disk'); },
            isBusy: () => false,
            isMounted: () => true,
            onState: (state) => states.push(state),
            close: () => undefined,
            now: clock.now,
            sleep: clock.sleep,
        });
        warn.mockRestore();
        expect(outcome).toBe('failed');
        expect(states).toEqual(['refreshing', 'failed', 'idle']);
    });

    it('stops reporting once the screen has gone away', async () => {
        const clock = fakeClock();
        const states: RefreshRunState[] = [];
        let mounted = true;
        const close = vi.fn();
        await runPullRefresh({
            refresh: () => { mounted = false; },
            isBusy: () => false,
            isMounted: () => mounted,
            onState: (state) => states.push(state),
            close,
            now: clock.now,
            sleep: clock.sleep,
        });
        expect(states).toEqual(['refreshing']);
        expect(close).not.toHaveBeenCalled();
    });
});
