import { describe, expect, it } from 'vitest';
import { centeredInset } from './centeredInset';

describe('centeredInset', () => {
    it('adds nothing while the window is narrower than the column', () => {
        expect(centeredInset(375, 760)).toBe(0);
        expect(centeredInset(440, 920)).toBe(0);
        expect(centeredInset(760, 760)).toBe(0);
    });

    it('splits the spare width between both sides of a wide window', () => {
        expect(centeredInset(1440, 760)).toBe(340);
        expect(centeredInset(1440, 920)).toBe(260);
    });

    it('rounds down to whole points', () => {
        expect(centeredInset(1025, 760)).toBe(132);
    });
});
