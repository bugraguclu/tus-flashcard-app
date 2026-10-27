// Settings reads part of itself from the default preset and writes it back on every save; that
// round trip must hand the preset back exactly as Deck Options left it.
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, flushDatabaseWrites: async () => {}, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [] },
}));
import { DEFAULT_KEY_BINDINGS, DEFAULT_SETTINGS, loadSettings, resetSettingsToDefaults, saveSettings } from './settingsStore';
import { getDeckConfig, saveDeckConfig } from './deckPresets';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); });

/** Values Deck Options accepts but the old settings validation pulled to its own bounds. */
const deckOptionsEdits = {
    newPerDay: 0,
    maxReviewsPerDay: 0,
    learningSteps: [],
    relearningSteps: [],
    graduatingIvl: 400,
    easyIvl: 500,
    minIvl: 400,
    hardIvl: 0.8,
    easyBonus: 3,
};

describe('saving settings with the default preset', () => {
    it('leaves values Deck Options set on the default preset untouched', () => {
        saveDeckConfig({ ...getDeckConfig(1), ...deckOptionsEdits });

        expect(saveSettings({ ...loadSettings(), language: 'en' }).ok).toBe(true);

        expect(getDeckConfig(1)).toMatchObject(deckOptionsEdits);
    });

    it('keeps a start of day at 00:00', () => {
        saveSettings({ ...loadSettings(), dayRolloverHour: 0 });

        expect(loadSettings().dayRolloverHour).toBe(0);
    });

    it('falls back to 04:00 only for a missing start of day', () => {
        saveSettings({ ...loadSettings(), dayRolloverHour: undefined as unknown as number });

        expect(loadSettings().dayRolloverHour).toBe(4);
    });

    it('saves "Automatically play audio" so the saved settings match the request', () => {
        const result = saveSettings({ ...loadSettings(), autoPlayAudio: false });

        expect(result.ok && result.settings.autoPlayAudio).toBe(false);
        expect(loadSettings().autoPlayAudio).toBe(false);
        expect(getDeckConfig(1).autoPlayAudio).toBe(false);
    });

    it('resets app settings without resetting the default preset’s scheduling', () => {
        saveDeckConfig({ ...getDeckConfig(1), ...deckOptionsEdits });
        saveSettings({ ...loadSettings(), language: 'en', autoPlayAudio: false });

        expect(resetSettingsToDefaults().ok).toBe(true);

        expect(loadSettings()).toMatchObject({ language: DEFAULT_SETTINGS.language, autoPlayAudio: true });
        expect(getDeckConfig(1)).toMatchObject(deckOptionsEdits);
    });
});

describe('saved keyboard shortcuts', () => {
    it('moves only the clashing shortcut back to its default and keeps the others', () => {
        saveSettings({ ...loadSettings(), keyBindings: { ...DEFAULT_KEY_BINDINGS, again: 'j', good: 'J', markNote: 'm' } });

        expect(loadSettings().keyBindings).toEqual({ ...DEFAULT_KEY_BINDINGS, again: 'j', markNote: 'm' });
    });

    it('falls back to the default set when a default would clash as well', () => {
        // `again` takes Good's default key, so Good cannot go back to its default either.
        saveSettings({ ...loadSettings(), keyBindings: { ...DEFAULT_KEY_BINDINGS, again: DEFAULT_KEY_BINDINGS.good } });

        expect(loadSettings().keyBindings).toEqual(DEFAULT_KEY_BINDINGS);
    });
});
