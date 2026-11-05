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
import {
    DEFAULT_KEY_BINDINGS,
    DEFAULT_SETTINGS,
    loadSettings,
    resetSettingsToDefaults,
    saveCollectionDeckOptions,
    saveSettings,
} from './settingsStore';
import { getDeckConfig, saveDeckConfig } from './deckPresets';
import { getDbSetting, setDbSetting } from './dbSettings';

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
    it('does not rewrite a preset or scan decks when only an app preference changes', () => {
        saveSettings(loadSettings()); // Hydrate optional legacy preset values once.
        const before = getDeckConfig(1);
        const reads = vi.spyOn(h.db, 'getAllSync');
        const writes = vi.spyOn(h.db, 'runSync');

        expect(saveSettings({ ...loadSettings(), textSizeLevel: 'xlarge' }).ok).toBe(true);

        expect(getDeckConfig(1)).toEqual(before);
        expect(reads.mock.calls.some(([sql]) => /FROM (decks|anki_cards)\b/i.test(String(sql)))).toBe(false);
        expect(writes.mock.calls.some(([sql]) => /INTO deck_configs\b/i.test(String(sql)))).toBe(false);
        expect(loadSettings().textSizeLevel).toBe('xlarge');
    });

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

    it('restores default settings without turning FSRS or the collection-wide limit switches off', () => {
        const deckOptionsSwitches = {
            newCardsIgnoreReviewLimit: false,
            limitsStartFromTop: true,
            fsrsEnabled: true,
            fsrsShortTermWithSteps: true,
        };
        saveCollectionDeckOptions(deckOptionsSwitches);
        saveSettings({ ...loadSettings(), language: 'en', themeMode: 'dark' });

        expect(resetSettingsToDefaults().ok).toBe(true);

        expect(loadSettings()).toMatchObject({
            ...deckOptionsSwitches,
            language: DEFAULT_SETTINGS.language,
            themeMode: DEFAULT_SETTINGS.themeMode,
        });
    });
});

describe('the audio speed of the default preset', () => {
    /** What Deck Options does when it saves the default preset (app/deck-options.tsx). */
    function saveFromDeckOptions(audioPlaybackRate: number) {
        saveDeckConfig({ ...getDeckConfig(1), audioPlaybackRate });
        saveCollectionDeckOptions({ newCardsIgnoreReviewLimit: true, limitsStartFromTop: false });
    }

    it('shows the speed Deck Options set, not the copy saved with the app settings', () => {
        saveSettings({ ...loadSettings(), audioPlaybackRate: 1 });

        saveFromDeckOptions(1.5);

        expect(loadSettings().audioPlaybackRate).toBe(1.5);
    });

    it('is not written back over by a save of an unrelated setting', () => {
        saveSettings({ ...loadSettings(), audioPlaybackRate: 1 });
        saveFromDeckOptions(1.5);

        expect(saveSettings({ ...loadSettings(), language: 'en' }).ok).toBe(true);

        expect(getDeckConfig(1).audioPlaybackRate).toBe(1.5);
        expect(loadSettings().audioPlaybackRate).toBe(1.5);
    });

    it('is saved to the default preset when Settings changes it', () => {
        saveSettings({ ...loadSettings(), audioPlaybackRate: 1.25 });

        expect(getDeckConfig(1).audioPlaybackRate).toBe(1.25);
        expect(loadSettings().audioPlaybackRate).toBe(1.25);
    });

    it('falls back to the saved copy for a preset written before the speed existed', () => {
        saveSettings({ ...loadSettings(), audioPlaybackRate: 0.75 });
        const { audioPlaybackRate: _omitted, ...legacyPreset } = getDeckConfig(1);
        saveDeckConfig(legacyPreset);

        expect(loadSettings().audioPlaybackRate).toBe(0.75);
    });

    it('plays an unusable stored speed at 1x and keeps a stray one inside 0.5x–2x', () => {
        saveDeckConfig({ ...getDeckConfig(1), audioPlaybackRate: 0 });
        expect(loadSettings().audioPlaybackRate).toBe(1);

        saveDeckConfig({ ...getDeckConfig(1), audioPlaybackRate: 8 });
        expect(loadSettings().audioPlaybackRate).toBe(2);
    });
});

describe('preferences the note editor saves', () => {
    it('keeps font size, sentence capitals and the toolbar choices after the settings are read again', () => {
        const editorPreferences = {
            editorFontSize: 22,
            editorCapitalizeSentences: false,
            editorToolbarVisible: false,
            editorToolbarScrollable: false,
        };

        expect(saveSettings({ ...loadSettings(), ...editorPreferences }).ok).toBe(true);

        expect(loadSettings()).toMatchObject(editorPreferences);
    });
});

describe('a damaged settings row', () => {
    it('starts the day at 04:00 when the stored start of day is not a number', () => {
        saveSettings({ ...loadSettings(), dayRolloverHour: 6 });
        const meta = JSON.parse(getDbSetting('tus_app_settings_meta_v1') ?? '{}');
        setDbSetting('tus_app_settings_meta_v1', JSON.stringify({ ...meta, dayRolloverHour: 'late' }));

        expect(loadSettings().dayRolloverHour).toBe(4);
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
