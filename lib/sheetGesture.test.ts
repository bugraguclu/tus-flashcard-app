import { describe, expect, it } from 'vitest';
import {
    DISMISS_DISTANCE_RATIO,
    DISMISS_VELOCITY,
    MIN_DISMISS_DISTANCE,
    isSheetDrag,
    sheetTranslate,
    shouldDismissSheet,
} from './sheetGesture';

const HEIGHT = 400;

describe('sheetTranslate', () => {
    it('follows the finger downward', () => {
        expect(sheetTranslate(120)).toBe(120);
    });

    it('refuses to lift the sheet above its resting position', () => {
        expect(sheetTranslate(-80)).toBe(0);
        expect(sheetTranslate(0)).toBe(0);
    });

    it('treats a non-finite drag as no movement', () => {
        expect(sheetTranslate(Number.NaN)).toBe(0);
    });
});

describe('shouldDismissSheet', () => {
    it('dismisses once the drag passes the distance threshold', () => {
        const past = HEIGHT * DISMISS_DISTANCE_RATIO;
        expect(shouldDismissSheet({ dy: past, vy: 0, height: HEIGHT })).toBe(true);
        expect(shouldDismissSheet({ dy: past - 1, vy: 0, height: HEIGHT })).toBe(false);
    });

    it('dismisses on a fast flick that barely travelled', () => {
        expect(shouldDismissSheet({ dy: 20, vy: DISMISS_VELOCITY, height: HEIGHT })).toBe(true);
    });

    it('springs back for a slow drag that stopped short', () => {
        expect(shouldDismissSheet({ dy: 40, vy: 0.1, height: HEIGHT })).toBe(false);
    });

    it('ignores a drag too short to be intentional, however fast', () => {
        expect(shouldDismissSheet({ dy: MIN_DISMISS_DISTANCE - 1, vy: 5, height: HEIGHT })).toBe(false);
    });

    it('never dismisses on an upward drag', () => {
        expect(shouldDismissSheet({ dy: -200, vy: -3, height: HEIGHT })).toBe(false);
    });

    it('scales the distance rule with the sheet, not the screen', () => {
        const dy = 120;
        expect(shouldDismissSheet({ dy, vy: 0, height: 300 })).toBe(true);
        expect(shouldDismissSheet({ dy, vy: 0, height: 900 })).toBe(false);
    });

    it('falls back to the velocity rule when the height is unknown', () => {
        expect(shouldDismissSheet({ dy: 200, vy: 0, height: 0 })).toBe(false);
        expect(shouldDismissSheet({ dy: 200, vy: DISMISS_VELOCITY, height: 0 })).toBe(true);
    });
});

describe('isSheetDrag', () => {
    it('claims a clear downward drag', () => {
        expect(isSheetDrag(0, 20)).toBe(true);
    });

    it('leaves an upward drag to the list inside the sheet', () => {
        expect(isSheetDrag(0, -20)).toBe(false);
    });

    it('leaves a mostly horizontal swipe alone', () => {
        expect(isSheetDrag(60, 10)).toBe(false);
    });

    it('ignores the jitter at the start of a tap', () => {
        expect(isSheetDrag(0, 3)).toBe(false);
    });

    it('treats non-finite input as no gesture', () => {
        expect(isSheetDrag(Number.NaN, 20)).toBe(false);
    });
});
