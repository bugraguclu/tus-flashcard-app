import { describe, expect, it } from 'vitest';
import {
    decodeDeckDropTarget,
    encodeDeckDropTarget,
    resolveDeckDropTarget,
    ROOT_DROP_TARGET,
    type DeckDropRow,
} from './deckDropTarget';

/** Three 60pt rows stacked without gaps, the way the list lays out in content space. */
function stackedRows(overrides: Partial<Record<string, Partial<DeckDropRow>>> = {}): DeckDropRow[] {
    return ['Anatomi', 'Fizyoloji', 'Biyokimya'].map((name, index) => ({
        name,
        y: index * 60,
        h: 60,
        invalid: false,
        acceptsInside: true,
        ...overrides[name],
    }));
}

describe('deck drop target encoding', () => {
    it('round-trips every placement', () => {
        expect(decodeDeckDropTarget(encodeDeckDropTarget('Anatomi', 'inside')))
            .toEqual({ kind: 'deck', name: 'Anatomi', placement: 'inside' });
        expect(decodeDeckDropTarget(encodeDeckDropTarget('A::B', 'after')))
            .toEqual({ kind: 'deck', name: 'A::B', placement: 'after' });
        expect(decodeDeckDropTarget(ROOT_DROP_TARGET)).toEqual({ kind: 'root' });
    });

    it('rejects empty and malformed targets', () => {
        expect(decodeDeckDropTarget(null)).toBeNull();
        expect(decodeDeckDropTarget('')).toBeNull();
        expect(decodeDeckDropTarget('Anatomi')).toBeNull();
        expect(decodeDeckDropTarget('sideways:Anatomi')).toBeNull();
    });

    it('keeps deck names containing a colon intact', () => {
        expect(decodeDeckDropTarget('before:19:00 tekrar'))
            .toEqual({ kind: 'deck', name: '19:00 tekrar', placement: 'before' });
    });
});

describe('resolveDeckDropTarget', () => {
    it('splits a row into reorder edges and a nesting middle', () => {
        const rows = stackedRows();
        expect(resolveDeckDropTarget(5, rows)).toBe('before:Anatomi');
        expect(resolveDeckDropTarget(30, rows)).toBe('inside:Anatomi');
        expect(resolveDeckDropTarget(55, rows)).toBe('after:Anatomi');
    });

    it('resolves each row against its own position, not the first row in the list', () => {
        const rows = stackedRows();
        expect(resolveDeckDropTarget(90, rows)).toBe('inside:Fizyoloji');
        expect(resolveDeckDropTarget(150, rows)).toBe('inside:Biyokimya');
        expect(resolveDeckDropTarget(175, rows)).toBe('after:Biyokimya');
    });

    it('refuses a drop onto a row that accepts nothing', () => {
        const rows = stackedRows({ Fizyoloji: { invalid: true } });
        expect(resolveDeckDropTarget(90, rows)).toBeNull();
    });

    it('sends the middle of a row that cannot adopt children to its nearer edge', () => {
        const rows = stackedRows({ Fizyoloji: { acceptsInside: false } });
        expect(resolveDeckDropTarget(85, rows)).toBe('before:Fizyoloji');
        expect(resolveDeckDropTarget(95, rows)).toBe('after:Fizyoloji');
    });

    it('snaps a small gap between cards to the nearest row', () => {
        const rows: DeckDropRow[] = [
            { name: 'Anatomi', y: 0, h: 60, invalid: false, acceptsInside: true },
            { name: 'Fizyoloji', y: 70, h: 60, invalid: false, acceptsInside: true },
        ];
        expect(resolveDeckDropTarget(63, rows)).toBe('after:Anatomi');
        expect(resolveDeckDropTarget(67, rows)).toBe('before:Fizyoloji');
    });

    it('treats the empty space past the last row as "place last"', () => {
        const rows = stackedRows();
        expect(resolveDeckDropTarget(600, rows)).toBe('after:Biyokimya');
    });

    it('places above the first valid row when the pointer is above the list', () => {
        const rows = stackedRows({ Anatomi: { invalid: true } });
        expect(resolveDeckDropTarget(-200, rows)).toBe('before:Fizyoloji');
    });

    it('ignores invalid rows when picking the ends of the list', () => {
        const rows = stackedRows({ Biyokimya: { invalid: true } });
        expect(resolveDeckDropTarget(600, rows)).toBe('after:Fizyoloji');
    });

    it('has no target when every row refuses the drop', () => {
        const rows = stackedRows({
            Anatomi: { invalid: true },
            Fizyoloji: { invalid: true },
            Biyokimya: { invalid: true },
        });
        expect(resolveDeckDropTarget(600, rows)).toBeNull();
        expect(resolveDeckDropTarget(90, rows)).toBeNull();
    });

    it('has no target when nothing has been laid out yet', () => {
        expect(resolveDeckDropTarget(120, [])).toBeNull();
    });

    it('keeps rows of different heights on their own boundaries', () => {
        const rows: DeckDropRow[] = [
            { name: 'Anatomi', y: 0, h: 100, invalid: false, acceptsInside: true },
            { name: 'Fizyoloji', y: 100, h: 40, invalid: false, acceptsInside: true },
        ];
        expect(resolveDeckDropTarget(80, rows)).toBe('after:Anatomi');
        expect(resolveDeckDropTarget(105, rows)).toBe('before:Fizyoloji');
        expect(resolveDeckDropTarget(120, rows)).toBe('inside:Fizyoloji');
        expect(resolveDeckDropTarget(135, rows)).toBe('after:Fizyoloji');
    });
});
