import { describe, expect, it } from 'vitest';
import {
    goBackOr,
    openOrDismissTo,
    openOrReturnTo,
    returnToDeckList,
    type BackNavigator,
} from './backNavigation';

function fakeRouter(canGoBack: boolean) {
    const calls: string[] = [];
    const router: BackNavigator = {
        canGoBack: () => canGoBack,
        back: () => { calls.push('back'); },
        replace: (href: string) => { calls.push(`replace:${href}`); },
    };
    return { router, calls };
}

describe('goBackOr', () => {
    it('goes back when a screen lies beneath this one', () => {
        const { router, calls } = fakeRouter(true);
        goBackOr(router);
        expect(calls).toEqual(['back']);
    });

    it('opens the deck list when the screen was opened directly', () => {
        const { router, calls } = fakeRouter(false);
        goBackOr(router);
        expect(calls).toEqual(['replace:/decks']);
    });

    it('opens the given screen instead when one is named', () => {
        const { router, calls } = fakeRouter(false);
        goBackOr(router, '/note-types');
        expect(calls).toEqual(['replace:/note-types']);
    });
});

describe('openOrReturnTo', () => {
    function fakeNavigation(names: string[]) {
        return { getState: () => ({ index: names.length - 1, routes: names.map((name) => ({ name })) }) };
    }

    function pushRouter() {
        const calls: string[] = [];
        return { calls, router: { back: () => { calls.push('back'); }, push: (href: string) => { calls.push(`push:${href}`); } } };
    }

    it('goes back when the screen beneath is the one asked for', () => {
        const { router, calls } = pushRouter();
        openOrReturnTo(router, fakeNavigation(['stats', 'study-calendar', 'stopwatch']), 'study-calendar', '/study-calendar');
        expect(calls).toEqual(['back']);
    });

    it('opens the screen when it is not right beneath, even if it is further down', () => {
        const { router, calls } = pushRouter();
        openOrReturnTo(router, fakeNavigation(['study-calendar', 'stats', 'stopwatch']), 'study-calendar', '/study-calendar');
        expect(calls).toEqual(['push:/study-calendar']);
    });

    it('opens the screen when nothing lies beneath', () => {
        const { router, calls } = pushRouter();
        openOrReturnTo(router, fakeNavigation(['stopwatch']), 'study-calendar', '/study-calendar');
        expect(calls).toEqual(['push:/study-calendar']);
    });
});

describe('openOrDismissTo', () => {
    function fakeNavigation(names: string[]) {
        return { getState: () => ({ index: names.length - 1, routes: names.map((name) => ({ name })) }) };
    }

    function dismissRouter() {
        const calls: string[] = [];
        return {
            calls,
            router: {
                push: (href: string) => { calls.push(`push:${href}`); },
                dismissTo: (href: string) => { calls.push(`dismissTo:${href}`); },
            },
        };
    }

    it('closes back down to the screen when it lies anywhere beneath', () => {
        const { router, calls } = dismissRouter();
        openOrDismissTo(router, fakeNavigation(['decks', 'study-calendar', 'study-analysis', 'stats']), 'study-calendar', '/study-calendar?day=2026-10-27');
        expect(calls).toEqual(['dismissTo:/study-calendar?day=2026-10-27']);
    });

    it('opens the screen when it is not on the stack', () => {
        const { router, calls } = dismissRouter();
        openOrDismissTo(router, fakeNavigation(['decks', 'stats']), 'study-calendar', '/study-calendar?day=2026-10-27');
        expect(calls).toEqual(['push:/study-calendar?day=2026-10-27']);
    });

    it('does not count the current screen as one beneath it', () => {
        const { router, calls } = dismissRouter();
        openOrDismissTo(router, fakeNavigation(['decks', 'study-calendar']), 'study-calendar', '/study-calendar?day=2026-10-27');
        expect(calls).toEqual(['push:/study-calendar?day=2026-10-27']);
    });
});

describe('returnToDeckList', () => {
    interface FakeRoute { key: string; name: string; state?: FakeStack }
    interface FakeStack { routes: FakeRoute[] }

    let keys = 0;
    const route = (name: string, children?: string[]): FakeRoute => ({
        key: `${name}-${++keys}`,
        name,
        state: children ? { routes: children.map((child) => route(child)) } : undefined,
    });
    const top = (stack: FakeStack) => stack.routes[stack.routes.length - 1];
    /** The stacks from the root down to the screen on top. */
    const focusedStacks = (root: FakeStack): FakeStack[] => {
        const stacks = [root];
        for (let current = top(root); current.state; current = top(current.state)) stacks.push(current.state);
        return stacks;
    };
    const shape = (stack: FakeStack): unknown[] => stack.routes.map((entry) => (
        entry.state ? { [entry.name]: shape(entry.state) } : entry.name
    ));

    /**
     * Expo Router 57's handling of the href `/decks` (the `(tabs)` layout's `decks` screen), as
     * `getNavigateAction` and the stack routers in node_modules/expo-router/build do it: an action
     * goes to the first navigator on the focused path whose route differs from the href; POP_TO
     * returns to an existing route of that name (or swaps the top for a new one when there is
     * none) and hands a nested `screen` on as a NAVIGATE without `pop`, which pushes when another
     * screen is on top; `dismissAll` pops the deepest focused stack that can pop. (REPLACE, the
     * old way back, swapped the top route for a new deck list or tab layout.)
     */
    function expoRouter(root: FakeStack) {
        const navigateToDecks = (tabs: FakeRoute) => {
            if (tabs.state && top(tabs.state).name !== 'decks') tabs.state.routes.push(route('decks'));
        };
        return {
            canDismiss: () => focusedStacks(root).some((stack) => stack.routes.length > 1),
            dismissAll: () => {
                const stack = focusedStacks(root).reverse().find((candidate) => candidate.routes.length > 1);
                stack?.routes.splice(1);
            },
            dismissTo: (href: string) => {
                expect(href).toBe('/decks');
                const current = top(root);
                if (current.name !== '(tabs)') {
                    const index = root.routes.map((entry) => entry.name).lastIndexOf('(tabs)');
                    if (index === -1) {
                        root.routes.splice(root.routes.length - 1, 1, route('(tabs)', ['decks']));
                        return;
                    }
                    root.routes.splice(index + 1);
                    navigateToDecks(root.routes[index]);
                    return;
                }
                if (!current.state) return;
                const tabs = current.state;
                const index = tabs.routes.map((entry) => entry.name).lastIndexOf('decks');
                if (index === -1) tabs.routes.splice(tabs.routes.length - 1, 1, route('decks'));
                else tabs.routes.splice(index + 1);
            },
        };
    }

    /** The app's stack: the `(tabs)` layout holding `tabs`, with root screens above it. */
    function stackOf(tabs: string[], ...rootScreens: string[]) {
        const root: FakeStack = { routes: [route('(tabs)', tabs), ...rootScreens.map((name) => route(name))] };
        return { root, deckListKey: root.routes[0].state!.routes[0].key };
    }
    const deckListKeyOf = (root: FakeStack) => root.routes[0].state?.routes[0].key;

    it('pops the reviewer instead of putting a second deck list on top of it', () => {
        const { root, deckListKey } = stackOf(['decks', 'index']);
        returnToDeckList(expoRouter(root));
        expect(shape(root)).toEqual([{ '(tabs)': ['decks'] }]);
        expect(deckListKeyOf(root)).toBe(deckListKey);
    });

    it('closes a screen opened over the deck list instead of stacking another tab layout', () => {
        for (const screen of ['browser', 'stats', 'deck-overview', '+not-found', 'x-callback-url']) {
            const { root, deckListKey } = stackOf(['decks'], screen);
            returnToDeckList(expoRouter(root));
            expect(shape(root)).toEqual([{ '(tabs)': ['decks'] }]);
            expect(deckListKeyOf(root)).toBe(deckListKey);
        }
    });

    it('closes the screens above the tabs and the reviewer beneath them', () => {
        const { root, deckListKey } = stackOf(['decks', 'index'], 'browser', 'card-info');
        returnToDeckList(expoRouter(root));
        expect(shape(root)).toEqual([{ '(tabs)': ['decks'] }]);
        expect(deckListKeyOf(root)).toBe(deckListKey);
    });

    it('keeps the deck list that is already showing', () => {
        const { root, deckListKey } = stackOf(['decks']);
        returnToDeckList(expoRouter(root));
        expect(shape(root)).toEqual([{ '(tabs)': ['decks'] }]);
        expect(deckListKeyOf(root)).toBe(deckListKey);
    });

    it('swaps a screen opened directly for the deck list, leaving nothing beneath to go back to', () => {
        // A web reload of an unknown address, or the automation address opened on its own.
        const root: FakeStack = { routes: [route('+not-found')] };
        returnToDeckList(expoRouter(root));
        expect(shape(root)).toEqual([{ '(tabs)': ['decks'] }]);
    });
});
