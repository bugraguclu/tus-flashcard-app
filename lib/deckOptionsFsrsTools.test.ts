// Deck Options' FSRS tools on a real collection (sql.js): Evaluate beside Optimize, and the
// simulator sheet. Behaviour reference: https://docs.ankiweb.net/deck-options.html#fsrs and Anki
// 26.09.3's ts/routes/deck-options (FsrsOptions.svelte, SimulatorModal.svelte; studied, not
// copied). Both tools only read.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({
    db: null as any,
    deckId: 0,
    settings: { dayRolloverHour: 4, fsrsEnabled: true } as Record<string, unknown>,
    announcements: [] as string[],
    chart: null as any,
}));

vi.mock('./db', () => ({ getDB: () => h.db, flushDatabaseWrites: async () => {}, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [] },
}));
vi.mock('./storage', async () => {
    const store = await import('./settingsStore');
    return { saveCollectionDeckOptions: store.saveCollectionDeckOptions };
});
vi.mock('react-native', async () => ({
    // The shared parts animate (menus grow, buttons sink); here every animation ends at once.
    ...(await import('../test/animatedMock')).animatedModules(),
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
    Keyboard: { dismiss: () => {} },
    AccessibilityInfo: { announceForAccessibility: (text: string) => { h.announcements.push(text); } },
    StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style ?? {}, hairlineWidth: 1, absoluteFill: {} },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal', Pressable: 'Pressable',
    ScrollView: 'ScrollView', Switch: 'Switch', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({
    useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, canGoBack: () => true }),
    useLocalSearchParams: () => ({ deckId: String(h.deckId) }),
}));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes, Shadows: new Proxy({}, { get: () => ({}) }) };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr, locale: 'tr', localeTag: 'tr-TR' }) }));
vi.mock('../hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }));
vi.mock('../contexts/AppContext', () => ({
    useAppSettings: () => ({ settings: h.settings, refreshSettings: () => {} }),
    useCollectionInvalidation: () => ({ invalidateCollection: () => {}, markSchedulingStale: () => {} }),
}));
vi.mock('./confirm', () => ({ alert: () => {}, confirm: (_title: string, _message: string, onConfirm: () => void) => onConfirm() }));
vi.mock('./exportAnkiPackage', () => ({ withoutPreservedReviewOrder: (raw: unknown) => raw }));
vi.mock('./fsrsOptimizer', () => ({ optimizeFsrsPreset: async () => null }));
vi.mock('../components/DeckPickerModal', () => ({ default: () => null }));
vi.mock('../components/HeaderBackIcon', () => ({ default: () => null }));
// The sheet shows its content while visible; the chart pieces report what they were given.
vi.mock('../components/BottomSheetModal', async () => {
    const { createElement, Fragment } = await import('react');
    return {
        default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? createElement(Fragment, null, children) : null),
    };
});
vi.mock('../components/stats/StatsBarChart', () => ({ default: (props: unknown) => { h.chart = props; return null; } }));
vi.mock('../components/ui/Choice', () => ({ SegmentedControl: () => null }));
vi.mock('../components/stats/StatsTiles', async () => {
    const { createElement, Fragment } = await import('react');
    return {
        default: ({ tiles }: { tiles: Array<{ key: string; label: string; value: string }> }) => createElement(
            Fragment, null, ...tiles.map((tile) => createElement('Text', { key: tile.key }, `${tile.label}: ${tile.value}`)),
        ),
    };
});

import DeckOptionsScreen from '../app/deck-options';
import { localDayNumber } from './ankiState';
import { createDeck } from './deckStore';
import { evaluateFsrsPreset, fsrsEvaluationFigures } from './fsrsEvaluate';
import { simulateFsrs } from './fsrsSimulator';
import { loadFsrsSimulatorSource } from './fsrsSimulatorData';
import { simulatorTotals } from './fsrsSimulatorView';
import { DEFAULT_DECK_CONFIG, type AnkiCard } from './models';
import { saveAnkiCard } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';

/* eslint-disable @typescript-eslint/no-explicit-any -- recorded JSON */
const optimize = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.09-optimize.json'), 'utf8'));
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
beforeEach(() => {
    h.db = createAppDb(SQL);
    h.settings = { dayRolloverHour: 4, fsrsEnabled: true };
    h.announcements = [];
    h.chart = null;
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
const button = (text: string) => root().find((node) => isHost(node, 'TouchableOpacity') && textOf(node) === text);
const texts = () => root().findAll((node) => isHost(node, 'Text')).map(textOf);
const field = (label: string) => root().find((node) => isHost(node, 'TextInput') && node.props.accessibilityLabel === label);
const snapshot = () => ['anki_cards', 'revlog', 'deck_configs', 'decks', 'settings']
    .map((table) => JSON.stringify(h.db.getAllSync(`SELECT * FROM ${table} ORDER BY rowid`)));

function mount() {
    act(() => { renderer = TestRenderer.create(React.createElement(DeckOptionsScreen)); });
}
async function pressAndSettle(node: ReactTestInstance) {
    await act(async () => { await node.props.onPress(); });
}

/** A recorded Anki collection's cards and review log, in the deck being edited. */
function seedHistory(entry: any) {
    const today = localDayNumber(Date.now(), 4);
    for (const [index, card] of entry.cards.entries()) {
        saveAnkiCard({
            id: card.cid, noteId: card.nid, deckId: h.deckId, ord: 0, mod: 0, usn: -1, type: 2, queue: 2, due: today + index % 30,
            ivl: 1, factor: 2500, reps: card.entries.length, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        } as AnkiCard);
        for (const [id, ease, ivl, lastIvl, factor, type] of card.entries) {
            h.db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, 5000, ?)',
                id, card.cid, ease, ivl, lastIvl, factor, type,
            );
        }
    }
}

describe('Deck Options › FSRS › Evaluate', () => {
    it('shows log loss and RMSE(bins) of the parameters in the field, and writes nothing', async () => {
        seedHistory(optimize.collections[0]);
        mount();
        const before = snapshot();
        await pressAndSettle(button('Parametreleri değerlendir'));

        const expected = await evaluateFsrsPreset({
            deckIds: [h.deckId], settings: { ...DEFAULT_SETTINGS, dayRolloverHour: 4 }, parameters: [], ignoreRevlogsBeforeMs: 0,
        });
        const figures = fsrsEvaluationFigures(expected!.evaluation!, ',');
        const line = texts().find((text) => text.startsWith('Log loss: '));
        expect(line).toBe(`Log loss: ${figures.logLoss}, RMSE(bins): %${figures.rmsePercent}. ${expected!.reviews} tekrar üzerinde; küçük değerler parametrelerin tekrar geçmişinize daha iyi uyduğunu gösterir.`);
        expect(h.announcements).toContain(line);
        expect(snapshot()).toEqual(before);

        // The figures belong to the parameters they were measured on.
        act(() => { field('FSRS parametreleri').props.onChangeText(optimize.collections[0].params.join(', ')); });
        expect(texts().some((text) => text.startsWith('Log loss: '))).toBe(false);
    });

    it('says plainly when the preset has no history to evaluate', async () => {
        mount();
        await pressAndSettle(button('Parametreleri değerlendir'));
        expect(texts()).toContain('Bu ayar grubunun kartlarında değerlendirmeye yetecek tekrar geçmişi yok.');
    });

    it('asks for valid parameters before evaluating', async () => {
        mount();
        act(() => { field('FSRS parametreleri').props.onChangeText('1, 2, 3'); });
        await pressAndSettle(button('Parametreleri değerlendir'));
        expect(texts()).toContain('Önce FSRS parametrelerini düzeltin: 17, 19 veya 21 sayı olmalıdır.');
    });
});

const control = (label: string) => root().find((node) => isHost(node, 'TouchableOpacity') && node.props.accessibilityLabel === label);
const press = (node: ReactTestInstance) => act(() => { node.props.onPress(); });
async function settle(done: () => boolean) {
    for (let attempt = 0; attempt < 400 && !done(); attempt++) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
}

describe('Deck Options › FSRS › Simulator', () => {
    it('simulates the preset with its own values and changes nothing', async () => {
        seedHistory(optimize.collections[1]);
        mount();
        press(control('FSRS simülatörü'));
        expect(field('Simüle edilecek gün').props.value).toBe('365');
        expect(field('Günlük yeni kart').props.value).toBe(String(DEFAULT_DECK_CONFIG.newPerDay));
        // The screen's own review limit has the same label; the sheet's comes last.
        const limits = root().findAll((node) => isHost(node, 'TextInput') && node.props.accessibilityLabel === 'Günlük en fazla tekrar');
        expect(limits.at(-1)!.props.value).toBe(String(DEFAULT_DECK_CONFIG.maxReviewsPerDay));
        const before = snapshot();
        press(control('Simüle et'));
        await settle(() => h.chart !== null);
        expect(h.chart).not.toBeNull();
        // 365 days in weekly bars.
        expect(h.chart.points).toHaveLength(53);
        expect(snapshot()).toEqual(before);

        // The same run straight from the library: the sheet passes the preset's values through.
        const source = loadFsrsSimulatorSource({
            deckIds: [h.deckId], settings: { dayRolloverHour: 4 }, params: [], useStoredMemory: true,
            historicalRetention: 0.9, ignoreRevlogsBeforeMs: 0,
        });
        const expected = simulatorTotals((await simulateFsrs({
            params: [], desiredRetention: 0.9, days: 365, existing: source.existing, newCards: source.newCards,
            introducedToday: 0, newLimit: DEFAULT_DECK_CONFIG.newPerDay, reviewLimit: DEFAULT_DECK_CONFIG.maxReviewsPerDay,
            maxInterval: DEFAULT_DECK_CONFIG.maxIvl, newCardsIgnoreReviewLimit: false, leechThreshold: null,
            learningSteps: DEFAULT_DECK_CONFIG.learningSteps.length, relearningSteps: DEFAULT_DECK_CONFIG.relearningSteps.length,
            reviewOrder: 'dueRandom', easyDays: [1, 1, 1, 1, 1, 1, 1], nextDayAtMs: source.nextDayAtMs, learner: source.learner,
        }))!);
        expect(texts()).toContain(`Tekrar: ${expected.reviews.toLocaleString('tr-TR')}`);
        expect(texts()).toContain(`Ezberlenen: ${Math.round(expected.memorizedEnd).toLocaleString('tr-TR')}`);
        expect(texts().some((text) => text.startsWith('Toplam süre: '))).toBe(true);
    });

    it('checks its inputs before running', () => {
        mount();
        press(control('FSRS simülatörü'));
        act(() => { field('Simüle edilecek gün').props.onChangeText('0'); });
        press(control('Simüle et'));
        expect(texts()).toContain('1–3650 arasında bir sayı girin.');
        expect(h.chart).toBeNull();
    });

    it('says when there is nothing to simulate', async () => {
        mount();
        press(control('FSRS simülatörü'));
        press(control('Simüle et'));
        const nothing = () => texts().some((text) => text.startsWith('Simüle edilecek kart yok'));
        await settle(nothing);
        expect(nothing()).toBe(true);
    });
});
