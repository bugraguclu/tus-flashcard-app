// The dock floats clear of the home indicator, its raised button sits centred on the panel's edge
// in an even notch, and a list keeps enough room under its last row for both.
import { describe, expect, it } from 'vitest';
import {
    DOCK,
    dockBottom,
    dockButtonBottom,
    dockClearance,
    dockHiddenOffset,
    dockNotch,
    dockOutlinePath,
    dockReach,
} from './dockGeometry';

const BUTTON = 56;
const BUTTON_RADIUS = 16;

/** The points the path draws through, in order. */
function points(path: string): Array<[number, number]> {
    const tokens = path.split(' ');
    const result: Array<[number, number]> = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const command = tokens[index];
        if (command === 'M' || command === 'L') {
            result.push([Number(tokens[index + 1]), Number(tokens[index + 2])]);
            index += 2;
        } else if (command === 'A') {
            result.push([Number(tokens[index + 6]), Number(tokens[index + 7])]);
            index += 7;
        }
    }
    return result;
}

describe('dock placement', () => {
    it('sits above the home indicator, or a small gap above the edge without one', () => {
        expect(dockBottom(34)).toBe(34);
        expect(dockBottom(0)).toBe(DOCK.minBottom);
    });

    it('centres the raised button on the panel’s top edge', () => {
        const top = dockBottom(34) + DOCK.height;
        expect(dockButtonBottom(34, BUTTON) + BUTTON / 2).toBe(top);
        expect(dockReach(34, BUTTON)).toBe(top + BUTTON / 2);
    });

    it('keeps a list’s last row and the shadow clear of it', () => {
        expect(dockClearance(34, BUTTON)).toBeGreaterThan(dockReach(34, BUTTON));
        expect(dockHiddenOffset(34, BUTTON)).toBeGreaterThan(dockReach(34, BUTTON));
    });
});

describe('dockNotch', () => {
    it('is the button grown by an even gap', () => {
        const notch = dockNotch(BUTTON, BUTTON_RADIUS);
        expect(notch.halfWidth).toBe(BUTTON / 2 + DOCK.notchGap);
        // The button's centre is on the edge, so the notch reaches as deep as it is half wide.
        expect(notch.depth).toBe(notch.halfWidth);
        expect(notch.radius).toBe(BUTTON_RADIUS + DOCK.notchGap);
    });
});

describe('dockOutlinePath', () => {
    const notch = dockNotch(BUTTON, BUTTON_RADIUS);

    it('closes the panel and dips around the middle of its top edge', () => {
        const path = dockOutlinePath(366, DOCK.height, notch);
        expect(path.startsWith('M ')).toBe(true);
        expect(path.endsWith('Z')).toBe(true);
        expect(path).not.toContain('NaN');
        const drawn = points(path);
        const deepest = Math.max(...drawn.filter(([, y]) => y < DOCK.height / 2 + 1).map(([, y]) => y));
        expect(deepest).toBe(notch.depth);
        const floor = drawn.filter(([, y]) => y === notch.depth).map(([x]) => x);
        // The floor is centred on the panel.
        expect(Math.min(...floor) + Math.max(...floor)).toBe(366);
        // Every point stays inside the panel.
        expect(drawn.every(([x, y]) => x >= 0 && x <= 366 && y >= 0 && y <= DOCK.height)).toBe(true);
    });

    it('keeps a stroke whole by drawing inside the box', () => {
        const drawn = points(dockOutlinePath(366, DOCK.height, notch, 0.5));
        expect(Math.min(...drawn.map(([x]) => x))).toBe(0.5);
        expect(Math.max(...drawn.map(([y]) => y))).toBeLessThanOrEqual(366 - 0.5);
        expect(Math.max(...drawn.map(([, y]) => y))).toBe(DOCK.height - 0.5);
    });

    it('draws a plain panel when the notch does not fit, and nothing before it has a size', () => {
        // Nothing is drawn below the top edge near the middle: the corners only.
        const plain = points(dockOutlinePath(366, DOCK.height, null));
        expect(plain.every(([x, y]) => y === 0 || Math.abs(x - 183) > 100)).toBe(true);
        const narrow = points(dockOutlinePath(80, DOCK.height, notch));
        expect(narrow.every(([x, y]) => y === 0 || Math.abs(x - 40) >= 6)).toBe(true);
        expect(dockOutlinePath(0, DOCK.height, notch)).toBe('');
    });
});
