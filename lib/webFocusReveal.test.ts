// A control reached with Tab keeps its ring in sight: clear of the window's edge and of a floating panel.
import { describe, expect, it } from 'vitest';
import { FOCUS_REVEAL_MARGIN, revealScrollDelta } from './webFocusReveal';

const VISIBLE = { top: 0, bottom: 800 };

describe('revealScrollDelta', () => {
    it('leaves a control with room around it where it is', () => {
        expect(revealScrollDelta({ top: 100, bottom: 150 }, VISIBLE)).toBe(0);
    });

    it('scrolls a control flush with the bottom edge up by the margin', () => {
        expect(revealScrollDelta({ top: 750, bottom: 800 }, VISIBLE)).toBe(FOCUS_REVEAL_MARGIN);
    });

    it('scrolls a control under a floating panel above it', () => {
        // The dock's top at 700 is the visible bottom.
        expect(revealScrollDelta({ top: 690, bottom: 740 }, { top: 0, bottom: 700 })).toBe(740 - 700 + FOCUS_REVEAL_MARGIN);
    });

    it('scrolls back down to a control above the top edge', () => {
        expect(revealScrollDelta({ top: -20, bottom: 30 }, VISIBLE)).toBe(-20 - FOCUS_REVEAL_MARGIN);
    });

    it('lines up the top of a control taller than the room', () => {
        expect(revealScrollDelta({ top: 300, bottom: 1300 }, VISIBLE)).toBe(300 - FOCUS_REVEAL_MARGIN);
    });
});
