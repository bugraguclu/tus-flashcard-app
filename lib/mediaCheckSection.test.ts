// Backups › Check Media: what the learner is told after moving unused files to the trash, and
// that the list is read again however the move ended.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaCheckResult } from './mediaCheck';

const h = vi.hoisted(() => ({
    alerts: [] as Array<[string, string]>,
    checks: [] as MediaCheckResult[],
    checkMedia: null as any,
    moveUnusedMediaToTrash: null as any,
    restoreMediaTrash: null as any,
    createBackupNow: null as any,
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles },
    ActivityIndicator: 'ActivityIndicator', TouchableOpacity: 'TouchableOpacity', View: 'View', Text: 'Text',
}));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr }) }));
vi.mock('./confirm', () => ({
    alert: (title: string, message: string) => { h.alerts.push([title, message]); },
    confirm: (_title: string, _message: string, onConfirm: () => void) => onConfirm(),
}));
vi.mock('./backup', () => ({ createBackupNow: () => h.createBackupNow() }));
vi.mock('./mediaCheck', () => ({
    canTrashMedia: () => true,
    checkMedia: () => h.checkMedia(),
    moveUnusedMediaToTrash: (names: string[]) => h.moveUnusedMediaToTrash(names),
    restoreMediaTrash: () => h.restoreMediaTrash(),
}));

import MediaCheckSection from '../components/backups/MediaCheckSection';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const report = (unused: string[]): MediaCheckResult => ({ unused, missing: [], storedCount: unused.length + 1, referencedCount: 1 });

beforeEach(() => {
    h.alerts = [];
    h.checks = [report(['a.mp3', 'b.png', 'c.apkg'])];
    h.checkMedia = vi.fn(async () => h.checks.length > 1 ? h.checks.shift()! : h.checks[0]);
    h.createBackupNow = vi.fn(async () => ({ fileName: 'tus-backup-2026-11-08-120000000.json', restorable: true }));
    h.moveUnusedMediaToTrash = vi.fn(async () => ({ moved: 2, failed: 1, trashFolder: 'file:///docs/tus-media-trash/x/' }));
    h.restoreMediaTrash = vi.fn(async () => ({ restored: 2, skipped: 0, failed: 1 }));
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

function textOf(node: ReactTestInstance | string): string {
    if (typeof node === 'string') return node;
    return node.children.map(textOf).join('');
}

const button = (text: string) => {
    const found = renderer!.root.findAll((node) => (node.type as unknown) === 'TouchableOpacity' && textOf(node).includes(text));
    return found[found.length - 1];
};

async function press(text: string) {
    await act(async () => { await button(text).props.onPress(); });
    // The trash and restore run inside confirm() callbacks the section does not await.
    await act(async () => { for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function checkThreeUnused() {
    act(() => { renderer = TestRenderer.create(React.createElement(MediaCheckSection, { disabled: false })); });
    await press('Medyayı denetle');
    expect(button('Kullanılmayanları çöpe taşı (3)')).toBeDefined();
}

describe('Check Media', () => {
    it('says how many files moved and how many stayed when one could not be moved, and lists only those', async () => {
        await checkThreeUnused();
        h.checks = [report(['c.apkg'])];

        await press('Kullanılmayanları çöpe taşı (3)');

        expect(h.createBackupNow).toHaveBeenCalledTimes(1);
        expect(h.alerts).toEqual([['Kısmen tamamlandı', '2 dosya çöp kutusuna taşındı; 1 dosya taşınamadı ve yerinde kaldı.']]);
        expect(button('Kullanılmayanları çöpe taşı (1)')).toBeDefined();
    });

    it('reads the folder again when the move stopped part way', async () => {
        await checkThreeUnused();
        h.moveUnusedMediaToTrash = vi.fn(async () => { throw new Error('trash folder could not be created'); });
        h.checks = [report(['b.png'])];

        await press('Kullanılmayanları çöpe taşı (3)');

        expect(h.alerts).toEqual([['common.error', 'Kullanılmayan medya taşınamadı. Hiçbir dosya silinmedi.']]);
        expect(h.checkMedia).toHaveBeenCalledTimes(2);
        expect(button('Kullanılmayanları çöpe taşı (1)')).toBeDefined();
    });

    it('says how many files could not be put back from the trash', async () => {
        await checkThreeUnused();
        h.checks = [report(['a.mp3', 'b.png'])];

        await press('Çöptekileri geri getir');

        expect(h.alerts).toEqual([['Kısmen tamamlandı', '2 dosya geri kondu. 1 dosya geri konamadı ve çöpte kaldı.']]);
        expect(button('Kullanılmayanları çöpe taşı (2)')).toBeDefined();
    });
});
