/**
 * Registers `public/sw.js`, which lets the installed web app start without a network — the iPhone
 * app works offline because it is installed; a web page needs its files cached to do the same.
 *
 * Production builds only: under the development server the worker would cache Metro's bundles
 * and serve stale code after every edit.
 */
export function registerWebServiceWorker(): void {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[ServiceWorker] registration failed:', error);
    });
}
