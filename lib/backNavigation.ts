/** The part of Expo Router's router a screen needs in order to leave. */
export interface BackNavigator {
    canGoBack: () => boolean;
    back: () => void;
    replace: (href: any) => void;
}

/**
 * Leave the current screen. A screen reached by reloading the page or opening a link on web has
 * nothing beneath it, and `router.back()` would then do nothing and strand the learner there, so
 * it opens `fallback` instead.
 */
export function goBackOr(router: BackNavigator, fallback: string = '/decks'): void {
    if (router.canGoBack()) {
        router.back();
        return;
    }
    router.replace(fallback);
}
