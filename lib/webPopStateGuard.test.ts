import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadGuardInBrowser() {
    vi.resetModules();
    const page = new EventTarget();
    vi.stubGlobal('window', page);
    // The module reads the platform once, as it loads, from the fresh copy of react-native.
    const { Platform } = await import('react-native');
    Platform.OS = 'web';
    const module = await import('./webPopStateGuard');
    // What Expo Router does once it mounts: follow every `popstate` with a listener of its own.
    const routerFollowed = vi.fn();
    page.addEventListener('popstate', routerFollowed);
    return { page, routerFollowed, addPopStateGuard: module.addPopStateGuard };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('web popstate guard', () => {
    it('lets the router follow a browser Back that no guard takes', async () => {
        const { page, routerFollowed, addPopStateGuard } = await loadGuardInBrowser();
        addPopStateGuard(() => false);

        page.dispatchEvent(new Event('popstate'));

        expect(routerFollowed).toHaveBeenCalledTimes(1);
    });

    it('keeps the router from following a browser Back a guard has taken', async () => {
        const { page, routerFollowed, addPopStateGuard } = await loadGuardInBrowser();
        const guard = vi.fn(() => true);
        addPopStateGuard(guard);

        page.dispatchEvent(new Event('popstate'));

        expect(guard).toHaveBeenCalledTimes(1);
        expect(routerFollowed).not.toHaveBeenCalled();
    });

    it('stops consulting a guard once it is removed', async () => {
        const { page, routerFollowed, addPopStateGuard } = await loadGuardInBrowser();
        const guard = vi.fn(() => true);
        const remove = addPopStateGuard(guard);
        remove();

        page.dispatchEvent(new Event('popstate'));

        expect(guard).not.toHaveBeenCalled();
        expect(routerFollowed).toHaveBeenCalledTimes(1);
    });
});
