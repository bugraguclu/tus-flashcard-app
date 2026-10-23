// Anki's browser flag toggle (https://docs.ankiweb.net/browsing.html), independently implemented.
import { expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ flags: new Map<number, number>() }));
vi.mock('./noteManager', () => ({ getAnkiCard: (id: number) => (h.flags.has(id) ? { id, flags: h.flags.get(id) } : null) }));
import { flagForSelection } from './browserFlags';

it('clears a flag the current card already has and sets any other', () => {
    h.flags.set(1, 2); h.flags.set(2, 0);
    expect(flagForSelection([1, 2], 2)).toBe(0);
    expect(flagForSelection([1, 2], 3)).toBe(3);
    expect(flagForSelection([2, 1], 2)).toBe(2);
    expect(flagForSelection([], 4)).toBe(4);
});
