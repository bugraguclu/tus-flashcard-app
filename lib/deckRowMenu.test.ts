import { describe, expect, it } from 'vitest';
import { deckRowMenuActions, deckRowMenuLabel, type DeckRowMenuAction } from './deckRowMenu';

const regular = { isFiltered: false, isCatalog: false, buriedCount: 0 };

describe('deck list ••• menu', () => {
    it('lists a regular deck’s actions in AnkiDroid’s order, after Overview', () => {
        // AnkiDroid DeckPickerMenuContentProvider: Add, Browse, Rename, Create subdeck, Options,
        // Custom study, Export, [Unbury], Create shortcut, Edit description, Delete.
        expect(deckRowMenuActions(regular)).toEqual([
            'overview', 'add', 'browse', 'rename', 'createSubdeck', 'options', 'customStudy', 'export',
            'shortcut', 'description', 'delete',
        ]);
    });

    it('offers Unbury only while the deck holds buried cards, before Create shortcut', () => {
        expect(deckRowMenuActions(regular)).not.toContain('unbury');
        const actions = deckRowMenuActions({ ...regular, buriedCount: 2 });
        expect(actions.indexOf('unbury')).toBe(actions.indexOf('export') + 1);
        expect(actions.indexOf('shortcut')).toBe(actions.indexOf('unbury') + 1);
    });

    it('gives a filtered deck Rebuild, Empty and its own options, and no description to edit', () => {
        const actions = deckRowMenuActions({ ...regular, isFiltered: true });
        expect(actions).toEqual(['overview', 'browse', 'rename', 'filterOptions', 'rebuild', 'empty', 'shortcut', 'delete']);
        // Its overview always shows Anki's fixed explanation, so an edited description would never show.
        expect(actions).not.toContain('description');
        for (const regularOnly of ['add', 'createSubdeck', 'options', 'customStudy'] as DeckRowMenuAction[]) {
            expect(actions).not.toContain(regularOnly);
        }
    });

    it('leaves out what would change a catalog deck, but keeps study tools', () => {
        const actions = deckRowMenuActions({ ...regular, isCatalog: true, buriedCount: 1 });
        expect(actions).toEqual(['overview', 'add', 'browse', 'options', 'customStudy', 'unbury', 'shortcut']);
    });

    it('labels every action in both languages', () => {
        const all: DeckRowMenuAction[] = [
            'overview', 'add', 'browse', 'rename', 'createSubdeck', 'options', 'customStudy', 'export',
            'filterOptions', 'rebuild', 'empty', 'unbury', 'shortcut', 'description', 'delete',
        ];
        const turkish = all.map((action) => deckRowMenuLabel(action, (tr) => tr));
        const english = all.map((action) => deckRowMenuLabel(action, (_tr, en) => en));
        expect(new Set(turkish).size).toBe(all.length);
        expect(new Set(english).size).toBe(all.length);
        expect(deckRowMenuLabel('unbury', (tr) => tr)).toBe('Gömülüleri aç');
        expect(deckRowMenuLabel('unbury', (_tr, en) => en)).toBe('Unbury');
        // The same words as the ＋ menu's entry, so the two Add rows read as one action.
        expect(deckRowMenuLabel('add', (tr) => tr)).toBe('Kart ekle');
        expect(deckRowMenuLabel('add', (_tr, en) => en)).toBe('Add note');
    });
});
