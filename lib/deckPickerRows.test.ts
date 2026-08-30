import { describe, expect, it } from 'vitest';
import { buildDeckPickerRows, expandableDeckNames, filterDeckTree } from './deckPickerRows';
import type { DeckTreeNode } from './deckManager';

let nextId = 1;

function node(name: string, children: DeckTreeNode[] = []): DeckTreeNode {
    return {
        deck: { id: nextId++, name } as DeckTreeNode['deck'],
        children,
        depth: 0,
        newCount: 0,
        learnCount: 0,
        reviewCount: 0,
        totalCards: 0,
    };
}

function tree(): DeckTreeNode[] {
    return [
        node('Anatomi', [
            node('Anatomi::Kafa', [node('Anatomi::Kafa::Kranium')]),
            node('Anatomi::Toraks'),
        ]),
        node('Fizyoloji'),
    ];
}

const keys = (rows: { key: string }[]) => rows.map((row) => row.key);

describe('expandableDeckNames', () => {
    it('lists only the decks that own children', () => {
        expect([...expandableDeckNames(tree())].sort()).toEqual(['Anatomi', 'Anatomi::Kafa']);
    });

    it('returns an empty set for a flat collection', () => {
        expect(expandableDeckNames([node('Tek')]).size).toBe(0);
    });
});

describe('filterDeckTree', () => {
    it('returns the whole tree when there is no query', () => {
        expect(filterDeckTree(tree(), '')).toHaveLength(2);
    });

    it('keeps a parent whose only match is a descendant', () => {
        const filtered = filterDeckTree(tree(), 'Kranium');

        expect(filtered).toHaveLength(1);
        expect(filtered[0].deck.name).toBe('Anatomi');
        expect(filtered[0].children[0].deck.name).toBe('Anatomi::Kafa');
        expect(filtered[0].children[0].children[0].deck.name).toBe('Anatomi::Kafa::Kranium');
    });

    it('drops branches with no match anywhere', () => {
        expect(filterDeckTree(tree(), 'Fizyoloji').map((n) => n.deck.name)).toEqual(['Fizyoloji']);
    });

    it('does not mutate the tree it was given', () => {
        const source = tree();
        filterDeckTree(source, 'Kranium');
        expect(source[0].children).toHaveLength(2);
    });
});

describe('buildDeckPickerRows', () => {
    it('shows only top-level decks when nothing is expanded', () => {
        const rows = buildDeckPickerRows(tree(), { query: '', expanded: new Set(), searching: false });
        expect(keys(rows)).toEqual(['Anatomi', 'Fizyoloji']);
    });

    it('walks into a deck once it is expanded', () => {
        const rows = buildDeckPickerRows(tree(), {
            query: '',
            expanded: new Set(['Anatomi']),
            searching: false,
        });
        expect(keys(rows)).toEqual(['Anatomi', 'Anatomi::Kafa', 'Anatomi::Toraks', 'Fizyoloji']);
    });

    it('reports depth so the row can indent itself', () => {
        const rows = buildDeckPickerRows(tree(), {
            query: '',
            expanded: new Set(['Anatomi', 'Anatomi::Kafa']),
            searching: false,
        });
        expect(rows.map((row) => [row.key, row.depth])).toEqual([
            ['Anatomi', 0],
            ['Anatomi::Kafa', 1],
            ['Anatomi::Kafa::Kranium', 2],
            ['Anatomi::Toraks', 1],
            ['Fizyoloji', 0],
        ]);
    });

    it('force-expands matches while searching so a nested hit is never hidden', () => {
        const rows = buildDeckPickerRows(tree(), {
            query: 'Kranium',
            expanded: new Set(),
            searching: true,
        });
        expect(keys(rows)).toEqual(['Anatomi', 'Anatomi::Kafa', 'Anatomi::Kafa::Kranium']);
    });

    it('ignores a whitespace-only query rather than treating it as a search', () => {
        const rows = buildDeckPickerRows(tree(), { query: '   ', expanded: new Set(), searching: true });
        expect(keys(rows)).toEqual(['Anatomi', 'Fizyoloji']);
    });

    it('marks which rows can be expanded', () => {
        const rows = buildDeckPickerRows(tree(), { query: '', expanded: new Set(), searching: false });
        expect(rows.map((row) => [row.key, row.hasChildren])).toEqual([
            ['Anatomi', true],
            ['Fizyoloji', false],
        ]);
    });

    it('gives every row a unique key for the list', () => {
        const rows = buildDeckPickerRows(tree(), {
            query: '',
            expanded: expandableDeckNames(tree()),
            searching: false,
        });
        expect(new Set(keys(rows)).size).toBe(rows.length);
    });

    it('returns nothing when the query matches no deck', () => {
        expect(buildDeckPickerRows(tree(), { query: 'zzz', expanded: new Set(), searching: true })).toEqual([]);
    });
});
