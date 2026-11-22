/**
 * Hover feedback for a mouse on the web build. iPhone has no pointer, so nothing here runs there.
 *
 * React Native Web draws no hover state, so a desktop user moving the mouse over the deck list,
 * a menu or a button saw nothing change until they clicked. The pointer now tints the innermost
 * control under it with the theme's `hoverOverlay`, laid over the control's own background as a
 * background image: its colour, corners, border and shadow stay as they are, and nothing new
 * stacks or clips. Backdrops behind dialogs and menus are pressable too, but they cover most of
 * the window, so anything that large is left untinted.
 *
 * Under the same mouse, lists show a thin scroll bar again. React Native Web hides it for every
 * scroll view drawn without an indicator, which suits a phone, where the bar shows while the
 * finger moves; a mouse user otherwise cannot see how long a list is or drag its bar.
 */

/** What counts as a control the pointer can tint. */
export const HOVER_TARGET_SELECTOR = [
    'button',
    'a[href]',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
].join(',');

/** The attribute the tinted control carries while the pointer is over it. */
export const HOVER_ATTRIBUTE = 'data-tus-hover';

/**
 * Marks the visible shape of a button that takes presses over a larger area (the dock's raised ＋
 * with its caption, a speed dial action with its name): the tint, and the keyboard focus ring
 * (hooks/useWebKeyboardNavigation.ts), go on that shape instead of the button's whole box.
 */
export const FACE_ATTRIBUTE = 'data-focus-face';

/** A control covering more than this share of the window is a backdrop, not something to tint. */
const MAX_HOVER_AREA_SHARE = 0.4;

export function isHoverableSize(
    rect: { width: number; height: number },
    viewport: { width: number; height: number },
): boolean {
    const area = rect.width * rect.height;
    const viewportArea = viewport.width * viewport.height;
    return area > 0 && viewportArea > 0 && area <= viewportArea * MAX_HOVER_AREA_SHARE;
}

export function isDisabledControl(element: Element): boolean {
    return element.getAttribute('aria-disabled') === 'true'
        || (element as HTMLButtonElement).disabled === true;
}

/** React Native Web's class for a scroll view without an indicator (`scrollbar-width: none`). */
const HIDDEN_SCROLLBAR_SELECTOR = '[class*="r-scrollbarWidth-"]';

export function hoverStyleSheet(overlay: string, scrollbarThumb?: string): string {
    const scrollbars = scrollbarThumb
        ? `\n  ${HIDDEN_SCROLLBAR_SELECTOR} { scrollbar-width: thin !important; scrollbar-color: ${scrollbarThumb} transparent !important; }`
        : '';
    return `@media (hover: hover) and (pointer: fine) {
  [${HOVER_ATTRIBUTE}]:not(:has([${FACE_ATTRIBUTE}])), [${HOVER_ATTRIBUTE}] [${FACE_ATTRIBUTE}] { background-image: linear-gradient(${overlay}, ${overlay}); }${scrollbars}
}`;
}

/**
 * Starts tinting controls under the mouse in `doc`, with `overlay` as the tint (and thin scroll
 * bars in `scrollbarThumb`), and returns the function that stops it. Calling it again with new
 * colours (a theme change) replaces the old.
 */
export function installWebHover(doc: Document, overlay: string, scrollbarThumb?: string): () => void {
    const style = doc.createElement('style');
    style.setAttribute('data-tus-hover-style', '');
    style.textContent = hoverStyleSheet(overlay, scrollbarThumb);
    doc.head.appendChild(style);

    let current: Element | null = null;
    const clear = () => {
        current?.removeAttribute(HOVER_ATTRIBUTE);
        current = null;
    };
    const onPointerOver = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        const origin = event.target as Element | null;
        const target = typeof origin?.closest === 'function' ? origin.closest(HOVER_TARGET_SELECTOR) : null;
        const view = doc.defaultView;
        const next = target
            && !isDisabledControl(target)
            && view
            && isHoverableSize(target.getBoundingClientRect(), { width: view.innerWidth, height: view.innerHeight })
            ? target
            : null;
        if (next === current) return;
        clear();
        if (next) {
            next.setAttribute(HOVER_ATTRIBUTE, '');
            current = next;
        }
    };
    // A click usually opens or changes something; the tint should not linger on what moved away.
    const onPointerDown = () => clear();
    doc.addEventListener('pointerover', onPointerOver);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.documentElement.addEventListener('pointerleave', clear);

    return () => {
        doc.removeEventListener('pointerover', onPointerOver);
        doc.removeEventListener('pointerdown', onPointerDown, true);
        doc.documentElement.removeEventListener('pointerleave', clear);
        clear();
        style.remove();
    };
}
