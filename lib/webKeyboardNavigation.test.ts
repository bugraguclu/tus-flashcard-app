import { describe, expect, it } from 'vitest';
import { appShortcutFor, axisForRole, coversLayer, isFocusNavigationKey, isShowingRoute, stepIndex } from './webKeyboardNavigation';

const press = (key: string, extra: Partial<Parameters<typeof appShortcutFor>[0]> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...extra,
});

describe('stepIndex', () => {
    it('moves down and up a vertical menu and wraps at both ends', () => {
        expect(stepIndex(0, 3, 'ArrowDown', 'vertical')).toBe(1);
        expect(stepIndex(2, 3, 'ArrowDown', 'vertical')).toBe(0);
        expect(stepIndex(0, 3, 'ArrowUp', 'vertical')).toBe(2);
    });

    it('moves a row of tabs with left and right only', () => {
        expect(stepIndex(1, 4, 'ArrowRight', 'horizontal')).toBe(2);
        expect(stepIndex(0, 4, 'ArrowLeft', 'horizontal')).toBe(3);
        expect(stepIndex(1, 4, 'ArrowDown', 'horizontal')).toBeNull();
        expect(stepIndex(1, 4, 'ArrowRight', 'vertical')).toBeNull();
    });

    it('jumps to the ends with Home and End', () => {
        expect(stepIndex(2, 5, 'Home', 'vertical')).toBe(0);
        expect(stepIndex(2, 5, 'End', 'horizontal')).toBe(4);
    });

    it('enters a group from outside at its first or last item', () => {
        expect(stepIndex(-1, 3, 'ArrowDown', 'vertical')).toBe(0);
        expect(stepIndex(-1, 3, 'ArrowUp', 'vertical')).toBe(2);
        expect(stepIndex(-1, 3, 'Enter', 'vertical')).toBeNull();
    });

    it('does nothing in an empty group', () => {
        expect(stepIndex(0, 0, 'ArrowDown', 'vertical')).toBeNull();
    });
});

describe('axisForRole', () => {
    it('lays menu items out vertically and tabs horizontally', () => {
        expect(axisForRole('menuitem')).toBe('vertical');
        expect(axisForRole('menuitemradio')).toBe('vertical');
        expect(axisForRole('tab')).toBe('horizontal');
        expect(axisForRole('button')).toBeNull();
        expect(axisForRole(null)).toBeNull();
    });
});

describe('appShortcutFor', () => {
    it('maps the Anki desktop letters to their screens', () => {
        expect(appShortcutFor(press('d'), false)).toEqual({ kind: 'route', route: '/decks' });
        expect(appShortcutFor(press('a'), false)).toEqual({ kind: 'route', route: '/editor' });
        expect(appShortcutFor(press('b'), false)).toEqual({ kind: 'route', route: '/browser' });
        expect(appShortcutFor(press('t'), false)).toEqual({ kind: 'route', route: '/stats' });
        expect(appShortcutFor(press('k'), false)).toEqual({ kind: 'route', route: '/stopwatch' });
    });

    it('opens search with / and the shortcut list with ?', () => {
        expect(appShortcutFor(press('/'), false)).toEqual({ kind: 'search' });
        expect(appShortcutFor(press('?', { shiftKey: true }), false)).toEqual({ kind: 'help' });
    });

    it('opens Settings with Cmd+, on a Mac and Ctrl+, elsewhere', () => {
        expect(appShortcutFor(press(',', { metaKey: true }), true)).toEqual({ kind: 'route', route: '/settings' });
        expect(appShortcutFor(press(',', { ctrlKey: true }), false)).toEqual({ kind: 'route', route: '/settings' });
        expect(appShortcutFor(press(',', { ctrlKey: true }), true)).toBeNull();
        expect(appShortcutFor(press(','), false)).toBeNull();
    });

    it('leaves chords, capitals and held keys to the browser', () => {
        expect(appShortcutFor(press('b', { ctrlKey: true }), false)).toBeNull();
        expect(appShortcutFor(press('a', { metaKey: true }), true)).toBeNull();
        expect(appShortcutFor(press('d', { altKey: true }), false)).toBeNull();
        expect(appShortcutFor(press('D', { shiftKey: true }), false)).toBeNull();
        expect(appShortcutFor(press('d', { repeat: true }), false)).toBeNull();
        expect(appShortcutFor(press('x'), false)).toBeNull();
    });
});

describe('isShowingRoute', () => {
    it('treats a screen and its sub-pages as already showing', () => {
        expect(isShowingRoute('/settings/keyboard', '/settings')).toBe(true);
        expect(isShowingRoute('/stats', '/stats')).toBe(true);
        expect(isShowingRoute('/study-calendar', '/stats')).toBe(false);
        expect(isShowingRoute('/', '/decks')).toBe(false);
    });
});

describe('isFocusNavigationKey', () => {
    it('counts Tab, arrows, Home, End and Escape but not typing or answer keys', () => {
        for (const key of ['Tab', 'ArrowDown', 'ArrowLeft', 'Home', 'End', 'Escape']) expect(isFocusNavigationKey(key)).toBe(true);
        for (const key of [' ', 'Enter', '1', 'a']) expect(isFocusNavigationKey(key)).toBe(false);
    });
});

describe('coversLayer', () => {
    it('recognises a backdrop by its size against the modal layer', () => {
        expect(coversLayer(1280, 800, 1280, 800)).toBe(true);
        expect(coversLayer(320, 240, 1280, 800)).toBe(false);
        expect(coversLayer(1280, 56, 1280, 800)).toBe(false);
        expect(coversLayer(100, 100, 0, 0)).toBe(false);
    });
});
