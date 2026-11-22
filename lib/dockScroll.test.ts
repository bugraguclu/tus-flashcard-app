// The deck list's dock leaves while the learner scrolls down a long list on purpose and comes back
// on any small move up, at the top, at the end and never by itself.
import { describe, expect, it } from 'vitest';
import { DOCK_SCROLL, DOCK_SCROLL_START, dockScrollStep, type DockScrollState } from './dockScroll';

const LONG = { contentHeight: 3000, viewportHeight: 700 };
const END = LONG.contentHeight - LONG.viewportHeight;

/** Feeds the offsets in order and returns whether the dock was hidden after each. */
function scroll(offsets: number[], list = LONG, from: DockScrollState = DOCK_SCROLL_START) {
    let state = from;
    const hidden = offsets.map((offset) => {
        state = dockScrollStep(state, { offset, ...list });
        return state.hidden;
    });
    return { hidden, state };
}

/** Offsets from `start` to `stop` in steps of `step` (a finger's scroll reports). */
function range(start: number, stop: number, step: number): number[] {
    const values: number[] = [];
    for (let offset = start; step > 0 ? offset <= stop : offset >= stop; offset += step) values.push(offset);
    return values;
}

describe('dockScrollStep', () => {
    it('leaves after a deliberate move down past the first rows', () => {
        const { hidden } = scroll(range(0, 400, 10));
        expect(hidden[0]).toBe(false);
        expect(hidden.at(-1)).toBe(true);
        // Not before the offset passes hideAfter: a short scroll keeps the dock.
        const firstHidden = range(0, 400, 10)[hidden.indexOf(true)];
        expect(firstHidden).toBeGreaterThan(DOCK_SCROLL.hideAfter);
    });

    it('stays while the list moves down less than hideAfter', () => {
        const { hidden } = scroll(range(0, DOCK_SCROLL.hideAfter, 4));
        expect(hidden.every((value) => !value)).toBe(true);
    });

    it('returns after a small move up and ignores jitter either way', () => {
        const down = scroll(range(0, 600, 10));
        expect(down.state.hidden).toBe(true);
        // A few points back and forth while reading keeps it away.
        const jitter = scroll([596, 600, 595, 599, 594], LONG, down.state);
        expect(jitter.hidden.every(Boolean)).toBe(true);
        // A move up of showTravel brings it back.
        const up = scroll([jitter.state.offset - DOCK_SCROLL.showTravel], LONG, jitter.state);
        expect(up.state.hidden).toBe(false);
        // Shown again, small moves down do not send it away before hideTravel.
        const again = scroll([592, 596, 590, 598], LONG, up.state);
        expect(again.hidden.every((value) => !value)).toBe(true);
    });

    it('always shows near the top, rubber band included', () => {
        const down = scroll(range(0, 600, 20));
        expect(down.state.hidden).toBe(true);
        const top = scroll([300, 150, DOCK_SCROLL.showWithin - 1], LONG, down.state);
        expect(top.state.hidden).toBe(false);
        expect(scroll([-40], LONG, down.state).state.hidden).toBe(false);
    });

    it('shows at the end of the list, where the footer keeps its room', () => {
        const { hidden, state } = scroll(range(0, END, 25));
        expect(hidden.some(Boolean)).toBe(true);
        expect(state.hidden).toBe(false);
        // The bounce past the end is the end too.
        expect(scroll([END + 60], LONG, { ...state, hidden: true }).state.hidden).toBe(false);
    });

    it('never leaves a list that fits on the screen or barely scrolls', () => {
        const short = { contentHeight: 650, viewportHeight: 700 };
        expect(scroll([0, 40, 90, 140, 40, 0], short).hidden.every((value) => !value)).toBe(true);
        const barely = { contentHeight: 800, viewportHeight: 700 };
        expect(scroll(range(0, 100, 5), barely).hidden.every((value) => !value)).toBe(true);
    });

    it('does not add up moves under a point', () => {
        const slow = scroll(range(150.5, 250, 0.5), LONG, { ...DOCK_SCROLL_START, offset: 150 });
        expect(slow.hidden.every((value) => !value)).toBe(true);
    });
});
