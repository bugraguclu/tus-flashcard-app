// Behavioral reference: https://docs.ankiweb.net/deck-options.html#presets — Add, Clone, Rename and
// Remove change only the screen until Save; leaving without saving forgets them.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import { assignDeckConfig, createDeck, createPreset, getAllDeckConfigs, getDeckByName, getDeckConfig, saveDeckConfig } from './deckManager';
import { DEFAULT_DECK_CONFIG } from './models';
import { usePresetStaging } from '../components/deck-options/usePresetStaging';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    SQL = await initSqlJs();
});
beforeEach(() => { dbHolder.db = createAppDb(SQL); });

function mountStaging() {
    const ref: { current: ReturnType<typeof usePresetStaging> | null } = { current: null };
    function Harness() {
        ref.current = usePresetStaging();
        return null;
    }
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(React.createElement(Harness)); });
    return { staging: () => ref.current!, unmount: () => act(() => renderer.unmount()) };
}

describe('usePresetStaging', () => {
    it('writes nothing until commit, and shows the staged presets meanwhile', () => {
        saveDeckConfig({ ...getDeckConfig(DEFAULT_DECK_CONFIG.id), newPerDay: 3 });
        const kept = createPreset('Eski ad');
        const removed = createPreset('Kaldırılacak');
        const before = getAllDeckConfigs().length;
        const { staging, unmount } = mountStaging();
        let added!: ReturnType<ReturnType<typeof usePresetStaging>['stageAdd']>;
        let cloned!: typeof added;
        act(() => {
            added = staging().stageAdd('Yeni', null);
            cloned = staging().stageAdd('Kopya', getDeckConfig(DEFAULT_DECK_CONFIG.id));
            staging().stageRename(kept.id, 'Yeni ad');
            staging().stageRemove(removed.id);
        });

        expect(getAllDeckConfigs()).toHaveLength(before);
        expect(getDeckConfig(kept.id).name).toBe('Eski ad');
        expect(staging().hasChanges).toBe(true);
        const shown = staging().presets.map((preset) => preset.name);
        expect(shown).toEqual(expect.arrayContaining(['Yeni', 'Kopya', 'Yeni ad']));
        expect(shown).not.toContain('Kaldırılacak');
        // Add starts from the stock defaults, Clone from the source's stored values.
        expect(staging().presetFor(added.id).newPerDay).toBe(DEFAULT_DECK_CONFIG.newPerDay);
        expect(staging().presetFor(cloned.id).newPerDay).toBe(3);

        act(() => staging().commit());
        expect(getDeckConfig(added.id).name).toBe('Yeni');
        expect(getDeckConfig(cloned.id).newPerDay).toBe(3);
        expect(getDeckConfig(kept.id).name).toBe('Yeni ad');
        expect(getAllDeckConfigs().some((preset) => preset.id === removed.id)).toBe(false);
        unmount();
    });

    it('forgets everything on reset, and a removed preset hands its decks to the default on commit', () => {
        const preset = createPreset('Sınav');
        const deck = createDeck('A');
        assignDeckConfig(deck.id, preset.id);
        const { staging, unmount } = mountStaging();

        act(() => { staging().stageAdd('Geçici', null); staging().reset(); });
        expect(staging().hasChanges).toBe(false);
        expect(staging().presets.some((entry) => entry.name === 'Geçici')).toBe(false);

        act(() => staging().stageRemove(preset.id));
        expect(getDeckByName('A')?.configId).toBe(preset.id);
        act(() => staging().commit());
        expect(getDeckByName('A')?.configId).toBe(DEFAULT_DECK_CONFIG.id);
        unmount();
    });
});
