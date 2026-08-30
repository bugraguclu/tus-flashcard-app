import { describe, it, expect } from 'vitest';
import {
    parseCount,
    decodeDeckDropTarget,
    encodeDeckDropTarget,
    remapExpandedDeckPaths,
    ROOT_DROP_TARGET,
} from './decksScreen';

describe('parseCount', () => {
    it('parses a plain integer', () => {
        expect(parseCount('42')).toBe(42);
    });

    it('clamps negative values to zero', () => {
        expect(parseCount('-5')).toBe(0);
    });

    it('returns the fallback for non-numeric input', () => {
        expect(parseCount('abc')).toBe(0);
        expect(parseCount('abc', 7)).toBe(7);
    });

    it('reads the leading integer of a mixed string', () => {
        expect(parseCount('12px')).toBe(12);
    });
});

describe('encodeDeckDropTarget / decodeDeckDropTarget', () => {
    it('encodes placement and name into a target string', () => {
        expect(encodeDeckDropTarget('Anatomi', 'inside')).toBe('inside:Anatomi');
    });

    it('is a round-trip with decode', () => {
        const target = encodeDeckDropTarget('Anatomi::Kafa', 'before');
        expect(decodeDeckDropTarget(target)).toEqual({
            kind: 'deck',
            placement: 'before',
            name: 'Anatomi::Kafa',
        });
    });

    it('decodes the root drop target', () => {
        expect(decodeDeckDropTarget(ROOT_DROP_TARGET)).toEqual({ kind: 'root' });
    });

    it('returns null for empty input', () => {
        expect(decodeDeckDropTarget(null)).toBeNull();
        expect(decodeDeckDropTarget('')).toBeNull();
    });

    it('returns null when there is no separator', () => {
        expect(decodeDeckDropTarget('inside')).toBeNull();
    });

    it('returns null for an unknown placement', () => {
        expect(decodeDeckDropTarget('sideways:Anatomi')).toBeNull();
    });

    it('preserves a name that contains a colon', () => {
        expect(decodeDeckDropTarget('after:a:b')).toEqual({
            kind: 'deck',
            placement: 'after',
            name: 'a:b',
        });
    });
});

describe('remapExpandedDeckPaths', () => {
    it('renames an exact path match', () => {
        const result = remapExpandedDeckPaths(new Set(['Anatomi']), 'Anatomi', 'Anatomy');
        expect(result).toEqual(new Set(['Anatomy']));
    });

    it('renames the moved subtree and its descendants', () => {
        const paths = new Set(['Anatomi', 'Anatomi::Kafa', 'Fizyoloji']);
        const result = remapExpandedDeckPaths(paths, 'Anatomi', 'Anatomy');
        expect(result).toEqual(new Set(['Anatomy', 'Anatomy::Kafa', 'Fizyoloji']));
    });

    it('leaves unrelated paths untouched', () => {
        const paths = new Set(['Fizyoloji', 'Biyokimya']);
        const result = remapExpandedDeckPaths(paths, 'Anatomi', 'Anatomy');
        expect(result).toEqual(new Set(['Fizyoloji', 'Biyokimya']));
    });

    it('additionally expands a requested path', () => {
        const result = remapExpandedDeckPaths(new Set(['Anatomi']), 'Anatomi', 'Anatomy', 'Anatomy::Kafa');
        expect(result).toEqual(new Set(['Anatomy', 'Anatomy::Kafa']));
    });
});
