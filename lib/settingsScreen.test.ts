// The Settings screen against a real settings store (sql.js): Save, Restore defaults and search,
// including settings that another screen rewrote while Settings stayed open underneath it.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({
    db: null as any,
    focus: null as null | (() => void),
    english: false,
    confirmAsyncAnswer: true as boolean | Promise<boolean>,
    alerts: [] as Array<[string, string]>,
    confirmAsyncCalls: [] as string[],
    confirmAsyncMessages: [] as string[],
    findings: {} as Record<string, unknown>,
    checkDatabase: null as any,
    optimizeOutcome: {} as Record<string, unknown>,
    optimize: null as any,
    invalidated: 0,
}));

vi.mock('./db', () => ({ getDB: () => h.db, flushDatabaseWrites: async () => {}, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [] },
}));
// Only the settings half of lib/storage; the collection half (backupData) is not exercised here.
vi.mock('./storage', async () => {
    const store = await import('./settingsStore');
    return {
        DEFAULT_KEY_BINDINGS: store.DEFAULT_KEY_BINDINGS,
        DEFAULT_SETTINGS: store.DEFAULT_SETTINGS,
        defaultSettingsKeepingDeckOptions: store.defaultSettingsKeepingDeckOptions,
        loadSettings: store.loadSettings,
        saveSettingsDurably: store.saveSettingsDurably,
    };
});
vi.mock('react-native', () => ({
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
    Keyboard: { dismiss: () => {} },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    Linking: { openURL: async () => true },
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFill: {} },
    ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
    Switch: 'Switch', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
    TouchableWithoutFeedback: 'TouchableWithoutFeedback', View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0' } } }));
vi.mock('expo-router', async () => {
    const { useEffect } = await import('react');
    const navigation = { setOptions: () => {} };
    return {
        useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, canGoBack: () => true }),
        useNavigation: () => navigation,
        // Runs on mount like the real hook; a test calls h.focus() for "shown again".
        useFocusEffect: (effect: () => void) => {
            h.focus = effect;
            useEffect(() => effect(), [effect]);
        },
    };
});
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes, Shadows: new Proxy({}, { get: () => ({}) }) };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string, en: string) => (h.english ? en : tr) }) }));
vi.mock('../hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }));
vi.mock('../hooks/useRepeatPress', () => ({ useRepeatPress: (step: () => void) => ({ onPress: step }) }));
vi.mock('../contexts/AppContext', () => {
    const settings = { refreshSettings: () => {}, previewSettings: () => {} };
    const collection = { invalidateCollection: () => { h.invalidated += 1; }, markSchedulingStale: () => {} };
    const catalog = { refreshCatalogAccess: async () => ({}) };
    return { useAppSettingsActions: () => settings, useCollectionInvalidation: () => collection, useCatalogStatus: () => catalog };
});
vi.mock('./confirm', () => ({
    alert: (title: string, message: string) => { h.alerts.push([title, message]); },
    confirm: (_title: string, _message: string, onConfirm: () => void) => onConfirm(),
    confirmAsync: async (title: string, message: string) => {
        h.confirmAsyncCalls.push(title);
        h.confirmAsyncMessages.push(message);
        return h.confirmAsyncAnswer;
    },
}));
// The audit and the repair are faked; the counting rules Settings reads them with are the real ones.
vi.mock('./maintenance', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./maintenance')>();
    return {
        checkDatabase: () => h.checkDatabase(),
        emptyRepairResult: actual.emptyRepairResult,
        repairChangedRows: actual.repairChangedRows,
        repairableDefectCount: actual.repairableDefectCount,
        totalDefectCount: actual.totalDefectCount,
    };
});
vi.mock('./maintenanceWorkflow', () => ({
    MaintenanceWorkflowError: class extends Error {},
    optimizeDatabaseWithBackup: (...args: unknown[]) => h.optimize(...args),
}));
vi.mock('./resetWorkflow', () => ({ ResetWorkflowError: class extends Error {}, resetAllDataWithBackup: async () => ({ backupFileName: 'x' }) }));
vi.mock('./backup', () => ({ BackupNotRestorableError: class extends Error {} }));
vi.mock('./studyNotifications', () => ({
    disableStudyNotifications: async () => {},
    requestStudyNotificationPermission: async () => ({ state: 'granted' }),
    studyNotificationsSupported: () => false,
}));
vi.mock('./permissions', () => ({ promptPermissionSettings: async () => {} }));
vi.mock('../components/BoundedIntegerInput', async () => {
    const { forwardRef } = await import('react');
    return { default: forwardRef(() => null) };
});
vi.mock('../components/settings/KeyboardSettingsSection', () => ({ default: () => null }));
vi.mock('../components/settings/TextSizeSlider', async () => {
    const { createElement } = await import('react');
    return { default: (props: object) => createElement('TextSizeSlider', props) };
});
// The glyphs draw with react-native-svg, which ships syntax vite cannot parse.
vi.mock('../components/GearGlyph', () => ({ default: () => null }));
vi.mock('../components/CardsGlyph', () => ({ default: () => null }));
vi.mock('../components/BrainGlyph', () => ({ default: () => null }));
vi.mock('../components/BellGlyph', () => ({ default: () => null }));
vi.mock('../components/HandTapGlyph', () => ({ default: () => null }));
vi.mock('../components/AccessibilityGlyph', () => ({ default: () => null }));
vi.mock('../components/ArchiveBoxGlyph', () => ({ default: () => null }));
vi.mock('../components/InfoCircleGlyph', () => ({ default: () => null }));
vi.mock('../components/HeaderBackIcon', () => ({ default: () => null }));

import SettingsScreen from '../app/settings';
import { DEFAULT_SETTINGS, loadSettings, saveCollectionDeckOptions, saveSettings } from './settingsStore';
import { getDeckConfig } from './deckPresets';
import { emptyRepairResult } from './maintenance';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
beforeEach(() => {
    h.db = createAppDb(SQL);
    h.focus = null;
    h.english = false;
    h.confirmAsyncAnswer = true;
    h.alerts = [];
    h.confirmAsyncCalls = [];
    h.confirmAsyncMessages = [];
    h.invalidated = 0;
    h.findings = cleanAudit();
    h.checkDatabase = vi.fn(() => h.findings);
    h.optimizeOutcome = { backupFileName: 'tus-backup-2026-11-08-120000000.json', backupRestorable: true, result: { repair: emptyRepairResult(), ftsReindexed: 0, freedBytes: 0, failedSteps: [] } };
    h.optimize = vi.fn(async () => h.optimizeOutcome);
});

/** An audit that found nothing. */
function cleanAudit() {
    return {
        integrity: 'ok', orphanCards: 0, orphanNotes: 0, strandedCards: 0, filteredLeftoverCards: 0,
        invalidIntervalCards: 0, highPositionNewCards: 0, invalidDueCards: 0, invalidOrdinalCards: 0,
        orphanedOriginalDueCards: 0, lastReviewTimeCards: 0, unreadableNotes: 0,
    };
}
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

function textOf(node: ReactTestInstance | string): string {
    if (typeof node === 'string') return node;
    return node.children.map(textOf).join('');
}

/** The react-native mock renders host components by name. */
const isHost = (node: ReactTestInstance, name: string) => (node.type as unknown) === name;

function mount() {
    act(() => { renderer = TestRenderer.create(React.createElement(SettingsScreen)); });
}

const pressables = () => renderer!.root.findAll((node) => isHost(node, 'TouchableOpacity'));
const byLabel = (label: string) => pressables().find((node) => node.props.accessibilityLabel === label);
const byText = (text: string) => {
    const found = pressables().filter((node) => textOf(node).includes(text));
    // The innermost match is the control itself, not a row that contains it.
    return found[found.length - 1];
};

function openCategory(title: string) {
    act(() => byLabel(title)!.props.onPress());
}

async function save() {
    await act(async () => { await byLabel('Ayarları kaydet')!.props.onPress(); });
}

describe('saving Settings', () => {
    it('keeps the same scroll surface and section through text-size preview and Save', async () => {
        mount();
        openCategory('Genel');
        const surface = renderer!.root.find((node) => isHost(node, 'ScrollView'));
        const slider = renderer!.root.find((node) => isHost(node, 'TextSizeSlider'));
        act(() => slider.props.onChange('xlarge'));
        expect(renderer!.root.find((node) => isHost(node, 'ScrollView')) === surface).toBe(true);

        await save();

        expect(loadSettings().textSizeLevel).toBe('xlarge');
        expect(renderer!.root.find((node) => isHost(node, 'ScrollView')) === surface).toBe(true);
        expect(byLabel('Ayarlara dön')).toBeDefined();
        expect(surface.props.scrollEnabled).not.toBe(false);
    });

    it('keeps what a restore wrote while Settings stayed open, along with the learner’s own edit', async () => {
        mount();
        openCategory('Genel');
        act(() => byText('Koyu').props.onPress());

        // Backups › Restore, opened over Settings, rewrites the settings and the default preset.
        saveSettings({ ...loadSettings(), language: 'en', dailyNewLimit: 55, learningSteps: [3, 30] });
        act(() => h.focus!());
        await save();

        expect(loadSettings()).toMatchObject({ language: 'en', themeMode: 'dark', dailyNewLimit: 55, learningSteps: [3, 30] });
        expect(getDeckConfig(1)).toMatchObject({ newPerDay: 55, learningSteps: [3, 30] });
    });

    it('does not write a stale draft over settings changed underneath it, even before it is shown again', async () => {
        mount();
        openCategory('Genel');
        act(() => byText('Koyu').props.onPress());

        saveSettings({ ...loadSettings(), language: 'en', dailyNewLimit: 55 });
        await save();

        expect(loadSettings()).toMatchObject({ language: 'en', themeMode: 'dark', dailyNewLimit: 55 });
    });

    it('turns the answer buttons back on, after asking, before storing a mapping that cannot grade', async () => {
        saveSettings({ ...loadSettings(), showAnswerButtons: false, ninePointTouchEnabled: false, gesturesEnabled: false });
        mount();
        openCategory('Genel');
        act(() => byText('Koyu').props.onPress());

        await save();

        expect(h.confirmAsyncCalls).toEqual(['Kartları yanıtlamanın bir yolu kalmadı']);
        expect(loadSettings()).toMatchObject({ showAnswerButtons: true, themeMode: 'dark' });
    });

    it('stores nothing when the learner declines to bring the answer buttons back', async () => {
        saveSettings({ ...loadSettings(), showAnswerButtons: false, ninePointTouchEnabled: false, gesturesEnabled: false });
        h.confirmAsyncAnswer = false;
        mount();
        openCategory('Genel');
        act(() => byText('Koyu').props.onPress());

        await save();

        expect(loadSettings()).toMatchObject({ showAnswerButtons: false, themeMode: DEFAULT_SETTINGS.themeMode });
    });
});

describe('restoring default settings', () => {
    it('resets the app settings and keeps FSRS and the other Deck Options switches', async () => {
        saveCollectionDeckOptions({ newCardsIgnoreReviewLimit: false, limitsStartFromTop: true, fsrsEnabled: true });
        saveSettings({ ...loadSettings(), language: 'en', showRemainingTime: true });
        mount();
        openCategory('Genel');

        await act(async () => { byText('Varsayılan ayarlara dön').props.onPress(); });

        expect(loadSettings()).toMatchObject({
            language: DEFAULT_SETTINGS.language,
            showRemainingTime: false,
            fsrsEnabled: true,
            limitsStartFromTop: true,
            newCardsIgnoreReviewLimit: false,
        });
        expect(h.alerts).toEqual([]);
    });
});

describe('searching Settings', () => {
    it('finds a single setting and names it under its category', () => {
        mount();
        const search = renderer!.root.find((node) => isHost(node, 'TextInput') && node.props.accessibilityLabel === 'Ayarlarda ara');

        act(() => search.props.onChangeText('zaman kutusu'));

        const rows = pressables().filter((node) => node.props.accessibilityHint !== undefined);
        expect(rows.map((row) => [row.props.accessibilityLabel, row.props.accessibilityHint])).toEqual([
            ['İnceleme', 'Zaman kutusu sınırı'],
        ]);
    });

    it('finds a category whatever case the Turkish letters are typed in', () => {
        mount();
        const search = renderer!.root.find((node) => isHost(node, 'TextInput') && node.props.accessibilityLabel === 'Ayarlarda ara');

        act(() => search.props.onChangeText('içe aktar'));

        const rows = pressables().filter((node) => node.props.accessibilityHint !== undefined);
        expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(['Veri yönetimi']);
    });
});

describe('checking and repairing the database', () => {
    /** Let the deferred audit, the confirmation and the repair run to the end. */
    const settle = () => act(async () => {
        for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    });

    function openMaintenance() {
        mount();
        openCategory(h.english ? 'Data Management' : 'Veri yönetimi');
    }

    it('asks in English with the defects it found, listing only those', async () => {
        h.english = true;
        h.findings = { ...cleanAudit(), orphanCards: 2, invalidDueCards: 3, lastReviewTimeCards: 1 };
        openMaintenance();

        act(() => byText('Repair and optimize').props.onPress());
        await settle();

        expect(h.confirmAsyncCalls).toEqual(['Repair and Optimize Database']);
        const lines = h.confirmAsyncMessages[0].split('\n');
        expect(lines.slice(0, 4)).toEqual([
            'Found:',
            'Orphaned cards: 2',
            'Cards with an invalid due date: 3',
            'Cards with a wrong last review time: 1',
        ]);
        expect(h.confirmAsyncMessages[0]).not.toMatch(/: 0$/m);
    });

    it('names the recovery copy in an English result with many repaired classes', async () => {
        h.english = true;
        h.findings = { ...cleanAudit(), orphanCards: 1, strandedCards: 1, filteredLeftoverCards: 1, invalidIntervalCards: 1, highPositionNewCards: 1, invalidDueCards: 1, invalidOrdinalCards: 1 };
        h.optimizeOutcome = {
            backupFileName: 'tus-backup-2026-11-08-120000000.json',
            backupRestorable: false,
            result: {
                repair: { ...emptyRepairResult(), orphanCardsDeleted: 1, strandedCardsRehomed: 1, recoveryDeckName: 'Kurtarılan Kartlar', filteredLeftoversCleared: 1, intervalsClamped: 1, newCardPositionsWrapped: 1, duesRepaired: 1, ordinalsClamped: 1 },
                ftsReindexed: 0, freedBytes: 0, failedSteps: [],
            },
        };
        openMaintenance();

        act(() => byText('Repair and optimize').props.onPress());
        await settle();

        expect(h.optimize).toHaveBeenCalledTimes(1);
        expect(h.alerts).toHaveLength(1);
        expect(h.alerts[0][1]).toContain('Recovery copy: tus-backup-2026-11-08-120000000.json.');
    });

    it('reports only the defects the audit found, and that nothing needs repair when there are none', async () => {
        openMaintenance();
        act(() => byText('Veritabanını kontrol et').props.onPress());
        await settle();
        h.findings = { ...cleanAudit(), orphanNotes: 4 };
        act(() => byText('Veritabanını kontrol et').props.onPress());
        await settle();

        expect(h.alerts.map(([, message]) => message)).toEqual([
            'Bütünlük: tamam\n\nOnarılacak bir şey yok.',
            'Bütünlük: tamam\nKartsız not: 4\n\n“Onar ve optimize et” bu satırları düzeltebilir.',
        ]);
    });

    it('starts one audit and one repair however fast Repair is pressed twice', async () => {
        h.findings = { ...cleanAudit(), orphanCards: 2 };
        openMaintenance();
        const repair = byText('Onar ve optimize et');

        // The second press was queued before the first one's state could disable the row.
        act(() => { repair.props.onPress(); repair.props.onPress(); });
        await settle();

        expect(h.checkDatabase).toHaveBeenCalledTimes(1);
        expect(h.confirmAsyncCalls).toHaveLength(1);
        expect(h.optimize).toHaveBeenCalledTimes(1);
        expect(h.alerts).toHaveLength(1);
    });

    it('keeps the rows disabled from the press until the repair ends, the question included', async () => {
        h.findings = { ...cleanAudit(), orphanCards: 2 };
        let answer!: (accepted: boolean) => void;
        h.confirmAsyncAnswer = new Promise<boolean>((resolve) => { answer = resolve; });
        openMaintenance();

        act(() => byText('Onar ve optimize et').props.onPress());
        expect(byText('Veritabanını kontrol et').props.disabled).toBe(true);
        await settle();
        expect(h.confirmAsyncCalls).toHaveLength(1);
        // Pressed again while the question is open: no second audit, no stacked question.
        act(() => byText('Veritabanını kontrol et').props.onPress());
        await settle();
        expect(h.checkDatabase).toHaveBeenCalledTimes(1);

        await act(async () => { answer(true); });
        await settle();

        expect(h.optimize).toHaveBeenCalledTimes(1);
        expect(byText('Veritabanını kontrol et').props.disabled).toBe(false);
    });

    it('refreshes the open screens after a repair that only fixed due dates, as on web', async () => {
        h.findings = { ...cleanAudit(), invalidDueCards: 2 };
        h.optimizeOutcome = {
            backupFileName: 'tus-backup-2026-11-08-120000000.json',
            backupRestorable: true,
            result: { repair: { ...emptyRepairResult(), duesRepaired: 2 }, ftsReindexed: 0, freedBytes: 0, failedSteps: [] },
        };
        openMaintenance();

        act(() => byText('Onar ve optimize et').props.onPress());
        await settle();

        expect(h.optimize).toHaveBeenCalledTimes(1);
        expect(h.invalidated).toBe(1);
    });

    it('runs one audit when Check Database is pressed twice, and disables the rows while it runs', async () => {
        openMaintenance();
        const check = byText('Veritabanını kontrol et');

        act(() => { check.props.onPress(); check.props.onPress(); });
        expect(byText('Onar ve optimize et').props.disabled).toBe(true);
        await settle();

        expect(h.checkDatabase).toHaveBeenCalledTimes(1);
        expect(h.alerts).toHaveLength(1);
        expect(byText('Onar ve optimize et').props.disabled).toBe(false);
    });
});
