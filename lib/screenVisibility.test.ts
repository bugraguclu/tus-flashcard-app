import { describe, expect, it } from 'vitest';
import {
    isScreenVisible,
    nextScreenVisibility,
    type ScreenVisibility,
    type ScreenVisibilityEvent,
} from './screenVisibility';

function replay(events: ScreenVisibilityEvent[], visibility: ScreenVisibility = 'shown'): ScreenVisibility {
    return events.reduce(nextScreenVisibility, visibility);
}

const coveredByPush: ScreenVisibilityEvent[] = [
    { type: 'transitionStart', closing: true, focused: false },
    { type: 'transitionEnd', closing: true, focused: false },
];

describe('screen visibility', () => {
    it('stays visible while a screen pushed on top is still sliding in', () => {
        expect(replay([{ type: 'transitionStart', closing: true, focused: false }])).toBe('shown');
    });

    it('is hidden once the screen on top has fully covered it', () => {
        expect(replay(coveredByPush)).toBe('hidden');
    });

    it('stays visible under a sheet, which blurs the screen but never covers it', () => {
        // A form sheet sends the presenting screen nothing but blur, which is not an event here.
        expect(isScreenVisible(replay([]))).toBe(true);
    });

    it('is visible from the first frame of a back swipe, before focus returns', () => {
        const swiping = replay([...coveredByPush, { type: 'transitionStart', closing: false, focused: false }]);
        expect(swiping).toBe('revealing');
        expect(isScreenVisible(swiping)).toBe(true);
    });

    it('is shown for good once the back swipe completes', () => {
        expect(replay([
            ...coveredByPush,
            { type: 'transitionStart', closing: false, focused: false },
            { type: 'transitionEnd', closing: false, focused: true },
            { type: 'focus' },
            { type: 'gestureCancel' },
        ])).toBe('shown');
    });

    it('is hidden again when the back swipe is abandoned', () => {
        expect(replay([
            ...coveredByPush,
            { type: 'transitionStart', closing: false, focused: false },
            { type: 'gestureCancel' },
        ])).toBe('hidden');
    });

    it('ignores an abandoned swipe that was revealing some other screen', () => {
        expect(replay([{ type: 'gestureCancel' }])).toBe('shown');
    });

    it('ignores a covering transition that finishes after the screen was focused again', () => {
        // Popping back before the push animation ends: focus is back before UIKit reports the
        // first transition as finished.
        expect(replay([
            { type: 'transitionStart', closing: true, focused: false },
            { type: 'focus' },
            { type: 'transitionEnd', closing: true, focused: true },
        ])).toBe('shown');
    });

    it('is shown whenever the screen takes focus', () => {
        expect(replay([{ type: 'focus' }], 'hidden')).toBe('shown');
    });
});
