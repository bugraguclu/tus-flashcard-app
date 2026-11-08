import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExternalActionRoute } from './externalActionRoute';
import type { ExternalAppAction } from './externalLinking';
import {
    IncomingUrlQueue,
    incomingUrlNavigation,
    type IncomingUrlSource,
} from './incomingUrl';

const FILE = 'file:///private/var/mobile/Containers/Data/Application/A/Documents/Inbox/Kardiyoloji.apkg';
const OTHER_FILE = 'file:///private/var/mobile/Containers/Data/Application/A/Documents/Inbox/notes.csv';
const ADD_NOTE = 'tusankim://x-callback-url/addnote?type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX';
const SEARCH = 'tusankim://x-callback-url/search?query=tag%3Amarked';

/** What iOS hands the app through React Native's Linking, driven by the test. */
function fakeLinking(launchUrl: string | null = null) {
    let resolveLaunch: (url: string | null) => void = () => undefined;
    let rejectLaunch: (error: unknown) => void = () => undefined;
    const launch = new Promise<string | null>((resolve, reject) => {
        resolveLaunch = resolve;
        rejectLaunch = reject;
    });
    const listeners: Array<(event: { url: string }) => void> = [];
    const source: IncomingUrlSource = {
        getInitialURL: vi.fn(() => launch),
        addEventListener: vi.fn((_type: 'url', listener: (event: { url: string }) => void) => {
            listeners.push(listener);
            return { remove: () => undefined };
        }),
    };
    return {
        source,
        /** The launch URL read finishes (on iOS this resolves within the first frames). */
        finishLaunchRead: async () => { resolveLaunch(launchUrl); await launch.catch(() => undefined); },
        failLaunchRead: async (error: unknown) => { rejectLaunch(error); await launch.catch(() => undefined); },
        open: (url: string) => listeners.forEach((listener) => listener({ url })),
    };
}

afterEach(() => vi.restoreAllMocks());

describe('incoming URL queue', () => {
    it('holds a launch file until the app has started, then opens it once', async () => {
        const linking = fakeLinking(FILE);
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        await linking.finishLaunchRead();

        const opened: string[] = [];
        queue.attach((url) => opened.push(url));
        expect(opened).toEqual([FILE]);
    });

    it('subscribes and reads the launch URL once, however often the shell mounts again', async () => {
        const linking = fakeLinking(ADD_NOTE);
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        queue.start(linking.source);
        await linking.finishLaunchRead();
        expect(linking.source.getInitialURL).toHaveBeenCalledOnce();
        expect(linking.source.addEventListener).toHaveBeenCalledOnce();

        const opened: string[] = [];
        const detach = queue.attach((url) => opened.push(url));
        // The crash screen's Retry or Return home mounts the shell again; iOS would still return
        // the launch URL from getInitialURL, but it has been opened already.
        detach();
        queue.attach((url) => opened.push(url));
        expect(opened).toEqual([ADD_NOTE]);
    });

    it('keeps a URL that arrives during startup or behind the crash screen for the next start', async () => {
        const linking = fakeLinking();
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        await linking.finishLaunchRead();

        linking.open(FILE); // startup still running, failed or timed out: nothing is attached
        const opened: string[] = [];
        const detach = queue.attach((url) => opened.push(url));
        expect(opened).toEqual([FILE]);

        detach(); // the crash screen is up
        linking.open(OTHER_FILE);
        expect(opened).toEqual([FILE]);
        queue.attach((url) => opened.push(url));
        expect(opened).toEqual([FILE, OTHER_FILE]);
    });

    it('opens a URL as it arrives while the app is running', async () => {
        const linking = fakeLinking();
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        await linking.finishLaunchRead();
        const opened: string[] = [];
        queue.attach((url) => opened.push(url));

        linking.open(SEARCH);
        expect(opened).toEqual([SEARCH]);
    });

    it('drops only the URL whose collection lookup throws, and never retries it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const linking = fakeLinking(ADD_NOTE);
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        await linking.finishLaunchRead();
        linking.open(FILE);

        const opened: string[] = [];
        const detach = queue.attach((url) => {
            if (url === ADD_NOTE) throw new Error('no such table: notetypes');
            opened.push(url);
        });
        expect(opened).toEqual([FILE]);
        expect(warn).toHaveBeenCalledWith('[Linking] incoming URL failed:', expect.any(Error));

        detach();
        queue.attach((url) => opened.push(url));
        expect(opened).toEqual([FILE]);
    });

    it('opens the launch URL once when it also arrives as an event', async () => {
        const linking = fakeLinking(FILE);
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        linking.open(FILE);
        await linking.finishLaunchRead();

        const opened: string[] = [];
        queue.attach((url) => opened.push(url));
        expect(opened).toEqual([FILE]);
    });

    it('opens the launch URL ahead of one that arrived while it was being read', async () => {
        const linking = fakeLinking(FILE);
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        linking.open(SEARCH);
        await linking.finishLaunchRead();

        const opened: string[] = [];
        queue.attach((url) => opened.push(url));
        expect(opened).toEqual([FILE, SEARCH]);
    });

    it('still opens later URLs when the launch URL cannot be read', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const linking = fakeLinking();
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        await linking.failLaunchRead(new Error('bridge gone'));
        expect(warn).toHaveBeenCalledWith('[Linking] initial URL failed:', expect.any(Error));

        const opened: string[] = [];
        queue.attach((url) => opened.push(url));
        linking.open(FILE);
        expect(opened).toEqual([FILE]);
    });
});

describe('incoming URL navigation', () => {
    const editorRoute: ExternalActionRoute = { pathname: '/editor', params: { deckId: '3', noteTypeId: '1' } };
    const browserRoute: ExternalActionRoute = { pathname: '/browser', params: { initialSearch: 'tag:marked' } };
    const routeFor = (action: ExternalAppAction) => (action.kind === 'search' ? browserRoute : editorRoute);

    it('opens a handed-over file in the import screen', () => {
        const routeForAction = vi.fn(routeFor);
        expect(incomingUrlNavigation(FILE, 'decks', routeForAction)).toEqual({
            method: 'push',
            href: { pathname: '/import', params: { incomingUri: FILE } },
        });
        expect(routeForAction).not.toHaveBeenCalled();
    });

    it('opens an automation request over the screen on top', () => {
        expect(incomingUrlNavigation(ADD_NOTE, 'index', routeFor)).toEqual({ method: 'push', href: editorRoute });
        expect(incomingUrlNavigation(SEARCH, 'decks', routeFor)).toEqual({ method: 'push', href: browserRoute });
        expect(incomingUrlNavigation(SEARCH, 'editor', routeFor)).toEqual({ method: 'push', href: browserRoute });
        expect(incomingUrlNavigation(ADD_NOTE, undefined, routeFor)).toEqual({ method: 'push', href: editorRoute });
    });

    it('replaces the screen a request opens when it is already on top', () => {
        expect(incomingUrlNavigation(ADD_NOTE, 'editor', routeFor)).toEqual({ method: 'replace', href: editorRoute });
        expect(incomingUrlNavigation(SEARCH, 'browser', routeFor)).toEqual({ method: 'replace', href: browserRoute });
    });

    it('ignores a request the collection cannot serve and a URL that is neither', () => {
        expect(incomingUrlNavigation(ADD_NOTE, 'decks', () => null)).toBeNull();
        expect(incomingUrlNavigation('tusankim:///stats', 'decks', routeFor)).toBeNull();
        expect(incomingUrlNavigation('file:///private/var/mobile/Inbox/photo.heic', 'decks', routeFor)).toBeNull();
    });

    it('leaves one editor after a Shortcut adds note after note', async () => {
        const linking = fakeLinking(ADD_NOTE);
        const queue = new IncomingUrlQueue();
        queue.start(linking.source);
        await linking.finishLaunchRead();

        const stack = ['decks'];
        queue.attach((url) => {
            const navigation = incomingUrlNavigation(url, stack[stack.length - 1], routeFor);
            if (!navigation) return;
            const screen = navigation.href.pathname.slice(1);
            if (navigation.method === 'replace') stack.splice(stack.length - 1, 1, screen);
            else stack.push(screen);
        });
        linking.open(ADD_NOTE);
        linking.open(ADD_NOTE);
        expect(stack).toEqual(['decks', 'editor']);

        linking.open(SEARCH);
        linking.open(SEARCH);
        expect(stack).toEqual(['decks', 'editor', 'browser']);
    });
});
