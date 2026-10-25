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

/** The part of a navigation object that tells which screens lie beneath the current one. */
export interface StackStateReader {
    getState: () => { index: number; routes: { name: string }[] } | undefined;
}

/**
 * Open the screen `routeName` at `href`, or go back to it when it is the screen right beneath
 * this one. The Kronometre and the study calendar link to each other; without this, every round
 * trip would push another copy of both onto the stack.
 */
export function openOrReturnTo(
    router: Pick<BackNavigator, 'back'> & { push: (href: any) => void },
    navigation: StackStateReader,
    routeName: string,
    href: string,
): void {
    const state = navigation.getState();
    if (state && state.index > 0 && state.routes[state.index - 1]?.name === routeName) {
        router.back();
        return;
    }
    router.push(href);
}
