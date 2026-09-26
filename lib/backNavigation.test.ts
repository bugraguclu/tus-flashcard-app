import { describe, expect, it } from 'vitest';
import { goBackOr, type BackNavigator } from './backNavigation';

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
