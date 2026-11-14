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

/** The part of Expo Router's router that closes screens back down to one beneath them. */
export interface DeckListReturner {
    canDismiss: () => boolean;
    dismissAll: () => void;
    dismissTo: (href: any) => void;
}

/**
 * Show the deck list the app already has, closing everything above it: a study reminder, the
 * "Sayfa bulunamadı" page and an automation request that opens nothing all end there.
 *
 * `router.replace('/decks')` stacked a copy instead. Over the reviewer it swapped the reviewer for
 * a second deck list, which a back swipe then revealed; over a screen outside the tabs (Browser,
 * Statistics, a deck overview) it put a whole second tab layout on the stack. A lone
 * `dismissTo('/decks')` from such a screen still pushes a deck list when the reviewer is under it,
 * so the screens above the tabs are closed first and the tabs then pop back to their deck list.
 * A screen with nothing beneath it, such as a reloaded web address, is swapped for the deck list,
 * so neither Back nor a back swipe returns to it.
 */
export function returnToDeckList(router: DeckListReturner): void {
    if (router.canDismiss()) router.dismissAll();
    router.dismissTo('/decks');
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

/**
 * Open `href` on the screen `routeName`: when that screen is already somewhere beneath this one,
 * close the screens above it and hand it `href`'s params; otherwise push it. Statistics opens a
 * day in the study calendar this way, which the learner may have come from.
 */
export function openOrDismissTo(
    router: { push: (href: any) => void; dismissTo: (href: any) => void },
    navigation: StackStateReader,
    routeName: string,
    href: string,
): void {
    const state = navigation.getState();
    const beneath = state?.routes.slice(0, state.index).some((route) => route.name === routeName) ?? false;
    if (beneath) {
        router.dismissTo(href);
        return;
    }
    router.push(href);
}
