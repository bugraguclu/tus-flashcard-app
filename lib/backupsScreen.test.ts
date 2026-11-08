// The Backups screen: confirmations and VoiceOver name a backup the way its row shows it, and
// sizes are written in the learner's language.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupInfo } from './backup';

const h = vi.hoisted(() => ({
    english: false,
    backups: [] as BackupInfo[],
    confirms: [] as Array<[string, string]>,
    deleted: [] as string[],
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles },
    ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', View: 'View', Text: 'Text',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: () => {}, replace: () => {}, push: () => {}, canGoBack: () => true }) }));
vi.mock('../components/AppText', () => ({ Text: 'Text', TextInput: 'TextInput' }));
vi.mock('../components/ScreenHeader', () => ({ default: () => null }));
vi.mock('../components/backups/MediaCheckSection', () => ({ default: () => null }));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes };
});
vi.mock('../hooks/useI18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        l: (tr: string, en: string) => (h.english ? en : tr),
        localeTag: h.english ? 'en-US' : 'tr-TR',
    }),
}));
vi.mock('../contexts/AppContext', () => ({
    useAppSettings: () => ({ refreshSettings: () => {} }),
    useCollectionInvalidation: () => ({ invalidateCollection: () => {} }),
    useCatalogStatus: () => ({ refreshCatalogAccess: async () => ({}) }),
}));
vi.mock('./db', () => ({ readOnlyTabMessage: () => null, getDB: () => null, isPrimaryTab: () => true }));
vi.mock('./confirm', () => ({
    alert: () => {},
    confirm: (title: string, message: string, onConfirm: () => void) => { h.confirms.push([title, message]); onConfirm(); },
}));
// The naming rules are the real ones; storage is faked.
vi.mock('./backup', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./backup')>();
    return {
        BackupNameError: actual.BackupNameError,
        displayBackupName: actual.displayBackupName,
        isPreRestoreBackup: actual.isPreRestoreBackup,
        validateBackupContents: actual.validateBackupContents,
        getDefaultBackupFileName: () => 'tus-backup-2026-11-08-120000000.json',
        listBackups: async () => h.backups,
        deleteBackup: async (name: string) => { h.deleted.push(name); },
        createBackupNow: async () => ({ fileName: 'tus-backup-2026-11-08-120000000.json', restorable: true }),
        readBackup: async () => '{}',
        importBackupContents: async () => ({ ok: true, preRestoreName: null }),
    };
});

import BackupsScreen from '../app/backups';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const CUSTOM: BackupInfo = { name: 'tus-backup-custom-Sınav öncesi.json', size: Math.round(12.3 * 1024 * 1024), createdAt: new Date('2026-11-07T09:30:00').getTime() };
const PRE_RESTORE: BackupInfo = { name: 'tus-prerestore-1762500000000.json', size: 600 * 1024, createdAt: new Date('2026-11-06T18:05:00').getTime() };

beforeEach(() => {
    h.english = false;
    h.backups = [CUSTOM, PRE_RESTORE];
    h.confirms = [];
    h.deleted = [];
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

async function mount() {
    await act(async () => { renderer = TestRenderer.create(React.createElement(BackupsScreen)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function textOf(node: ReactTestInstance | string): string {
    if (typeof node === 'string') return node;
    return node.children.map(textOf).join('');
}

const pressables = () => renderer!.root.findAll((node) => (node.type as unknown) === 'TouchableOpacity');
const texts = () => renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map(textOf);
/** The "date · size" line of each row, as the learner reads it. */
const rowSubtitles = () => texts().filter((text) => / · /.test(text));
const rowDeleteButtons = () => pressables().filter((node) => textOf(node) === 'common.delete');

describe('Backups', () => {
    it('names the backup and date its row shows when asking to delete it, never the file name', async () => {
        await mount();
        const [customDate, preRestoreDate] = rowSubtitles().map((line) => line.split(' · ')[0]);

        await act(async () => { rowDeleteButtons()[0].props.onPress(); });
        await act(async () => { rowDeleteButtons()[1].props.onPress(); });

        expect(h.confirms.map(([, message]) => message)).toEqual([
            `“Sınav öncesi.json” (${customDate}) kalıcı olarak silinecek.`,
            `Geri yükleme öncesi kopya (${preRestoreDate}) kalıcı olarak silinecek.`,
        ]);
        expect(h.deleted).toEqual([CUSTOM.name, PRE_RESTORE.name]);
    });

    it('gives Back Up Now and each row’s buttons a role, and labels each with its backup', async () => {
        await mount();
        const [customDate, preRestoreDate] = rowSubtitles().map((line) => line.split(' · ')[0]);

        const backUpNow = pressables().find((node) => textOf(node) === 'Şimdi yedekle')!;
        expect(backUpNow.props.accessibilityRole).toBe('button');
        const rowButtons = pressables().filter((node) => ['Geri yükle', 'Paylaş', 'common.delete'].includes(textOf(node)));
        expect(rowButtons.map((node) => [node.props.accessibilityRole, node.props.accessibilityLabel])).toEqual([
            ['button', `Geri yükle: “Sınav öncesi.json”, ${customDate}`],
            ['button', `Paylaş: “Sınav öncesi.json”, ${customDate}`],
            ['button', `Sil: “Sınav öncesi.json”, ${customDate}`],
            ['button', `Geri yükle: Geri yükleme öncesi kopya, ${preRestoreDate}`],
            ['button', `Paylaş: Geri yükleme öncesi kopya, ${preRestoreDate}`],
            ['button', `Sil: Geri yükleme öncesi kopya, ${preRestoreDate}`],
        ]);
    });

    it('writes sizes with the decimal separator of the learner’s language', async () => {
        await mount();
        expect(rowSubtitles().map((line) => line.split(' · ')[1])).toEqual(['12,3 MB', '600 KB']);
        act(() => renderer!.unmount());

        h.english = true;
        await mount();
        expect(rowSubtitles().map((line) => line.split(' · ')[1])).toEqual(['12.3 MB', '600 KB']);
    });
});
