/**
 * Web only: keeps the control that keyboard focus reaches, with its ring, in sight.
 *
 * A browser scrolls a focused control just inside its scroll view's edge, so the ring drawn
 * outside it is cut by the window, and a panel floating over the list (the Kronometre's study tools
 * button, the deck list's Add button) may cover the control altogether. After Tab moves focus, the
 * scroll view moves on until the control sits `FOCUS_REVEAL_MARGIN` clear of its edges and of
 * anything floating over its lower part.
 */

/** Room between a focused control and the edge or panel it is kept clear of. */
export const FOCUS_REVEAL_MARGIN = 12;

interface Span {
    top: number;
    bottom: number;
}

/**
 * How far to scroll (positive: down) so `control` sits inside `visible` with `margin` to spare.
 * A control taller than the room left lines up its top.
 */
export function revealScrollDelta(control: Span, visible: Span, margin = FOCUS_REVEAL_MARGIN): number {
    const top = visible.top + margin;
    const bottom = visible.bottom - margin;
    if (control.top < top) return control.top - top;
    if (control.bottom > bottom) return Math.min(control.bottom - bottom, control.top - top);
    return 0;
}

function isScrollView(element: Element): boolean {
    const overflow = getComputedStyle(element).overflowY;
    return (overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight + 1;
}

/**
 * The top of whatever floats over `control` (sampled along its bottom edge), or `null`: the
 * outermost element under the point that is not an ancestor of the control. Something that starts
 * above `above` (a full-screen layer) does not count.
 */
function coveringTop(control: HTMLElement, rect: DOMRect, doc: Document, above: number): number | null {
    let top: number | null = null;
    const y = rect.bottom - 2;
    for (const x of [rect.left + 2, rect.left + rect.width / 2, rect.right - 2]) {
        let hit = doc.elementFromPoint(x, y);
        if (!hit || control.contains(hit) || hit.contains(control)) continue;
        while (hit.parentElement && !hit.parentElement.contains(control)) hit = hit.parentElement;
        const coverTop = hit.getBoundingClientRect().top;
        if (coverTop > above) top = top === null ? coverTop : Math.min(top, coverTop);
    }
    return top;
}

/** Scrolls `control`'s scroll view so the control and its ring are in sight. */
export function revealFocusedControl(control: HTMLElement): void {
    const doc = control.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    let scroller: HTMLElement | null = control.parentElement;
    while (scroller && scroller !== doc.body && !isScrollView(scroller)) scroller = scroller.parentElement;
    if (!scroller || scroller === doc.body) return;
    const rect = control.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    const visible = { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, view.innerHeight) };
    const cover = coveringTop(control, rect, doc, visible.top);
    if (cover !== null) visible.bottom = Math.min(visible.bottom, cover);
    const delta = revealScrollDelta(rect, visible);
    if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
}
