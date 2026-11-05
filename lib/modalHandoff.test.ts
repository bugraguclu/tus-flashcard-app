// useModalHandoff: a menu that hands the screen to another modal closes without its fade, once.
// Measured on the iOS 26.5 simulator before the change: Kartlarım ••• › Görüntüleme sırasını
// değiştir drew nothing for 0.52 s (the menu's 0.33 s fade-out, then a gap) before the dialog
// began to fade in; after it the dialog starts on the next frame. The kit's surfaces are covered
// in modalHandoffSurfaces.test.ts.
import React, { useLayoutEffect, useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { modalHandoffAnimation, modalHandoffClosesAtOnce, useModalHandoff, type ModalAnimationType } from '../hooks/useModalHandoff';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
    animation: ModalAnimationType;
    closeAtOnce: boolean;
    menuVisible: boolean;
    dialogVisible: boolean;
    handOffToDialog: () => void;
    handOffWithoutClosing: () => void;
    close: () => void;
    open: () => void;
}

function mount(baseAnimation: ModalAnimationType = 'fade') {
    const seen: Harness[] = [];
    let latest!: Harness;
    function Menu() {
        const [menuVisible, setMenuVisible] = useState(true);
        const [dialogVisible, setDialogVisible] = useState(false);
        const handoff = useModalHandoff(menuVisible, baseAnimation);
        latest = {
            animation: handoff.animationType,
            closeAtOnce: handoff.closeAtOnce,
            menuVisible,
            dialogVisible,
            handOffToDialog: () => handoff.handOff(() => { setMenuVisible(false); setDialogVisible(true); }),
            handOffWithoutClosing: () => handoff.handOff(() => undefined),
            close: () => setMenuVisible(false),
            open: () => { setDialogVisible(false); setMenuVisible(true); },
        };
        // Only committed renders reach native; React may discard a render it redoes at once.
        const committed = latest;
        useLayoutEffect(() => { seen.push(committed); });
        return null;
    }
    act(() => { TestRenderer.create(React.createElement(Menu)); });
    return { current: () => latest, seen };
}

describe('modalHandoffAnimation', () => {
    it('drops the animation only for an iOS hand-off', () => {
        expect(modalHandoffAnimation('fade', true, 'ios')).toBe('none');
        expect(modalHandoffAnimation('slide', true, 'ios')).toBe('none');
        expect(modalHandoffAnimation('fade', false, 'ios')).toBe('fade');
        // Web and Android present modals independently; they keep their animation.
        expect(modalHandoffAnimation('fade', true, 'web')).toBe('fade');
        expect(modalHandoffAnimation('slide', true, 'android')).toBe('slide');
        // The kit's own surfaces (PopoverMenu, AppSheet, AppDialog) take the same answer as a flag.
        expect(modalHandoffClosesAtOnce(true, 'ios')).toBe(true);
        expect(modalHandoffClosesAtOnce(false, 'ios')).toBe(false);
        expect(modalHandoffClosesAtOnce(true, 'web')).toBe(false);
    });
});

describe('useModalHandoff (iOS)', () => {
    it('closes the menu without its fade in the same commit that opens the next modal', () => {
        const menu = mount();
        expect(menu.current().animation).toBe('fade');
        act(() => menu.current().handOffToDialog());
        const state = menu.current();
        expect(state.menuVisible).toBe(false);
        expect(state.dialogVisible).toBe(true);
        expect(state.animation).toBe('none');
        expect(state.closeAtOnce).toBe(true);
        // No committed render ever showed the menu hidden with its fade still set.
        expect(menu.seen.filter((render) => !render.menuVisible && render.animation !== 'none')).toEqual([]);
    });

    it('fades in again the next time the menu opens, and an ordinary close keeps the fade', () => {
        const menu = mount('slide');
        act(() => menu.current().handOffToDialog());
        const beforeReopen = menu.seen.length;
        act(() => menu.current().open());
        expect(menu.current().menuVisible).toBe(true);
        expect(menu.current().animation).toBe('slide');
        // The reopened menu is never committed with 'none' (that would present it unanimated).
        expect(menu.seen.slice(beforeReopen).map((render) => render.animation)).toEqual(['slide']);
        expect(menu.seen.slice(beforeReopen).map((render) => render.closeAtOnce)).toEqual([false]);
        act(() => menu.current().close());
        expect(menu.current().animation).toBe('slide');
    });

    it('keeps the animation when the hand-off did not close the menu', () => {
        const menu = mount();
        act(() => menu.current().handOffWithoutClosing());
        expect(menu.current().menuVisible).toBe(true);
        expect(menu.current().animation).toBe('fade');
        act(() => menu.current().close());
        expect(menu.current().animation).toBe('fade');
        expect(menu.current().closeAtOnce).toBe(false);
    });
});
