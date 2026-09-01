import { describe, expect, it } from 'vitest';
import {
    filterDeckTree,
    flattenVisibleDeckPicker,
    initialExpandedDeckNames,
} from './deckPickerExpansion';
import type { DeckTreeNode } from './deckManager';
import type { Deck } from './models';

const makeDeck = (id: number, name: string): Deck => ({
    id,
    name,
    mod: 0,
    usn: 0,
    collapsed: false,
    isFiltered: false,
    configId: 1,
    description: '',
});

/** Build the same shape `buildDeckTree` produces, without pulling the database layer in. */
function makeTree(names: string[]): DeckTreeNode[] {
    const nodes = new Map<string, DeckTreeNode>();
    names.forEach((name, index) => {
        nodes.set(name, {
            deck: makeDeck(index + 1, name),
            children: [],
            depth: name.split('::').length - 1,
            newCount: 0,
            learnCount: 0,
            reviewCount: 0,
            totalCards: 0,
        });
    });

    const roots: DeckTreeNode[] = [];
    for (const [name, node] of nodes) {
        const separator = name.lastIndexOf('::');
        const parent = separator > 0 ? nodes.get(name.slice(0, separator)) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
}

const SAMPLE = [
    'Varsayılan',
    'TUS Kartları',
    'TUS Kartları::Deneme ve Soru',
    'TUS Kartları::Deneme ve Soru::Klinik',
    'TUS Kartları::Anatomi',
    'TUS Kartları::Anatomi::Kaslar',
    'TUS Kartları::Anatomi::Sinirler',
    'TUS Kartları::Biyokimya',
    'TUS Kartları::Coğrafya',
];

describe('deck picker expansion', () => {
    it('opens root decks only, so the first level of subdecks is what the user sees', () => {
        const tree = makeTree(SAMPLE);
        const expanded = initialExpandedDeckNames(tree, null);

        expect(expanded.has('TUS Kartları')).toBe(true);
        expect(expanded.has('TUS Kartları::Anatomi')).toBe(false);
        expect(expanded.has('TUS Kartları::Deneme ve Soru')).toBe(false);
        // A deck with no children is never listed as an open branch.
        expect(expanded.has('Varsayılan')).toBe(false);
        expect(expanded.size).toBe(1);

        const names = flattenVisibleDeckPicker(tree, expanded, false).map((row) => row.node.deck.name);
        expect(names).toContain('TUS Kartları::Anatomi');
        expect(names).toContain('TUS Kartları::Biyokimya');
        expect(names).not.toContain('TUS Kartları::Anatomi::Kaslar');
        expect(names).not.toContain('TUS Kartları::Deneme ve Soru::Klinik');
    });

    it('opens the ancestors of a pre-selected subdeck without opening its siblings', () => {
        const tree = makeTree(SAMPLE);
        const expanded = initialExpandedDeckNames(tree, 'TUS Kartları::Anatomi::Kaslar');

        expect(expanded.has('TUS Kartları')).toBe(true);
        expect(expanded.has('TUS Kartları::Anatomi')).toBe(true);
        expect(expanded.has('TUS Kartları::Deneme ve Soru')).toBe(false);

        const names = flattenVisibleDeckPicker(tree, expanded, false).map((row) => row.node.deck.name);
        expect(names).toContain('TUS Kartları::Anatomi::Kaslar');
        expect(names).not.toContain('TUS Kartları::Deneme ve Soru::Klinik');
    });

    it('shows every match while searching, however deep it sits', () => {
        const tree = makeTree(SAMPLE);
        const names = flattenVisibleDeckPicker(filterDeckTree(tree, 'klinik'), new Set(), true)
            .map((row) => row.node.deck.name);

        expect(names).toEqual([
            'TUS Kartları',
            'TUS Kartları::Deneme ve Soru',
            'TUS Kartları::Deneme ve Soru::Klinik',
        ]);
    });

    it('keeps the branch structure when a subdeck matches', () => {
        const filtered = filterDeckTree(makeTree(SAMPLE), 'biyokimya');

        expect(filtered).toHaveLength(1);
        expect(filtered[0].deck.name).toBe('TUS Kartları');
        expect(filtered[0].children.map((child) => child.deck.name)).toEqual(['TUS Kartları::Biyokimya']);
    });

    it('matches Turkish deck names typed with an ASCII keyboard', () => {
        const filtered = filterDeckTree(makeTree(SAMPLE), 'cografya');
        expect(filtered[0]?.children[0]?.deck.name).toBe('TUS Kartları::Coğrafya');
    });

    it('matches across the subdeck separator', () => {
        const filtered = filterDeckTree(makeTree(SAMPLE), 'tus anatomi');
        expect(filtered[0]?.children.map((child) => child.deck.name)).toEqual(['TUS Kartları::Anatomi']);
    });
});
