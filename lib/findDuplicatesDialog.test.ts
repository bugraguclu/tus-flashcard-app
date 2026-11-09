// The browser's Find Duplicates dialog as a learner uses it
// (https://docs.ankiweb.net/browsing.html#finding-duplicates): pick a field, search, open a group
// in the list as a search, and Tag Duplicates after a confirmation.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => h.db,
    dbUpsertFtsCard: () => {},
    readOnlyTabMessage: () => null,
    flushDatabaseWrites: async () => {},
}));
vi.mock('./confirm', () => ({ alert: vi.fn(), confirm: vi.fn(), choose: vi.fn() }));
vi.mock('./storage', () => ({ getDbSetting: () => null, setDbSetting: vi.fn() }));
vi.mock('react-native', async () => {
    const { createElement, Fragment } = await import('react');
    return {
        Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.native ?? spec.default },
        StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
        View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable',
        Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
        InteractionManager: { runAfterInteractions: (task: () => void) => { task(); return { cancel: () => {} }; } },
        FlatList: ({ data, renderItem, keyExtractor }: any) => createElement('FlatList', null, data.map((item: unknown, index: number) => (
            createElement(Fragment, { key: keyExtractor(item, index) }, renderItem({ item, index }))
        ))),
    };
});
vi.mock('../components/AppText', () => ({ Text: 'Text', TextInput: 'TextInput' }));

import { FindDuplicatesDialog } from '../components/browser/FindDuplicatesDialog';
import { createNoteToolStyles } from '../components/browser/noteToolStyles';
import { confirm } from './confirm';
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getNote } from './noteStore';
import { createDeck } from './deckStore';
import { saveNoteType } from './noteTypeStore';

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;
const l = (_tr: string, en: string) => en;
const t = (key: string) => key;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
let deckId: number;
let renderer: TestRenderer.ReactTestRenderer | undefined;
const handlers = { onChanged: vi.fn(), onClose: vi.fn(), onShowGroup: vi.fn() };

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    db = createAppDb(SQL);
    h.db = db;
    for (const type of BUILTIN_NOTE_TYPES) saveNoteType(type);
    deckId = createDeck('D').id;
    vi.mocked(confirm).mockClear();
    Object.values(handlers).forEach((handler) => handler.mockClear());
});
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
    db.close();
});

function element(visible: boolean, dataVersion = 1) {
    return React.createElement(FindDuplicatesDialog, {
        colors: {} as any,
        dataVersion,
        l,
        locale: 'en',
        noteTypes: BUILTIN_NOTE_TYPES,
        ...handlers,
        styles: {} as any,
        t,
        toolStyles: createNoteToolStyles({} as any),
        visible,
    });
}

const mount = () => act(() => { renderer = TestRenderer.create(element(true)); });
const byLabel = (label: string) => renderer!.root.find((node) => node.props.accessibilityLabel === label && typeof node.type === 'string');
const allByRole = (role: string) => renderer!.root.findAll((node) => node.props.accessibilityRole === role && typeof node.type === 'string');
const shownText = () => renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join('')).join('\n');
const add = (front: string) => createNote(BASIC, [front, ''], deckId).note.id;

describe('the Find Duplicates dialog', () => {
    it('lists the groups for the chosen field and opens one in the list as a search', () => {
        add('<b>Kalp</b>');
        add('Kalp');
        add('Akciğer');
        mount();
        expect(byLabel('Field: Front')).toBeDefined();
        act(() => byLabel('Search for duplicates').props.onPress());

        expect(shownText()).toContain('1 group found across 2 notes.');
        const group = byLabel('2 notes: Kalp');
        act(() => group.props.onPress());
        expect(handlers.onClose).toHaveBeenCalledTimes(1);
        expect(handlers.onShowGroup).toHaveBeenCalledWith('"dupe:1,Kalp"');
    });

    it('shows a plain error for an invalid search and lists nothing', () => {
        add('Kalp');
        add('Kalp');
        mount();
        act(() => byLabel('Optional search').props.onChangeText('deck:"open'));
        act(() => byLabel('Search for duplicates').props.onPress());
        expect(shownText()).toContain('Invalid search. Check the terms, quotes and parentheses.');
        expect(allByRole('button').some((node) => String(node.props.accessibilityLabel).endsWith(': Kalp'))).toBe(false);
    });

    it('tags every grouped note after a confirmation', async () => {
        const ids = [add('x'), add('x'), add('y'), add('y')];
        mount();
        act(() => byLabel('Search for duplicates').props.onPress());
        act(() => byLabel('Tag Duplicates').props.onPress());
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(vi.mocked(confirm).mock.calls[0][1]).toContain('4 notes will get the tag “duplicate”.');
        expect(getNote(ids[0])?.tags).toEqual([]);

        await act(async () => {
            vi.mocked(confirm).mock.calls[0][2]();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        for (const id of ids) expect(getNote(id)?.tags).toEqual(['duplicate']);
        expect(handlers.onChanged).toHaveBeenCalledWith({ keepsStudyQueue: true });
        expect(shownText()).toContain('4 notes got the tag “duplicate”.');
    });

    it('keeps its groups when reopened, and searches again after the collection changed', () => {
        add('x');
        add('x');
        mount();
        act(() => byLabel('Search for duplicates').props.onPress());
        expect(shownText()).toContain('1 group found across 2 notes.');

        act(() => renderer!.update(element(false)));
        act(() => renderer!.update(element(true)));
        expect(shownText()).toContain('1 group found across 2 notes.');

        add('y');
        add('y');
        act(() => renderer!.update(element(false, 2)));
        act(() => renderer!.update(element(true, 2)));
        expect(shownText()).toContain('2 groups found across 4 notes.');
    });
});
