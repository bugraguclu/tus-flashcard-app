import { describe, expect, it } from 'vitest';
import {
    filterDeckTree,
    flattenVisibleDeckPicker,
    initialExpandedDeckNames,
    prioritizeDeckTree,
    resolveTargetDeckPath,
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

    it('opens the selected course and its ancestors so its subdecks are visible while siblings remain closed', () => {
        const tree = makeTree(SAMPLE);
        const expanded = initialExpandedDeckNames(tree, 'TUS Kartları::Anatomi');

        expect(expanded.has('TUS Kartları')).toBe(true);
        expect(expanded.has('TUS Kartları::Anatomi')).toBe(true);
        expect(expanded.has('TUS Kartları::Deneme ve Soru')).toBe(false);
        expect(expanded.has('TUS Kartları::Biyokimya')).toBe(false);

        const names = flattenVisibleDeckPicker(tree, expanded, false).map((row) => row.node.deck.name);
        expect(names).toContain('TUS Kartları::Anatomi::Kaslar');
        expect(names).toContain('TUS Kartları::Anatomi::Sinirler');
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

    it('prioritizes the active deck branch to come first at every level', () => {
        const tree = makeTree(SAMPLE);
        const prioritized = prioritizeDeckTree(tree, 'TUS Kartları::Anatomi');

        // TUS Kartları is moved ahead of Varsayılan at the root level
        expect(prioritized[0].deck.name).toBe('TUS Kartları');
        expect(prioritized[1].deck.name).toBe('Varsayılan');

        // Anatomi is moved ahead of Deneme ve Soru inside TUS Kartları
        const childNames = prioritized[0].children.map((c) => c.deck.name);
        expect(childNames[0]).toBe('TUS Kartları::Anatomi');
        expect(childNames.slice(1)).toEqual([
            'TUS Kartları::Deneme ve Soru',
            'TUS Kartları::Biyokimya',
            'TUS Kartları::Coğrafya',
        ]);
    });

    it('prioritizes deep subdecks to the top of their parent deck', () => {
        const tree = makeTree(SAMPLE);
        const prioritized = prioritizeDeckTree(tree, 'TUS Kartları::Anatomi::Sinirler');

        expect(prioritized[0].deck.name).toBe('TUS Kartları');
        const anatomiNode = prioritized[0].children[0];
        expect(anatomiNode.deck.name).toBe('TUS Kartları::Anatomi');

        // Sinirler is moved ahead of Kaslar inside Anatomi
        const anatomiChildren = anatomiNode.children.map((c) => c.deck.name);
        expect(anatomiChildren).toEqual([
            'TUS Kartları::Anatomi::Sinirler',
            'TUS Kartları::Anatomi::Kaslar',
        ]);
    });

    it('leaves tree order intact when active deck is not specified or not found', () => {
        const tree = makeTree(SAMPLE);
        const unmodifiedNull = prioritizeDeckTree(tree, null);
        expect(unmodifiedNull[0].deck.name).toBe('Varsayılan');

        const unmodifiedNotFound = prioritizeDeckTree(tree, 'Bilinmeyen Deste');
        expect(unmodifiedNotFound[0].deck.name).toBe('Varsayılan');
    });

    it('produces the exact study layout: active deck first and open, other subdecks closed', () => {
        const tree = makeTree(SAMPLE);
        const activeDeck = 'TUS Kartları::Anatomi';
        const prioritized = prioritizeDeckTree(tree, activeDeck);
        const expanded = initialExpandedDeckNames(prioritized, activeDeck);
        const rows = flattenVisibleDeckPicker(prioritized, expanded, false);
        const names = rows.map((r) => r.node.deck.name);

        expect(names).toEqual([
            'TUS Kartları',
            'TUS Kartları::Anatomi',
            'TUS Kartları::Anatomi::Kaslar',
            'TUS Kartları::Anatomi::Sinirler',
            'TUS Kartları::Deneme ve Soru',
            'TUS Kartları::Biyokimya',
            'TUS Kartları::Coğrafya',
            'Varsayılan',
        ]);
    });

    it('leaves the other root decks closed so only the studied branch is unfolded', () => {
        const tree = makeTree([
            ...SAMPLE,
            'Farmakoloji Notlarım',
            'Farmakoloji Notlarım::Antibiyotikler',
            'Özel Çalışma',
            'Özel Çalışma::Zor Kartlar',
        ]);
        const activeDeck = 'TUS Kartları::Anatomi';
        const prioritized = prioritizeDeckTree(tree, activeDeck);
        const expanded = initialExpandedDeckNames(prioritized, activeDeck);

        expect(expanded.has('Farmakoloji Notlarım')).toBe(false);
        expect(expanded.has('Özel Çalışma')).toBe(false);

        const names = flattenVisibleDeckPicker(prioritized, expanded, false).map((row) => row.node.deck.name);
        expect(names).toEqual([
            'TUS Kartları',
            'TUS Kartları::Anatomi',
            'TUS Kartları::Anatomi::Kaslar',
            'TUS Kartları::Anatomi::Sinirler',
            'TUS Kartları::Deneme ve Soru',
            'TUS Kartları::Biyokimya',
            'TUS Kartları::Coğrafya',
            'Varsayılan',
            'Farmakoloji Notlarım',
            'Özel Çalışma',
        ]);
    });

    it('still opens every root when no deck is active, so the picker is not a list of bare roots', () => {
        const tree = makeTree([
            ...SAMPLE,
            'Farmakoloji Notlarım',
            'Farmakoloji Notlarım::Antibiyotikler',
        ]);
        const expanded = initialExpandedDeckNames(tree, null);

        expect(expanded.has('TUS Kartları')).toBe(true);
        expect(expanded.has('Farmakoloji Notlarım')).toBe(true);
        expect(expanded.has('TUS Kartları::Anatomi')).toBe(false);
    });

    it('opens only the active branch when the studied deck is a leaf under a busy collection', () => {
        const tree = makeTree([
            ...SAMPLE,
            'Farmakoloji Notlarım',
            'Farmakoloji Notlarım::Antibiyotikler',
        ]);
        const activeDeck = 'TUS Kartları::Deneme ve Soru::Klinik';
        const prioritized = prioritizeDeckTree(tree, activeDeck);
        const expanded = initialExpandedDeckNames(prioritized, activeDeck);

        expect([...expanded].sort()).toEqual([
            'TUS Kartları',
            'TUS Kartları::Deneme ve Soru',
            'TUS Kartları::Deneme ve Soru::Klinik',
        ]);

        const names = flattenVisibleDeckPicker(prioritized, expanded, false).map((row) => row.node.deck.name);
        expect(names).not.toContain('TUS Kartları::Anatomi::Kaslar');
        expect(names).not.toContain('Farmakoloji Notlarım::Antibiyotikler');
    });

    it('opens a targeted root deck alone, leaving the other roots closed', () => {
        const tree = makeTree([
            ...SAMPLE,
            'Farmakoloji Notlarım',
            'Farmakoloji Notlarım::Antibiyotikler',
        ]);
        const expanded = initialExpandedDeckNames(tree, 'TUS Kartları');

        expect([...expanded]).toEqual(['TUS Kartları']);
        expect(expanded.has('Farmakoloji Notlarım')).toBe(false);
    });

    it('falls back to the roots when the target is a top-level deck with nothing to reveal', () => {
        const tree = makeTree([
            ...SAMPLE,
            'Farmakoloji Notlarım',
            'Farmakoloji Notlarım::Antibiyotikler',
        ]);
        // The import screen defaults its target to "Varsayılan": singling that leaf out would
        // collapse the whole collection to a list of bare root names for no gain.
        const expanded = initialExpandedDeckNames(tree, 'Varsayılan');

        expect(expanded.has('TUS Kartları')).toBe(true);
        expect(expanded.has('Farmakoloji Notlarım')).toBe(true);
        expect(expanded.has('TUS Kartları::Anatomi')).toBe(false);
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

    describe('resolveTargetDeckPath', () => {
        const tree = makeTree(SAMPLE);

        it('resolves exact full deck names', () => {
            expect(resolveTargetDeckPath(tree, 'TUS Kartları::Anatomi')).toBe('TUS Kartları::Anatomi');
            expect(resolveTargetDeckPath(tree, 'TUS Kartları::Anatomi::Kaslar')).toBe('TUS Kartları::Anatomi::Kaslar');
            expect(resolveTargetDeckPath(tree, 'TUS Kartları')).toBe('TUS Kartları');
        });

        it('resolves partial course names without root deck prefix', () => {
            expect(resolveTargetDeckPath(tree, 'Anatomi')).toBe('TUS Kartları::Anatomi');
            expect(resolveTargetDeckPath(tree, 'Biyokimya')).toBe('TUS Kartları::Biyokimya');
        });

        it('resolves topic leaf names to their full path', () => {
            expect(resolveTargetDeckPath(tree, 'Kaslar')).toBe('TUS Kartları::Anatomi::Kaslar');
            expect(resolveTargetDeckPath(tree, 'Sinirler')).toBe('TUS Kartları::Anatomi::Sinirler');
        });

        it('resolves case-insensitively and handles Turkish characters', () => {
            expect(resolveTargetDeckPath(tree, 'anatomi')).toBe('TUS Kartları::Anatomi');
            expect(resolveTargetDeckPath(tree, 'biyokimya')).toBe('TUS Kartları::Biyokimya');
            expect(resolveTargetDeckPath(tree, 'Coğrafya')).toBe('TUS Kartları::Coğrafya');
        });

        it('returns null for null, empty or unknown decks', () => {
            expect(resolveTargetDeckPath(tree, null)).toBeNull();
            expect(resolveTargetDeckPath(tree, undefined)).toBeNull();
            expect(resolveTargetDeckPath(tree, '   ')).toBeNull();
            expect(resolveTargetDeckPath(tree, 'Bilinmeyen Kurs')).toBeNull();
        });
    });

    describe('trial catalog and short name expansion', () => {
        const TRIAL_SAMPLE = [
            'Varsayılan',
            'TUS Deneme',
            'TUS Deneme::Anatomi',
            'TUS Deneme::Anatomi::Kaslar',
            'TUS Deneme::Dahiliye',
            'TUS Deneme::Dahiliye::Kardiyoloji',
            'TUS Deneme::Dahiliye::Gastro',
            'TUS Deneme::Pediatri',
        ];

        it('prioritizes and expands the studied course in trial catalog while keeping siblings closed', () => {
            const tree = makeTree(TRIAL_SAMPLE);
            const activeDeck = 'TUS Deneme::Dahiliye::Kardiyoloji';
            const prioritized = prioritizeDeckTree(tree, activeDeck);
            const expanded = initialExpandedDeckNames(prioritized, activeDeck);
            const rows = flattenVisibleDeckPicker(prioritized, expanded, false);
            const names = rows.map((r) => r.node.deck.name);

            // TUS Deneme is root and expanded
            // Dahiliye is prioritized to index 0 of TUS Deneme and expanded
            // Kardiyoloji is prioritized to index 0 of Dahiliye
            // Anatomi and Pediatri are closed (their subdecks are NOT visible)
            expect(names).toEqual([
                'TUS Deneme',
                'TUS Deneme::Dahiliye',
                'TUS Deneme::Dahiliye::Kardiyoloji',
                'TUS Deneme::Dahiliye::Gastro',
                'TUS Deneme::Anatomi',
                'TUS Deneme::Pediatri',
                'Varsayılan',
            ]);
            expect(names).not.toContain('TUS Deneme::Anatomi::Kaslar');
        });

        it('resolves short course name "Dahiliye" to prioritize and expand only Dahiliye', () => {
            const tree = makeTree(TRIAL_SAMPLE);
            const prioritized = prioritizeDeckTree(tree, 'Dahiliye');
            const expanded = initialExpandedDeckNames(prioritized, 'Dahiliye');
            const rows = flattenVisibleDeckPicker(prioritized, expanded, false);
            const names = rows.map((r) => r.node.deck.name);

            expect(names).toEqual([
                'TUS Deneme',
                'TUS Deneme::Dahiliye',
                'TUS Deneme::Dahiliye::Kardiyoloji',
                'TUS Deneme::Dahiliye::Gastro',
                'TUS Deneme::Anatomi',
                'TUS Deneme::Pediatri',
                'Varsayılan',
            ]);
            expect(names).not.toContain('TUS Deneme::Anatomi::Kaslar');
        });

        it('resolves short topic name "Kardiyoloji" to prioritize and expand its parent course', () => {
            const tree = makeTree(TRIAL_SAMPLE);
            const prioritized = prioritizeDeckTree(tree, 'Kardiyoloji');
            const expanded = initialExpandedDeckNames(prioritized, 'Kardiyoloji');
            const rows = flattenVisibleDeckPicker(prioritized, expanded, false);
            const names = rows.map((r) => r.node.deck.name);

            expect(names[0]).toBe('TUS Deneme');
            expect(names[1]).toBe('TUS Deneme::Dahiliye');
            expect(names[2]).toBe('TUS Deneme::Dahiliye::Kardiyoloji');
            expect(names).not.toContain('TUS Deneme::Anatomi::Kaslar');
        });
    });
});
