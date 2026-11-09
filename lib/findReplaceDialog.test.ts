// The browser's Find and Replace dialog, driven the way a learner uses it: the options Anki's
// dialog starts with (https://docs.ankiweb.net/browsing.html#find-and-replace), a refused regular
// expression that changes nothing, and the confirm → backup → edit → refresh path.
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
        h.backups.push('tus-backup-ui.json');
        return { fileName: 'tus-backup-ui.json', restorable: true };
    }),
}));
vi.mock('./confirm', () => ({ alert: vi.fn(), confirm: vi.fn(), choose: vi.fn() }));
vi.mock('./storage', () => ({ getDbSetting: () => null, setDbSetting: vi.fn() }));
vi.mock('react-native', () => ({
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.native ?? spec.default },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
    View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable',
    Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
    InteractionManager: { runAfterInteractions: (task: () => void) => { task(); return { cancel: () => {} }; } },
}));
vi.mock('../components/AppText', () => ({ Text: 'Text', TextInput: 'TextInput' }));

import { FindReplaceDialog } from '../components/browser/FindReplaceDialog';
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

function mount(props: { selectedNoteIds?: number[]; onChanged?: () => void; onClose?: () => void } = {}) {
    act(() => {
        renderer = TestRenderer.create(React.createElement(FindReplaceDialog, {
            colors: {} as any,
            l,
            locale: 'en',
            noteTypes: BUILTIN_NOTE_TYPES,
            onChanged: props.onChanged ?? (() => {}),
            onClose: props.onClose ?? (() => {}),
            selectedNoteIds: props.selectedNoteIds ?? [],
            selectedNoteTypeIds: props.selectedNoteIds?.length ? [1] : [],
            styles: {} as any,
            t,
            toolStyles: createNoteToolStyles({} as any),
            visible: true,
        }));
    });
}

const byLabel = (label: string) => renderer!.root.find((node) => node.props.accessibilityLabel === label && typeof node.type === 'string');
const shownText = () => renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join('')).join('\n');
const type = (label: string, text: string) => act(() => byLabel(label).props.onChangeText(text));
const press = (label: string) => act(() => byLabel(label).props.onPress());

describe('the Find and Replace dialog', () => {
    it('starts on the selection when notes are selected, and offers it only then', () => {
        mount({ selectedNoteIds: [1, 2] });
        expect(byLabel('Selected notes only (2)').props.accessibilityState).toEqual({ checked: true, disabled: false });
        expect(byLabel('Ignore case').props.accessibilityState.checked).toBe(true);
        expect(byLabel('Treat input as regular expression').props.accessibilityState.checked).toBe(false);
        act(() => renderer!.unmount());

        mount();
        expect(byLabel('Selected notes only').props.accessibilityState).toEqual({ checked: false, disabled: true });
    });

    it('lists all fields, tags and the field names to choose from', () => {
        mount();
        press('In: All fields');
        const choices = renderer!.root.findAll((node) => node.props.accessibilityRole === 'radio' && typeof node.type === 'string')
            .map((node) => node.props.accessibilityLabel);
        expect(choices.slice(0, 2)).toEqual(['All fields', 'Tags']);
        expect(choices).toEqual(expect.arrayContaining(['Front', 'Back', 'Text', 'Back Extra']));
    });

    it('shows a plain error for an invalid regular expression and changes nothing', () => {
        const { note } = createNote(BASIC, ['(kalp', ''], createDeck('D').id);
        mount();
        type('Text to find', '(kalp');
        press('Treat input as regular expression');
        press('Replace');
        expect(shownText()).toContain('The regular expression is not valid; no note was changed.');
        expect(confirm).not.toHaveBeenCalled();
        expect(h.backups).toEqual([]);
        expect(getNote(note.id)?.fields[0]).toBe('(kalp');
    });

    it('names the scope and the count, then backs up, edits and refreshes in place', async () => {
        const deckId = createDeck('D').id;
        const heart = createNote(BASIC, ['kalp', ''], deckId).note;
        createNote(BASIC, ['böbrek', ''], deckId);
        const onChanged = vi.fn();
        const onClose = vi.fn();
        mount({ onChanged, onClose });
        type('Text to find', 'KALP');
        type('Replacement text', 'yürek');
        press('Replace');

        expect(confirm).toHaveBeenCalledTimes(1);
        const [title, message, onConfirm] = vi.mocked(confirm).mock.calls[0];
        expect(title).toBe('Find and Replace');
        expect(message).toContain('Scope: the whole collection (2 notes).');
        expect(message).toContain('1 note will change.');
        expect(h.backups).toEqual([]);

        await act(async () => {
            onConfirm();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(h.backups).toEqual(['tus-backup-ui.json']);
        expect(getNote(heart.id)?.fields[0]).toBe('yürek');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onChanged).toHaveBeenCalledWith({ keepsStudyQueue: true });
        expect(alert).toHaveBeenCalledWith('Find and Replace', expect.stringContaining('1 note updated.'));
    });

    it('says so when nothing matches, without asking or backing up', () => {
        createNote(BASIC, ['kalp', ''], createDeck('D').id);
        mount();
        type('Text to find', 'akciğer');
        press('Replace');
        expect(shownText()).toContain('No match found; no note was changed.');
        expect(confirm).not.toHaveBeenCalled();
        expect(h.backups).toEqual([]);
    });
});
