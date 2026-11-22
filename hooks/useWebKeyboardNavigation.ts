import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
    appShortcutFor,
    axisForRole,
    coversLayer,
    isFocusNavigationKey,
    stepIndex,
    type AppShortcut,
} from '../lib/webKeyboardNavigation';

/**
 * What a keyboard and mouse bring to the web build, which the iPhone gets from its own system:
 *
 * - A visible focus ring, drawn only while the keyboard moves focus: a click leaves none behind.
 * - Dialogs, sheets and menus take focus when they open (a menu on its first item, a form on its
 *   first field) and keep Tab inside themselves, skipping the dimmed backdrop, which Escape
 *   replaces. react-native-web's Modal already closes on Escape and returns focus to the opener.
 * - Arrow keys, Home and End move through a menu's items and a row of tabs (a segmented
 *   control); a tab is chosen as focus reaches it, as a segmented control is chosen by a tap.
 * - App-wide shortcuts (see `appShortcutFor`), handed to `onShortcut`; without one (the welcome
 *   sign-in, which stands in for the navigator) the letters stay plain keys.
 *
 * Mounted once, on web only: by `WebAppIntegrations`, or by `AccountFirstRunGate` while the
 * welcome sign-in replaces the navigator.
 */
export function useWebKeyboardNavigation({ ringColor, haloColor, onShortcut }: {
    ringColor: string;
    /** The band between the ring and the control: the card colour. */
    haloColor: string;
    onShortcut?: (shortcut: AppShortcut) => void;
}): void {
    const onShortcutRef = useRef(onShortcut);
    onShortcutRef.current = onShortcut;

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        document.documentElement.style.setProperty('--tus-focus-ring', ringColor);
        document.documentElement.style.setProperty('--tus-focus-halo', haloColor);
    }, [ringColor, haloColor]);

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
        const root = document.documentElement;
        const style = document.createElement('style');
        style.textContent = FOCUS_RING_CSS;
        document.head.appendChild(style);

        const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
        const showRing = () => { root.dataset.focusRing = 'on'; };
        const hideRing = () => { delete root.dataset.focusRing; };

        const onKeyDown = (event: KeyboardEvent) => {
            if (isFocusNavigationKey(event.key)) showRing();
            if (event.defaultPrevented) return;
            const modal = topModal();
            if (event.key === 'Tab' && modal && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (cycleTab(modal, event.shiftKey)) event.preventDefault();
                return;
            }
            if (moveWithinGroup(event.key, modal)) {
                event.preventDefault();
                return;
            }
            if (event.key === ' ' && pressWithSpace(event.target)) {
                event.preventDefault();
                return;
            }
            if (event.key === 'Enter' && pressTextLink(event.target)) {
                event.preventDefault();
                return;
            }
            const runShortcut = onShortcutRef.current;
            if (!runShortcut || modal || isEditable(event.target)) return;
            const shortcut = appShortcutFor(event, isMac);
            if (!shortcut) return;
            event.preventDefault();
            runShortcut(shortcut);
        };

        // A dialog, sheet or menu renders into a portal under <body>, which react-native-web keeps
        // and reuses; a new one takes focus once its content has been drawn. The DOM changes all
        // the time, so the check runs at most once per batch and only reads the top modal.
        let focusedModal: HTMLElement | null = null;
        let timer: ReturnType<typeof setTimeout> | 0 = 0;
        // The control that had focus when the first of a run of modals opened: where focus returns
        // once the last of them closes, when the element that opened that one (a menu item) has
        // gone with its menu. Only focus outside any modal counts; react-native-web's focus trap
        // parks focus on markers beside an open modal, which leave with it.
        let lastOutside: HTMLElement | null = null;
        let opener: HTMLElement | null = null;
        const onFocusIn = (event: FocusEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement) markClippedRing(target);
            if (target instanceof HTMLElement && !topModal() && !target.closest('[aria-modal="true"]')) lastOutside = target;
        };
        // Runs once the batch of DOM changes has settled and react-native-web's own focus trap has
        // run its effect; a timer rather than an animation frame, which a background tab holds back.
        const focusNewModal = () => {
            if (timer) return;
            timer = setTimeout(() => {
                timer = 0;
                const modal = topModal();
                if (modal === focusedModal) return;
                if (!focusedModal) opener = lastOutside;
                focusedModal = modal;
                if (modal) {
                    nameModal(modal);
                    focusInitial(modal);
                    return;
                }
                const active = document.activeElement;
                if ((!active || active === document.body) && opener?.isConnected) opener.focus();
                opener = null;
            }, MODAL_SETTLE_MS);
        };
        const observer = new MutationObserver(focusNewModal);
        observer.observe(document.body, { childList: true, subtree: true });
        // A dialog that fades in is hidden until its animation starts and changes no DOM after.
        window.addEventListener('animationstart', focusNewModal, true);
        window.addEventListener('animationend', focusNewModal, true);

        // The page's own handlers run first, so a screen that uses a key itself (the study
        // screen's answer keys, a text field's arrows) keeps it.
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointerdown', hideRing, true);
        window.addEventListener('focusin', onFocusIn, true);
        return () => {
            window.removeEventListener('focusin', onFocusIn, true);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerdown', hideRing, true);
            observer.disconnect();
            window.removeEventListener('animationstart', focusNewModal, true);
            window.removeEventListener('animationend', focusNewModal, true);
            if (timer) clearTimeout(timer);
            style.remove();
            hideRing();
        };
    }, []);
}

// Drawn outside the control so a filled button keeps its own colour, with a band of the card colour
// between ring and control so it shows on the accent-coloured headers too. A field drawn as a row
// (`fieldRowProps`, lib/fieldRowFocus.ts) wears the ring on the row rather than on its input. A list
// row whose main control is only part of it (`data-hover-row`, lib/webHover.ts) wears the ring on
// the whole row, just inside its edge, instead of a box around the name alone.
// A button whose visible shape is smaller than what it takes presses for (the dock's raised ＋ with
// its caption under it) wears the ring on that shape, marked `data-focus-face`.
const FOCUS_RING_CSS = `
html:not([data-focus-ring]) :focus { outline: none !important; }
html[data-focus-ring] :focus {
    outline: 2px solid var(--tus-focus-ring) !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 2px var(--tus-focus-halo) !important;
}
html[data-focus-ring] input:focus, html[data-focus-ring] textarea:focus { outline-offset: 0 !important; box-shadow: none !important; }
html[data-focus-ring] [data-focus-inset]:focus {
    outline-offset: -2px !important;
    box-shadow: inset 0 0 0 4px var(--tus-focus-halo) !important;
}
html[data-focus-ring] :is(button, [role="button"]):focus:has([data-focus-face]) { outline: none !important; box-shadow: none !important; }
html[data-focus-ring] :is(button, [role="button"]):focus [data-focus-face] {
    outline: 2px solid var(--tus-focus-ring) !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 2px var(--tus-focus-halo) !important;
}
html[data-focus-ring] [data-field-row] input:focus, html[data-focus-ring] [data-field-row] textarea:focus {
    outline: none !important;
    box-shadow: none !important;
}
html[data-focus-ring] [data-field-row]:has(input:focus, textarea:focus) {
    outline: 2px solid var(--tus-focus-ring) !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 2px var(--tus-focus-halo) !important;
}
html[data-focus-ring] [data-row-primary]:focus { outline: none !important; box-shadow: none !important; }
html[data-focus-ring] [data-hover-row]:has([data-row-primary]:focus) {
    outline: 2px solid var(--tus-focus-ring) !important;
    outline-offset: -2px !important;
}
`;

/**
 * A row that spans its card would lose the sides of a ring drawn outside it to the card's rounded
 * clip; such an element gets its ring drawn just inside its edge instead.
 */
function markClippedRing(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    let clip: HTMLElement | null = element.parentElement;
    while (clip && clip !== document.body) {
        const style = getComputedStyle(clip);
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') break;
        clip = clip.parentElement;
    }
    const bounds = clip && clip !== document.body
        ? clip.getBoundingClientRect()
        : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const room = 3;
    const clipped = rect.left - bounds.left < room
        || bounds.right - rect.right < room
        || rect.top - bounds.top < room
        || bounds.bottom - rect.bottom < room;
    if (clipped) element.dataset.focusInset = '';
    else delete element.dataset.focusInset;
}

/** How long after the last DOM change a newly opened modal takes focus. */
const MODAL_SETTLE_MS = 32;

const FOCUSABLE = 'a[href], button, input, select, textarea, iframe, [tabindex], [contenteditable="true"]';
const MENU_ITEM_ROLES = new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio', 'radio', 'checkbox']);

function topModal(): HTMLElement | null {
    const modals = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    for (let index = modals.length - 1; index >= 0; index -= 1) {
        if (isShown(modals[index])) return modals[index];
    }
    return null;
}

function isShown(element: HTMLElement): boolean {
    if (element.getClientRects().length === 0) return false;
    return getComputedStyle(element).visibility !== 'hidden';
}

function isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isDisabled(element: HTMLElement): boolean {
    return (element as HTMLButtonElement).disabled === true || element.getAttribute('aria-disabled') === 'true';
}

/**
 * Makes a scrolling region of a modal that holds no control of its own (a list to read) a Tab
 * stop, so the arrow keys and Page Down can scroll it.
 */
function makeScrollRegionsFocusable(container: HTMLElement): void {
    container.querySelectorAll<HTMLElement>('div').forEach((element) => {
        if (element.hasAttribute('tabindex') || element.scrollHeight <= element.clientHeight + 1) return;
        const overflow = getComputedStyle(element).overflowY;
        if (overflow !== 'auto' && overflow !== 'scroll') return;
        if (element.querySelector(FOCUSABLE)) return;
        element.tabIndex = 0;
    });
}

/** The controls Tab visits inside `container`, in order, without the dimmed backdrop. */
function tabbables(container: HTMLElement): HTMLElement[] {
    makeScrollRegionsFocusable(container);
    const box = container.getBoundingClientRect();
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
        if (element.tabIndex < 0 || isDisabled(element) || !isShown(element)) return false;
        if (element.closest('[aria-hidden="true"]')) return false;
        // A pressable used as a wrapper (a card that swallows taps for its backdrop) has no role
        // and holds the real controls; Tab goes to those.
        if (element.tagName === 'DIV' && !element.getAttribute('role') && element.querySelector(FOCUSABLE)) return false;
        const rect = element.getBoundingClientRect();
        if (coversLayer(rect.width, rect.height, box.width, box.height) && !element.querySelector(FOCUSABLE)) {
            // The backdrop: Escape closes the surface, so Tab never needs to stop on it.
            element.tabIndex = -1;
            return false;
        }
        return true;
    });
}

function cycleTab(modal: HTMLElement, backwards: boolean): boolean {
    const items = tabbables(modal);
    if (items.length === 0) return false;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next = backwards
        ? (current <= 0 ? last : current - 1)
        : (current < 0 || current === last ? 0 : current + 1);
    items[next].focus();
    return true;
}

/**
 * The items of the menu in `container`: its menu items, and the ticked options (`MenuItem` with
 * `checked` is a radio or checkbox) when it is a menu at all. A form's checkboxes are no menu.
 */
function menuItems(container: HTMLElement): HTMLElement[] {
    const all = Array.from(container.querySelectorAll<HTMLElement>('[role]')).filter((element) => (
        MENU_ITEM_ROLES.has(element.getAttribute('role') ?? '') && !isDisabled(element) && isShown(element)
    ));
    const isMenu = container.getAttribute('role') === 'menu' || all.some((element) => element.getAttribute('role')?.startsWith('menuitem'));
    return isMenu ? all : [];
}

/** Moves focus through a menu or a row of tabs with the arrow keys; whether the key was used. */
function moveWithinGroup(key: string, modal: HTMLElement | null): boolean {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isEditable(active)) return false;
    const role = active?.getAttribute('role') ?? null;

    if (role === 'tab' && active) {
        const list = active.closest<HTMLElement>('[role="tablist"]');
        if (!list) return false;
        const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).filter((tab) => !isDisabled(tab));
        const next = stepIndex(tabs.indexOf(active), tabs.length, key, 'horizontal');
        if (next === null) return false;
        tabs[next].focus();
        if (tabs[next].getAttribute('aria-selected') !== 'true') tabs[next].click();
        return true;
    }

    // A menu: its items move with Up and Down. From outside the items (the backdrop, or nothing
    // focused yet) the first arrow enters the menu; from another control it stays put.
    const menu = active?.closest<HTMLElement>('[role="menu"]') ?? modal?.querySelector<HTMLElement>('[role="menu"]') ?? modal;
    if (!menu || axisForRole(role) === 'horizontal') return false;
    if (modal) tabbables(modal); // Takes the backdrop out of the Tab order, so it counts as outside.
    const items = menuItems(menu);
    const current = active ? items.indexOf(active) : -1;
    if (current < 0 && active && active !== document.body && active.tabIndex >= 0 && modal?.contains(active)) return false;
    const next = stepIndex(current, items.length, key, 'vertical');
    if (next === null) return false;
    items[next].focus();
    return true;
}

/**
 * Space ticks a checkbox or switch and chooses a radio, tab or menu item, as it does in any web
 * form. react-native-web presses only buttons with Space (Enter works for every role), so the
 * other roles get a click, which their Pressable handles as a press.
 */
function pressWithSpace(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement) || target.tagName === 'BUTTON' || isEditable(target) || isDisabled(target)) return false;
    if (!SPACE_PRESS_ROLES.has(target.getAttribute('role') ?? '')) return false;
    target.click();
    return true;
}

/**
 * Follows a link drawn as text inside a sentence (`<Text onPress accessibilityRole="link">`), as
 * Enter follows any link. react-native-web renders it as a focusable `<span>` that only answers a
 * click; a pressable link is an `<a>` or `<button>` and already takes Enter.
 */
function pressTextLink(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement) || target.tagName !== 'SPAN' || target.getAttribute('role') !== 'link') return false;
    if (isDisabled(target)) return false;
    target.click();
    return true;
}

const SPACE_PRESS_ROLES = new Set(['checkbox', 'switch', 'radio', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option']);

/**
 * Gives a dialog, sheet or menu the name a screen reader announces as focus enters it: its title
 * (the first heading), or the label of the menu inside it. react-native-web's Modal has none.
 */
function nameModal(modal: HTMLElement): void {
    if (modal.hasAttribute('aria-label') || modal.hasAttribute('aria-labelledby')) return;
    const heading = modal.querySelector<HTMLElement>('[role="heading"], h1, h2, h3');
    const name = heading?.innerText.trim() || modal.querySelector('[role="menu"][aria-label]')?.getAttribute('aria-label');
    if (name) modal.setAttribute('aria-label', name);
}

/** Puts focus inside a dialog, sheet or menu that has just opened. */
function focusInitial(modal: HTMLElement): void {
    // react-native-web's focus trap has already focused the first element, which is usually the
    // backdrop; a field that focused itself (autoFocus) keeps focus.
    const items = tabbables(modal);
    if (items.includes(document.activeElement as HTMLElement)) return;
    const menu = modal.querySelector<HTMLElement>('[role="menu"]') ?? modal;
    const firstItem = menuItems(menu)[0];
    if (firstItem) {
        firstItem.focus();
        return;
    }
    const field = items.find((element) => element.tagName === 'INPUT' || element.tagName === 'TEXTAREA');
    const target = field ?? items[0];
    if (target) {
        target.focus();
        return;
    }
    // Nothing to operate: the dialog itself takes focus, so Escape and screen readers reach it.
    if (modal.tabIndex < 0) modal.tabIndex = -1;
    modal.focus();
}
