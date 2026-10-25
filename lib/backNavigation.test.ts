import { describe, expect, it } from 'vitest';
import { goBackOr, openOrReturnTo, type BackNavigator } from './backNavigation';

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
