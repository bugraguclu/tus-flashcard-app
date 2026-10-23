// Behavioral reference: https://docs.ankiweb.net/deck-options.html#auto-advance
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActiveElapsedTimer } from './activeElapsedTimer';
import { useReviewerDwellTimer } from './reviewerDwellTimer';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => vi.useRealTimers());

describe('reviewer dwell lifecycle', () => {
    it('resumes after a modal or background pause without resetting accumulated side time', () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const timer = { current: new ActiveElapsedTimer(0, false) };
        function Harness({ blocked = false, cardId = 1, answer = false }) {
            useReviewerDwellTimer(timer, cardId, answer, true, 5, blocked);
            return null;
        }
        let renderer: TestRenderer.ReactTestRenderer;
        act(() => { renderer = TestRenderer.create(React.createElement(Harness)); });
        try {
            vi.advanceTimersByTime(2000);
            act(() => renderer.update(React.createElement(Harness, { blocked: true })));
            vi.advanceTimersByTime(10000);
            expect(timer.current.elapsed()).toBe(2000);
            act(() => renderer.update(React.createElement(Harness)));
            vi.advanceTimersByTime(1000);
            expect(timer.current.elapsed()).toBe(3000);
            act(() => renderer.update(React.createElement(Harness, { answer: true })));
            expect(timer.current.elapsed()).toBe(0);
            vi.advanceTimersByTime(1000);
            act(() => renderer.update(React.createElement(Harness, { cardId: 2 })));
            expect(timer.current.elapsed()).toBe(0);
        } finally { act(() => renderer.unmount()); }
    });
});
