// The Empty Cards screen: Keep Notes' kept card is marked and left out of Delete All, a deletion
// goes through the backed-up workflow and says what it deleted and kept, and it scans once.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmptyCardEntry } from './noteTypeStore';

const h = vi.hoisted(() => {
    class WorkflowError extends Error {
        constructor(public readonly stage: 'backup' | 'delete', public readonly backupFileName: string | undefined, options: { cause: unknown }) {
            super('workflow failed', options);
        }
    }
    return {
        WorkflowError,
        alerts: [] as Array<[string, string]>,
        entries: [] as EmptyCardEntry[],
        /** Every card of each note, empty or not, in ordinal order. */
        cardsByNote: new Map<number, number[]>(),
        findEmptyCards: null as any,
        deleteWithBackup: null as any,
        legacyDeletes: [] as number[][],
    };
});

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles },
    ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', Switch: 'Switch',
    TouchableOpacity: 'TouchableOpacity', View: 'View', Text: 'Text',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: () => {}, replace: () => {}, canGoBack: () => true }) }));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/ScreenHeader', () => ({ default: () => null }));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr }) }));
// The collection version lives in the screen, as the context's would: invalidating re-renders it.
vi.mock('../contexts/AppContext', async () => {
    const { useState } = await import('react');
    return {
        useCollectionInvalidation: () => {
            const [collectionVersion, setVersion] = useState(0);
            return { collectionVersion, invalidateCollection: () => setVersion((version) => version + 1) };
        },
    };
});
vi.mock('./confirm', () => ({
    alert: (title: string, message: string) => { h.alerts.push([title, message]); },
    confirm: (_title: string, _message: string, onConfirm: () => void) => onConfirm(),
}));
vi.mock('./backup', () => ({
    BackupNotRestorableError: class extends Error {},
    displayBackupName: (name: string) => name,
}));
vi.mock('./emptyCardsWorkflow', () => ({
    EmptyCardsWorkflowError: h.WorkflowError,
    deleteEmptyCardsWithBackup: (...args: unknown[]) => h.deleteWithBackup(...args),
}));
vi.mock('./noteManager', () => ({
    findEmptyCards: () => h.findEmptyCards(),
    // Keep Notes' rule over the fixture: a note whose every card is listed keeps its first card,
    // and with Keep Notes off goes with its cards.
    planCardOnlyDeletion: (cardIds: number[], options: { preserveNotes?: boolean }) => {
        const selected = new Set(cardIds);
        const whole = [...h.cardsByNote.entries()].filter(([, cards]) => cards.every((id) => selected.has(id)));
        const kept = options.preserveNotes === false ? [] : whole.map(([, cards]) => cards[0]);
        const deletedNotes = options.preserveNotes === false ? whole.map(([noteId]) => noteId) : [];
        return { deleted: cardIds.filter((id) => !kept.includes(id)), kept, deletedNotes };
    },
    deleteAnkiCardOnly: (cardId: number) => { h.legacyDeletes.push([cardId]); },
    deleteAnkiCardsOnly: (cardIds: number[]) => { h.legacyDeletes.push(cardIds); },
}));

import EmptyCardsScreen from '../app/empty-cards';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    h.alerts = [];
    h.legacyDeletes = [];
    // Note 1's both cards are empty; note 2 keeps a valid card 21.
    h.cardsByNote = new Map([[1, [10, 11]], [2, [21, 20]]]);
    h.entries = [
        { cardId: 10, noteId: 1, question: '<b>Mitral</b> kapak', reason: 'Gerekli alan boş' },
        { cardId: 11, noteId: 1, question: '<b>Mitral</b> kapak', reason: 'Şablon artık mevcut değil' },
        { cardId: 20, noteId: 2, question: 'Triküspit', reason: 'Gerekli alan boş' },
    ];
    h.findEmptyCards = vi.fn(() => h.entries);
    h.deleteWithBackup = vi.fn(async () => ({ backupFileName: 'tus-backup-2026-11-08-120000000.json', deleted: [11, 20], kept: [10], deletedNotes: [] }));
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

/** Mount and let the deferred scan run. */
async function mount() {
    act(() => { renderer = TestRenderer.create(React.createElement(EmptyCardsScreen)); });
    await settle();
}

const settle = () => act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
});

function textOf(node: ReactTestInstance | string): string {
    if (typeof node === 'string') return node;
    return node.children.map(textOf).join('');
}

const pressables = () => renderer!.root.findAll((node) => (node.type as unknown) === 'TouchableOpacity');
const deleteAllButton = () => pressables().find((node) => textOf(node).includes('Tümünü sil'))!;
const rowLabels = () => pressables().map((node) => node.props.accessibilityLabel).filter((label: string) => label?.startsWith('Boş kartı sil'));

describe('Empty Cards', () => {
    it('marks the card Keep Notes keeps, offers no delete for it and leaves it out of Delete All', async () => {
        await mount();

        expect(textOf(deleteAllButton())).toContain('Tümünü sil (2)');
        expect(deleteAllButton().props.accessibilityRole).toBe('button');
        expect(deleteAllButton().props.accessibilityLabel).toBe('Tümünü sil: 2 boş kart');
        expect(renderer!.root.findAll((node) => (node.type as unknown) === 'Text' && textOf(node).startsWith('Notları koru: notu kartsız'))).toHaveLength(1);
        // Each row's button names its card, in plain text.
        expect(rowLabels()).toEqual(['Boş kartı sil: Mitral kapak', 'Boş kartı sil: Triküspit']);

        const keepNotes = renderer!.root.find((node) => (node.type as unknown) === 'Switch');
        act(() => keepNotes.props.onValueChange(false));

        expect(textOf(deleteAllButton())).toContain('Tümünü sil (3)');
        expect(rowLabels()).toHaveLength(3);
    });

    it('deletes through the backed-up workflow, says what it deleted and kept, and scans once', async () => {
        await mount();
        // What the collection holds after the deletion: note 1 is down to its kept card.
        h.entries = [h.entries[0]];
        h.cardsByNote = new Map([[1, [10]], [2, [21]]]);

        await act(async () => { deleteAllButton().props.onPress(); });
        await settle();

        expect(h.deleteWithBackup).toHaveBeenCalledWith([10, 11, 20], { preserveNotes: true });
        expect(h.legacyDeletes).toEqual([]);
        expect(h.alerts).toEqual([[
            'common.completed',
            '2 boş kart silindi. 1 kart, notu kartsız kalmasın diye bırakıldı. Geri almak için Yedekler’den tus-backup-2026-11-08-120000000.json yedeğini geri yükleyin.',
        ]]);
        // One scan on opening and one after the deletion, not two.
        expect(h.findEmptyCards).toHaveBeenCalledTimes(2);
        expect(textOf(deleteAllButton())).toContain('Tümünü sil (0)');
        expect(deleteAllButton().props.disabled).toBe(true);
    });

    it('with Keep Notes off says which rows take their note, and how many notes go', async () => {
        await mount();
        const keepNotes = renderer!.root.find((node) => (node.type as unknown) === 'Switch');
        act(() => keepNotes.props.onValueChange(false));
        const texts = renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map(textOf);
        expect(texts.filter((text) => text === 'Notu da silinir: başka kartı kalmıyor')).toHaveLength(2);

        h.deleteWithBackup = vi.fn(async () => ({ backupFileName: 'tus-backup-2026-11-08-120000000.json', deleted: [10, 11], kept: [], deletedNotes: [1] }));
        await act(async () => { deleteAllButton().props.onPress(); });
        await settle();
        expect(h.deleteWithBackup).toHaveBeenCalledWith([10, 11, 20], { preserveNotes: false });
        expect(h.alerts[0][1]).toContain('Kartı kalmayan 1 not da silindi.');
    });

    it('deletes nothing when the safety backup cannot be made, and says so', async () => {
        h.deleteWithBackup = vi.fn(async () => { throw new h.WorkflowError('backup', undefined, { cause: new Error('disk full') }); });
        await mount();

        await act(async () => { pressables().find((node) => node.props.accessibilityLabel === 'Boş kartı sil: Triküspit')!.props.onPress(); });
        await settle();

        expect(h.deleteWithBackup).toHaveBeenCalledWith([20], { preserveNotes: true });
        expect(h.alerts).toEqual([['common.error', 'Güvenlik yedeği alınamadığı için hiçbir kart silinmedi. Yedekler ekranını kontrol edip tekrar deneyin.']]);
        expect(h.findEmptyCards).toHaveBeenCalledTimes(1);
    });
});
