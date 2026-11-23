// The Statistics snapshot is cached by collection revision; starting the stopwatch changes none,
// so the Today plan is re-read on focus and on a timer while the screen stays in front.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ read: vi.fn(), focus: null as null | (() => void | (() => void)), blur: null as null | (() => void) }));
vi.mock('expo-router', async () => {
    const ReactModule = await import('react');
    return {
        useFocusEffect: (callback: () => void | (() => void)) => {
            ReactModule.useEffect(() => {
                h.focus = callback;
                const cleanup = callback();
                h.blur = typeof cleanup === 'function' ? cleanup : null;
                return () => { h.blur?.(); };
            }, [callback]);
        },
    };
});
vi.mock('./todayPlanProgress', () => ({ getTodayPlanProgress: h.read }));

import { useLiveTodayPlan } from '../hooks/useLiveTodayPlan';

let latest: unknown;
function Probe() {
    latest = useLiveTodayPlan(4);
    return null;
}
let tree: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    h.read.mockReset();
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.useRealTimers(); });

it('re-reads on focus and every 30 s while focused, and keeps the last value after a failed read', async () => {
    h.read.mockReturnValueOnce({ studiedMs: 0 });
    act(() => { tree = TestRenderer.create(React.createElement(Probe)); });
    expect(latest).toEqual({ studiedMs: 0 });
    h.read.mockReturnValueOnce({ studiedMs: 30_000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(latest).toEqual({ studiedMs: 30_000 });
    h.read.mockImplementationOnce(() => { throw new Error('SQLite busy'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(latest).toEqual({ studiedMs: 30_000 });
    // Blurred: no more reads.
    act(() => h.blur?.());
    const calls = h.read.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(h.read.mock.calls.length).toBe(calls);
});
