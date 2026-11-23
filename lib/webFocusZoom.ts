/**
 * Web only: keeps iPhone and iPad Safari from zooming in when a text field takes focus.
 *
 * Safari on iOS zooms the page onto any field whose text is smaller than 16 px, and leaves it
 * zoomed after the keyboard goes away, so the screen no longer fits and has to be pinched back.
 * The app's fields use 14-point text, as on iPhone. A viewport with `maximum-scale=1` stops that
 * zoom; iOS Safari still lets the learner pinch-zoom the page (it ignores the limit for a pinch,
 * since iOS 10). Other browsers would honour the limit against a pinch and do not zoom on focus,
 * so the viewport is only changed on iOS.
 */

/** Whether `nav` is a browser on iPhone or iPad (iPadOS reports itself as a Mac with touch). */
export function isIosBrowser(nav: { userAgent?: string; platform?: string; maxTouchPoints?: number }): boolean {
    const agent = nav.userAgent ?? '';
    if (/iPhone|iPad|iPod/.test(agent) || /iPhone|iPad|iPod/.test(nav.platform ?? '')) return true;
    return /Macintosh/.test(agent) && (nav.maxTouchPoints ?? 0) > 1;
}

/** `content` of a viewport meta tag with any `maximum-scale` replaced by `maximum-scale=1`. */
export function withoutFocusZoom(content: string): string {
    const parts = content
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && !/^maximum-scale\s*=/i.test(part));
    return [...parts, 'maximum-scale=1'].join(', ');
}

/** On iOS, sets the page's viewport so a focused field does not zoom it. */
export function preventIosFocusZoom(doc: Document, nav: Navigator): void {
    if (!isIosBrowser(nav)) return;
    const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const next = withoutFocusZoom(meta.content);
    if (meta.content !== next) meta.content = next;
}
