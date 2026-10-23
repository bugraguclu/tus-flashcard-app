import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Platform: { OS: 'ios', select: (spec: { ios?: unknown; default?: unknown }) => spec.ios ?? spec.default },
    StyleSheet: { create: (styles: unknown) => styles },
    TextInput: 'TextInput',
}));
vi.mock('./db', () => ({ getDB: vi.fn(), dbUpsertFtsCard: vi.fn() }));
import { FieldNameInput } from '../components/note-type/FieldNameInput';
import { commitFieldRename } from './noteTypeEditor';
import type { NoteType } from './models';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer?.unmount()); renderer = undefined; });

const inputs = () => renderer!.root.findAll((node) => (node.type as string) === 'TextInput');
const typeInto = (index: number, text: string) => {
    for (let i = 1; i <= text.length; i++) act(() => inputs()[index].props.onChangeText(text.slice(0, i)));
};

describe('field name input', () => {
    it('keeps the typed name as a draft and commits it once on blur', () => {
        const onCommit = vi.fn();
        const onPendingChange = vi.fn();
        act(() => {
            renderer = TestRenderer.create(React.createElement(FieldNameInput, { name: 'Back', onCommit, onPendingChange }));
        });
        typeInto(0, 'Front2');
        expect(onCommit).not.toHaveBeenCalled();
        expect(inputs()[0].props.value).toBe('Front2');

        act(() => inputs()[0].props.onBlur());
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('Front2');
        // The committed draft is dropped; the field shows whatever name the screen kept.
        expect(inputs()[0].props.value).toBe('Back');
        expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
    });

    it('commits once when Return is followed by the blur it causes', () => {
        const onCommit = vi.fn();
        act(() => {
            renderer = TestRenderer.create(React.createElement(FieldNameInput, { name: 'Back', onCommit }));
        });
        typeInto(0, 'Answer');
        act(() => inputs()[0].props.onSubmitEditing());
        act(() => inputs()[0].props.onBlur());
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('Answer');
    });

    it('does not commit a focus change without typing', () => {
        const onCommit = vi.fn();
        act(() => {
            renderer = TestRenderer.create(React.createElement(FieldNameInput, { name: 'Back', onCommit }));
        });
        act(() => inputs()[0].props.onBlur());
        expect(onCommit).not.toHaveBeenCalled();
    });
});

describe('note type field renaming through the input', () => {
    const basic: NoteType = {
        id: 1,
        name: 'Basic',
        kind: 'standard',
        fields: [
            { name: 'Front', ord: 0, sticky: false, rtl: false },
            { name: 'Back', ord: 1, sticky: false, rtl: false },
        ],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }],
        css: '',
        sortFieldIdx: 0,
        mod: 0,
    };

    function mountFields() {
        const latest: { current: NoteType } = { current: basic };
        const refused: string[] = [];
        function Fields() {
            const [nt, setNt] = useState(basic);
            latest.current = nt;
            return React.createElement(React.Fragment, null, nt.fields.map((field) => React.createElement(FieldNameInput, {
                key: field.ord,
                name: field.name,
                onCommit: (draft: string) => {
                    const outcome = commitFieldRename(nt, field.ord, draft);
                    if (outcome.status === 'duplicate') refused.push(outcome.conflict.name);
                    else setNt(outcome.noteType);
                },
            })));
        }
        act(() => { renderer = TestRenderer.create(React.createElement(Fields)); });
        return { latest, refused };
    }

    it('renaming Back to Front2 leaves the front template on the original front field', () => {
        const { latest, refused } = mountFields();
        typeInto(1, 'Front2'); // passes through "Front" while typing
        act(() => inputs()[1].props.onBlur());
        expect(refused).toEqual([]);
        expect(latest.current.fields.map((f) => f.name)).toEqual(['Front', 'Front2']);
        expect(latest.current.templates[0]).toMatchObject({ qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Front2}}' });
    });

    it('refuses a final name that another field already has and keeps the old name', () => {
        const { latest, refused } = mountFields();
        typeInto(1, 'front');
        act(() => inputs()[1].props.onBlur());
        expect(refused).toEqual(['Front']);
        expect(latest.current).toBe(basic);
        expect(inputs()[1].props.value).toBe('Back');
    });
});
