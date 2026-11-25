/**
 * The decisions behind the web build's keyboard use, kept free of the DOM so they can be tested:
 * which key moves focus where inside a menu or a row of tabs, and which app-wide shortcut a key
 * press means. `hooks/useWebKeyboardNavigation.ts` applies them to the page.
 *
 * The app-wide letters follow the Anki desktop main window (D decks, A add, B browse, T
 * statistics); K opens the Kronometre, `/` the screen's search field, `?` the list of shortcuts
 * and Ctrl/Cmd+, Settings, as desktop apps do.
 */

/** How a group of items is laid out, which decides the arrow keys that move through it. */
export type ItemAxis = 'vertical' | 'horizontal';

/**
 * The item a navigation key moves to in a group of `count` items, or null when the key does not
 * move within this group. Movement wraps around at both ends, as menus and tab rows do on the
 * desktop; Home and End jump to the ends.
 */
export function stepIndex(current: number, count: number, key: string, axis: ItemAxis): number | null {
    if (count <= 0) return null;
    const previous = axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const next = axis === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    // Focus outside the group (a menu that has just opened): the first or last item.
    if (current < 0) {
        if (key === next) return 0;
        if (key === previous) return count - 1;
        return null;
    }
    if (key === next) return (current + 1) % count;
    if (key === previous) return (current - 1 + count) % count;
    return null;
}

/** The roles whose groups take arrow keys, and how each group is laid out. */
export function axisForRole(role: string | null): ItemAxis | null {
    switch (role) {
        case 'menuitem':
        case 'menuitemcheckbox':
        case 'menuitemradio':
            return 'vertical';
        case 'tab':
            return 'horizontal';
        default:
            return null;
    }
}

export type AppShortcut =
    | { kind: 'route'; route: '/decks' | '/editor' | '/browser' | '/stats' | '/stopwatch' | '/settings' }
    | { kind: 'search' }
    | { kind: 'help' };

export interface ShortcutKeyPress {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    repeat: boolean;
}

const LETTER_ROUTES: Record<string, Extract<AppShortcut, { kind: 'route' }>['route']> = {
    d: '/decks',
    a: '/editor',
    b: '/browser',
    t: '/stats',
    k: '/stopwatch',
};

/**
 * The app-wide shortcut a key press asks for, or null. The caller has already ruled out presses
 * meant for a text field, an open dialog or the study screen's own keys.
 */
export function appShortcutFor(press: ShortcutKeyPress, isMac: boolean): AppShortcut | null {
    if (press.repeat) return null;
    const command = isMac ? press.metaKey && !press.ctrlKey : press.ctrlKey && !press.metaKey;
    if (command && !press.altKey && press.key === ',') return { kind: 'route', route: '/settings' };
    if (press.ctrlKey || press.metaKey || press.altKey) return null;
    if (press.key === '?') return { kind: 'help' };
    if (press.key === '/') return { kind: 'search' };
    // Shift turns the letter into a capital; a capital is a different request (or a typo).
    if (press.shiftKey) return null;
    const route = LETTER_ROUTES[press.key.toLocaleLowerCase('en-US')];
    return route ? { kind: 'route', route } : null;
}

/** Whether a shortcut that opens `route` has nothing to do because that screen is showing. */
export function isShowingRoute(pathname: string, route: string): boolean {
    if (route === '/decks') return pathname === '/decks';
    return pathname === route || pathname.startsWith(`${route}/`);
}

/** Keys that move focus around the page: after one, the focused control shows its ring. */
export function isFocusNavigationKey(key: string): boolean {
    return key === 'Tab'
        || key === 'ArrowUp'
        || key === 'ArrowDown'
        || key === 'ArrowLeft'
        || key === 'ArrowRight'
        || key === 'Home'
        || key === 'End'
        || key === 'Escape';
}

/** How close a Tab or press in the page must come before focus enters or leaves a field frame. */
export const FRAME_HANDOFF_MS = 300;

/**
 * What the focus ring does as focus moves into or out of a same-origin frame (a card field's
 * editor), whose own keys and presses the page never sees. Entering one shortly after a Tab in
 * the page keeps the ring; otherwise a press inside the frame (or the screen's own call) put
 * focus there and the ring goes. Leaving one with no press in the page just before was Tab
 * inside the frame, so the ring shows.
 */
export function frameFocusRing(move: 'enter' | 'leave', now: number, tabbedAt: number, pressedAt: number): 'show' | 'hide' | 'keep' {
    if (move === 'enter') return now - tabbedAt > FRAME_HANDOFF_MS ? 'hide' : 'keep';
    return now - pressedAt > FRAME_HANDOFF_MS ? 'show' : 'keep';
}

/**
 * Whether an element of `width` × `height` inside a modal layer of `layerWidth` × `layerHeight`
 * is the layer's dimmed backdrop rather than a control: a pressable that covers the whole layer.
 * It closes the surface on a click, but Escape already does that from the keyboard.
 */
export function coversLayer(width: number, height: number, layerWidth: number, layerHeight: number): boolean {
    if (layerWidth <= 0 || layerHeight <= 0) return false;
    return width >= layerWidth * 0.95 && height >= layerHeight * 0.95;
}
