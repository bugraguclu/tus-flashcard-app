// The Deck Options screen against a real collection (sql.js): its ••• menu and its tabs.
// Behaviour references: https://docs.ankiweb.net/deck-options.html (presets, daily limits) and
// Anki's ts/routes/deck-options (SaveButton.svelte, TabbedValue.svelte), studied, not copied.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({
    db: null as any,
    deckId: 0,
    settings: { dayRolloverHour: 4, fsrsEnabled: false } as Record<string, unknown>,
    alerts: [] as Array<[string, string]>,
}));

vi.mock('./db', () => ({ getDB: () => h.db, flushDatabaseWrites: async () => {}, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [] },
}));
vi.mock('./storage', async () => {
    const store = await import('./settingsStore');
    return { saveCollectionDeckOptions: store.saveCollectionDeckOptions };
});
vi.mock('react-native', () => ({
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
    Keyboard: { dismiss: () => {} },
    StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style ?? {}, hairlineWidth: 1, absoluteFill: {} },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal', Pressable: 'Pressable',
    ScrollView: 'ScrollView', Switch: 'Switch', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({
    useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, canGoBack: () => true }),
    useLocalSearchParams: () => ({ deckId: String(h.deckId) }),
}));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes, Shadows: new Proxy({}, { get: () => ({}) }) };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr }) }));
vi.mock('../hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }));
vi.mock('../contexts/AppContext', () => ({
    useAppSettings: () => ({ settings: h.settings, refreshSettings: () => {} }),
    useCollectionInvalidation: () => ({ invalidateCollection: () => {}, markSchedulingStale: () => {} }),
}));
vi.mock('./confirm', () => ({
    alert: (title: string, message: string) => { h.alerts.push([title, message]); },
    // The learner accepts every confirmation.
    confirm: (_title: string, _message: string, onConfirm: () => void) => onConfirm(),
}));
// Heavy modules the asserted paths never reach.
vi.mock('./exportAnkiPackage', () => ({ withoutPreservedReviewOrder: (raw: unknown) => raw }));
vi.mock('./fsrsOptimizer', () => ({ optimizeFsrsPreset: async () => null }));
vi.mock('../components/DeckPickerModal', () => ({ default: () => null }));
vi.mock('../components/HeaderBackIcon', () => ({ default: () => null }));
vi.mock('../components/SwipeDismissSheet', () => ({ default: () => null }));

import DeckOptionsScreen from '../app/deck-options';
import { DEFAULT_DECK_CONFIG } from './models';
import { createDeck, getDeck } from './deckStore';
import { getAllDeckConfigs, getDeckConfig, saveDeckConfig } from './deckPresets';
import { getDeckTodayLimits, setDeckDesiredRetention } from './deckLimits';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
beforeEach(() => {
    h.db = createAppDb(SQL);
    h.settings = { dayRolloverHour: 4, fsrsEnabled: false };
    h.alerts = [];
    // A Default preset the learner has made their own.
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG, maxReviewsPerDay: 333, learningSteps: [2, 20] });
    h.deckId = createDeck('Kardiyoloji').id;
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

const isHost = (node: ReactTestInstance, name: string) => (node.type as unknown) === name;
function textOf(node: ReactTestInstance | string): string {
    return typeof node === 'string' ? node : node.children.map(textOf).join('');
}
const root = () => renderer!.root;
const buttons = (text: string) => root().findAll((node) => isHost(node, 'TouchableOpacity') && textOf(node) === text);
const press = (node: ReactTestInstance) => act(() => { node.props.onPress(); });
const field = (label: string) => root().find((node) => isHost(node, 'TextInput') && node.props.accessibilityLabel === label);
const tabs = (text: string) => root().findAll((node) => isHost(node, 'TouchableOpacity') && node.props.accessibilityRole === 'tab' && textOf(node) === text);
/** The toolbar's Save button: the one control that reports whether it is disabled. */
const saveButton = () => root().find((node) => isHost(node, 'TouchableOpacity') && node.props.accessibilityState?.disabled !== undefined);

function mount() {
    act(() => { renderer = TestRenderer.create(React.createElement(DeckOptionsScreen)); });
}

/** Choose a ••• item. On iOS it runs once the menu has dismissed, which the test plays out. */
function chooseMenuItem(label: string) {
    press(buttons(label)[0]);
    const menu = root().find((node) => isHost(node, 'Modal') && typeof node.props.onDismiss === 'function');
    act(() => { menu.props.onDismiss(); });
}

describe('Deck Options ••• menu', () => {
    it('lists Anki’s preset actions in its order, with Remove last and no second Save', () => {
        mount();
        const menu = root().find((node) => isHost(node, 'Modal') && typeof node.props.onDismiss === 'function');
        const labels = menu.findAll((node) => isHost(node, 'TouchableOpacity')).map(textOf);
        expect(labels).toEqual([
            'Ayar grubu ekle',
            'Ayar grubunu kopyala',
            'Ayar grubunu yeniden adlandır',
            'Varsayılana dön',
            'Kaydet ve tüm alt destelere uygula',
            'Ayar grubunu kaldır',
        ]);
    });

    it('restores defaults into a preset added on screen, never into the Default preset', () => {
        mount();
        chooseMenuItem('Ayar grubu ekle');
        // The name dialog saves from the keyboard's return key.
        act(() => { field('Ayar grubu adı').props.onChangeText('Yeni grup'); });
        act(() => { field('Ayar grubu adı').props.onSubmitEditing(); });

        chooseMenuItem('Varsayılana dön');
        // Before, this wrote the built-in defaults over the Default preset (id 1) at once, because
        // the new preset had no stored row yet, and every deck on Default lost its settings.
        expect(getDeckConfig(DEFAULT_DECK_CONFIG.id)).toMatchObject({ maxReviewsPerDay: 333, learningSteps: [2, 20] });
        expect(getAllDeckConfigs()).toHaveLength(1);

        press(saveButton());
        const added = getAllDeckConfigs().find((config) => config.name === 'Yeni grup');
        expect(added).toMatchObject({ maxReviewsPerDay: DEFAULT_DECK_CONFIG.maxReviewsPerDay, learningSteps: DEFAULT_DECK_CONFIG.learningSteps });
        expect(getDeck(h.deckId)?.configId).toBe(added?.id);
        expect(getDeckConfig(DEFAULT_DECK_CONFIG.id)).toMatchObject({ maxReviewsPerDay: 333, learningSteps: [2, 20] });
    });

    it('waits for Save before restoring a stored preset’s defaults', () => {
        mount();
        chooseMenuItem('Varsayılana dön');
        expect(getDeckConfig(DEFAULT_DECK_CONFIG.id).maxReviewsPerDay).toBe(333);
        expect(field('Günlük en fazla tekrar').props.value).toBe(String(DEFAULT_DECK_CONFIG.maxReviewsPerDay));

        press(saveButton());
        expect(getDeckConfig(DEFAULT_DECK_CONFIG.id)).toMatchObject({
            maxReviewsPerDay: DEFAULT_DECK_CONFIG.maxReviewsPerDay,
            learningSteps: DEFAULT_DECK_CONFIG.learningSteps,
        });
    });

    it('says so when a deck has no subdecks to save to', () => {
        mount();
        chooseMenuItem('Kaydet ve tüm alt destelere uygula');
        expect(h.alerts.at(-1)?.[1]).toContain('alt destesi olmadığı');
    });
});

describe('Deck Options tabs', () => {
    it('stores the shown limit as the deck’s own when “This deck” is chosen', () => {
        mount();
        press(tabs('Bu deste')[0]);
        // Anki copies the value on screen into the tab; before, the field stayed empty and Save
        // had nothing to store.
        expect(field('Günlük en fazla tekrar').props.value).toBe('333');
        expect(textOf(saveButton())).toBe('Kaydet');

        press(saveButton());
        expect(getDeck(h.deckId)?.reviewLimit).toBe(333);
    });

    it('hands a borrowed value on to the tab chosen next', () => {
        mount();
        press(tabs('Bu deste')[0]);
        press(tabs('Yalnızca bugün')[0]);
        press(saveButton());
        // As in Anki, the passed-over "This deck" tab gets its own (empty) value back.
        expect(getDeck(h.deckId)?.reviewLimit).toBeUndefined();
        expect(getDeckTodayLimits(h.deckId, 4).reviewLimit).toBe(333);
    });

    it('leaves nothing to save after only looking at the narrower tabs', () => {
        mount();
        press(tabs('Bu deste')[0]);
        press(tabs('Yalnızca bugün')[0]);
        press(tabs('Ayar grubu')[0]);
        expect(field('Günlük en fazla tekrar').props.value).toBe('333');
        expect(textOf(saveButton())).toBe('Kaydedildi');
    });

    it('drops the deck’s own desired retention when saved on the preset tab', () => {
        h.settings = { dayRolloverHour: 4, fsrsEnabled: true };
        setDeckDesiredRetention(h.deckId, 0.85);
        mount();
        // The limit tabs come first; the second "Preset" tab belongs to desired retention.
        press(tabs('Ayar grubu')[1]);
        expect(textOf(saveButton())).toBe('Kaydet');

        press(saveButton());
        expect(getDeck(h.deckId)?.desiredRetention).toBeUndefined();
    });
});
