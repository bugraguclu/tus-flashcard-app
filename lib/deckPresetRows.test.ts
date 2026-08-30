import { describe, expect, it } from 'vitest';
import { buildDeckPresetRows } from './deckPresetRows';

const fallbackName = (id: number) => `Grup ${id}`;
const deckCountFor = (id: number) => ({ 1: 12, 2: 0, 3: 1 } as Record<number, number>)[id] ?? 0;

const presets = [
    { id: 1, name: 'Varsayılan' },
    { id: 2, name: '' },
    { id: 3, name: '   ' },
];

describe('buildDeckPresetRows', () => {
    it('keeps the presets in the order they were given', () => {
        const rows = buildDeckPresetRows({ presets, activeId: 1, deckCountFor, fallbackName });
        expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
    });

    it('names an unnamed preset instead of rendering a blank row', () => {
        const rows = buildDeckPresetRows({ presets, activeId: 1, deckCountFor, fallbackName });
        expect(rows.map((row) => row.label)).toEqual(['Varsayılan', 'Grup 2', 'Grup 3']);
    });

    it('marks exactly one row active', () => {
        const rows = buildDeckPresetRows({ presets, activeId: 2, deckCountFor, fallbackName });
        expect(rows.filter((row) => row.active).map((row) => row.id)).toEqual([2]);
    });

    it('marks none active when the deck points at a preset that no longer exists', () => {
        const rows = buildDeckPresetRows({ presets, activeId: 99, deckCountFor, fallbackName });
        expect(rows.some((row) => row.active)).toBe(false);
    });

    it('carries the deck usage count through for the row subtitle', () => {
        const rows = buildDeckPresetRows({ presets, activeId: 1, deckCountFor, fallbackName });
        expect(rows.map((row) => row.deckCount)).toEqual([12, 0, 1]);
    });

    it('gives every row a unique key for the list', () => {
        const rows = buildDeckPresetRows({ presets, activeId: 1, deckCountFor, fallbackName });
        expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    });

    it('returns nothing for an empty collection', () => {
        expect(buildDeckPresetRows({ presets: [], activeId: 1, deckCountFor, fallbackName })).toEqual([]);
    });
});
