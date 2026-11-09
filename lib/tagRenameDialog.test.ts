// Rename Tag from the browser's tag filter list: holding a tag (or VoiceOver's Rename action)
// asks for it, the dialog refuses a name with a space, confirms with the number of notes that
// will change, backs up, renames and reports. Behaviour: Anki's sidebar Rename
// (https://docs.ankiweb.net/browsing.html#editing-items).
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, backups: [] as string[] }));
vi.mock('./db', () => ({
    getDB: () => h.db,
    dbUpsertFtsCard: () => {},
    readOnlyTabMessage: () => null,
    flushDatabaseWrites: async () => {},
}));
vi.mock('./backup', () => ({
    BackupNotRestorableError: class BackupNotRestorableError extends Error {},
    createBackupNow: vi.fn(async () => {
        h.backups.push('tus-backup-rename.json');
        return { fileName: 'tus-backup-rename.json', restorable: true };
    }),
}));
vi.mock('./confirm', () => ({ alert: vi.fn(), confirm: vi.fn(), choose: vi.fn() }));
vi.mock('react-native', async () => {
    const { createElement, Fragment } = await import('react');
    return {
        Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.native ?? spec.default },
        StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
        View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable',
        Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
        Keyboard: { dismiss: () => {} },
        InteractionManager: { runAfterInteractions: (task: () => void) => { task(); return { cancel: () => {} }; } },
        FlatList: ({ data, renderItem, keyExtractor, ListEmptyComponent }: any) => createElement('FlatList', null, data.length
            ? data.map((item: unknown, index: number) => createElement(Fragment, { key: keyExtractor(item, index) }, renderItem({ item, index })))
            : ListEmptyComponent),
    };
});
vi.mock('react-native-svg', () => ({ default: 'Svg', Circle: 'Circle', Path: 'Path' }));
vi.mock('../components/AppText', () => ({ Text: 'Text', TextInput: 'TextInput' }));
vi.mock('../constants/theme', () => ({
    BorderRadius: {}, FontSize: {}, Shadows: {}, Spacing: {}, useThemeColors: () => ({}),
}));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (_tr: string, en: string) => en, t: (key: string) => key }) }));

import TagPickerModal from '../components/TagPickerModal';
import { RenameTagDialog } from '../components/browser/RenameTagDialog';
import { createNoteToolStyles } from '../components/browser/noteToolStyles';
import { alert, confirm } from './confirm';
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getNote } from './noteStore';
import { createDeck } from './deckStore';

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;
const l = (_tr: string, en: string) => en;
const t = (key: string) => key;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
let renderer: TestRenderer.ReactTestRenderer | undefined;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    db = createAppDb(SQL);
    h.db = db;
    h.backups = [];
    vi.mocked(alert).mockClear();
    vi.mocked(confirm).mockClear();
});
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
    db.close();
});

const byLabel = (label: string) => renderer!.root.find((node) => node.props.accessibilityLabel === label && typeof node.type === 'string');
const shownText = () => renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join('')).join('\n');

describe('the tag filter list', () => {
    it('asks to rename a tag held down, or chosen with the VoiceOver action, and says how', () => {
        const onRenameTag = vi.fn();
        act(() => {
            renderer = TestRenderer.create(React.createElement(TagPickerModal, {
                visible: true,
                selectedTags: [],
                allowCreate: false,
                loadTags: () => ['kardiyo', 'kardiyo::ekg'],
                onCancel: () => {},
                onConfirm: () => {},
                onRenameTag,
            }));
        });
        expect(shownText()).toContain('Hold a tag to rename it.');
        act(() => byLabel('kardiyo').props.onLongPress());
        expect(onRenameTag).toHaveBeenLastCalledWith('kardiyo');
        const child = byLabel('kardiyo › ekg');
        expect(child.props.accessibilityActions).toEqual([{ name: 'rename', label: 'Rename' }]);
        act(() => child.props.onAccessibilityAction({ nativeEvent: { actionName: 'rename' } }));
        expect(onRenameTag).toHaveBeenLastCalledWith('kardiyo::ekg');
    });

    it('offers nothing of the kind where tags are only picked', () => {
        act(() => {
            renderer = TestRenderer.create(React.createElement(TagPickerModal, {
                visible: true, selectedTags: [], loadTags: () => ['kardiyo'], onCancel: () => {}, onConfirm: () => {},
            }));
        });
        expect(shownText()).not.toContain('Hold a tag to rename it.');
        expect(byLabel('kardiyo').props.onLongPress).toBeUndefined();
        expect(byLabel('kardiyo').props.accessibilityActions).toBeUndefined();
    });
});

describe('the Rename Tag dialog', () => {
    function mount(onRenamed = vi.fn(), onClose = vi.fn()) {
        act(() => {
            renderer = TestRenderer.create(React.createElement(RenameTagDialog, {
                colors: {} as any, l, t, onClose, onRenamed, styles: {} as any, tag: 'kardiyo',
                toolStyles: createNoteToolStyles({} as any),
            }));
        });
        return { onRenamed, onClose };
    }

    it('starts from the old name and refuses a name with a space', () => {
        mount();
        expect(byLabel('New tag name').props.value).toBe('kardiyo');
        act(() => byLabel('New tag name').props.onChangeText('iki kelime'));
        act(() => byLabel('Rename').props.onPress());
        expect(shownText()).toContain('A tag name cannot contain spaces. Use :: for child tags.');
        expect(confirm).not.toHaveBeenCalled();
        expect(h.backups).toEqual([]);
    });

    it('names the notes that will change, then backs up, renames and returns to the list', async () => {
        const deckId = createDeck('D').id;
        const first = createNote(BASIC, ['a', ''], deckId, ['kardiyo']).note.id;
        const second = createNote(BASIC, ['b', ''], deckId, ['Kardiyo::EKG', 'kalp']).note.id;
        const { onRenamed, onClose } = mount();
        act(() => byLabel('New tag name').props.onChangeText('kalp'));
        act(() => byLabel('Rename').props.onPress());

        const [, message, onConfirm] = vi.mocked(confirm).mock.calls[0];
        expect(message).toContain('“kardiyo” and its child tags will be renamed to “kalp” across the whole collection.');
        expect(message).toContain('2 notes will change.');
        expect(message).toContain('“kalp” is already in use; the two tags will be merged.');
        expect(h.backups).toEqual([]);

        await act(async () => {
            onConfirm();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(h.backups).toEqual(['tus-backup-rename.json']);
        expect(getNote(first)?.tags).toEqual(['kalp']);
        expect(getNote(second)?.tags).toEqual(['kalp', 'kalp::EKG']);
        expect(onRenamed).toHaveBeenCalledWith('kardiyo', 'kalp');
        const [title, result, dismissed] = vi.mocked(alert).mock.calls[0];
        expect(title).toBe('Tag Renamed');
        expect(result).toContain('2 notes updated.');
        expect(onClose).not.toHaveBeenCalled();
        dismissed?.();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
