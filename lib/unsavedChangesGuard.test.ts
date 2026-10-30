// useUnsavedChangesGuard on a native stack: the screen is held through usePreventRemove, which is
// what lets iOS settle a back swipe back onto the screen before the question is asked.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type RemoveCallback = (event: { data: { action: { type: string } } }) => void;

const h = vi.hoisted(() => ({
    prevent: undefined as boolean | undefined,
    callback: null as null | ((event: { data: { action: { type: string } } }) => void),
    dispatch: [] as Array<{ type: string }>,
    asked: 0,
    answer: null as null | ((confirmed: boolean) => void),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-router', () => {
    const navigation = { dispatch: (action: { type: string }) => { h.dispatch.push(action); }, isFocused: () => true };
    return { useNavigation: () => navigation };
});
vi.mock('expo-router/react-navigation', () => ({
    usePreventRemove: (prevent: boolean, callback: RemoveCallback) => {
        h.prevent = prevent;
        h.callback = callback;
    },
}));
vi.mock('./confirm', () => ({
    confirmAsync: () => {
        h.asked += 1;
        return new Promise<boolean>((resolve) => { h.answer = resolve; });
    },
}));
vi.mock('./db', () => ({ isWriterTakeoverReloading: () => false }));
vi.mock('./webPopStateGuard', () => ({ addPopStateGuard: () => () => {} }));

import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

function Probe({ dirty }: { dirty: boolean }) {
    useUnsavedChangesGuard(dirty, { title: 'Unsaved changes', message: 'Leave?' });
    return null;
}

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    h.prevent = undefined;
    h.callback = null;
    h.dispatch = [];
    h.asked = 0;
    h.answer = null;
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

function render(dirty: boolean) {
    act(() => {
        if (renderer) renderer.update(React.createElement(Probe, { dirty }));
        else renderer = TestRenderer.create(React.createElement(Probe, { dirty }));
    });
}

const back = { type: 'GO_BACK' };
const remove = (action = back) => act(() => h.callback?.({ data: { action } }));
const answer = async (confirmed: boolean) => {
    await act(async () => {
        h.answer?.(confirmed);
        await Promise.resolve();
    });
};

describe('useUnsavedChangesGuard', () => {
    it('holds the screen only while there are unsaved changes', () => {
        render(false);
        expect(h.prevent).toBe(false);
        render(true);
        expect(h.prevent).toBe(true);
        render(false);
        expect(h.prevent).toBe(false);
    });

    it('asks once per attempt and keeps the screen on Cancel', async () => {
        render(true);
        remove();
        remove();
        expect(h.asked).toBe(1);
        await answer(false);
        expect(h.dispatch).toEqual([]);

        remove();
        expect(h.asked).toBe(2);
    });

    it('lets the held removal through after Discard, and later ones without asking again', async () => {
        render(true);
        remove();
        await answer(true);
        expect(h.dispatch).toEqual([back]);

        const other = { type: 'NAVIGATE' };
        remove(other);
        expect(h.asked).toBe(1);
        expect(h.dispatch).toEqual([back, other]);
    });
});
