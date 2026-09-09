export type EmbeddedWebViewScrollMode = 'intrinsic' | 'contained';

export interface EmbeddedWebViewLayout {
    frameHeight: number;
    scrollEnabled: boolean;
    scrollOwner: 'parent' | 'webview';
}

interface EmbeddedWebViewLayoutOptions {
    scrollMode: EmbeddedWebViewScrollMode;
    minHeight: number;
    measuredHeight: number | null;
    initialHeight: number;
    containedHeight?: number;
}

/**
 * Resolve scroll ownership without consulting the asynchronously measured document height.
 * Intrinsic documents grow inside their parent scroller; contained documents keep a fixed
 * viewport and own scrolling from their first frame.
 */
export function embeddedWebViewLayout({
    scrollMode,
    minHeight,
    measuredHeight,
    initialHeight,
    containedHeight,
}: EmbeddedWebViewLayoutOptions): EmbeddedWebViewLayout {
    const safeMinimum = Math.max(1, Math.round(minHeight));
    if (scrollMode === 'contained') {
        const requestedHeight = containedHeight && containedHeight > 0
            ? containedHeight
            : initialHeight;
        return {
            frameHeight: Math.max(safeMinimum, Math.round(requestedHeight)),
            scrollEnabled: true,
            scrollOwner: 'webview',
        };
    }

    const intrinsicHeight = measuredHeight && measuredHeight > 0
        ? measuredHeight
        : initialHeight;
    return {
        frameHeight: Math.max(safeMinimum, Math.round(intrinsicHeight)),
        scrollEnabled: false,
        scrollOwner: 'parent',
    };
}

/**
 * Normalize noisy ResizeObserver/WKWebView measurements. A one-pixel difference is layout
 * rounding, not a meaningful intrinsic-size change, so retaining the prior value avoids a
 * redundant React render and a possible measure-message loop.
 */
export function stableMeasuredHeight(
    currentHeight: number | null,
    reportedHeight: number,
    minHeight: number,
): number | null {
    if (!Number.isFinite(reportedHeight) || reportedHeight <= 0) return currentHeight;
    const nextHeight = Math.max(Math.round(minHeight), Math.round(reportedHeight));
    if (currentHeight !== null && Math.abs(currentHeight - nextHeight) <= 1) return currentHeight;
    return nextHeight;
}
