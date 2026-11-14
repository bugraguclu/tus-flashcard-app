import { readExternalAppUrl, type ExternalAppAction, type ExternalLinkRejection } from './externalLinking';
// Type-only: the route resolver reads the collection and is handed in by the caller.
import type { ExternalActionResult } from './externalActionRoute';
import { inferImportFileType } from './importFile';

/** Where the iPhone hands the app a URL: React Native's `Linking`. */
export interface IncomingUrlSource {
    getInitialURL(): Promise<string | null>;
    addEventListener(type: 'url', listener: (event: { url: string }) => void): { remove(): void };
}

export type IncomingUrlHandler = (url: string) => void;

/**
 * The URLs iOS hands the app (a file opened from Files, a Shortcuts x-callback request), held
 * until the app shell can open them.
 *
 * The app subscribes once per launch and reads the launch URL once. The shell used to do both
 * whenever its navigator mounted: a URL that arrived while it was unmounted was lost, and after
 * the crash screen's Retry or Return home it read the launch URL again (iOS keeps returning it),
 * so the file or request that may have caused the crash opened a second time. It also mounts
 * when startup fails or times out, so a launch file could open the import screen beside a
 * migration that was still writing.
 *
 * URLs now wait here until a handler is attached, which the shell does only once startup has
 * succeeded, and each is handed over exactly once, in the order it arrived (the launch URL first).
 * A handler that throws, such as a collection lookup that fails, loses only that URL.
 */
export class IncomingUrlQueue {
    private readonly pending: string[] = [];
    private handler: IncomingUrlHandler | null = null;
    private started = false;

    /** Subscribes to `source` and reads its launch URL; later calls do nothing. */
    start(source: IncomingUrlSource): void {
        if (this.started) return;
        this.started = true;
        let launchUrlRead = false;
        const arrivedWhileReading = new Set<string>();
        source.addEventListener('url', ({ url }) => {
            if (!launchUrlRead) arrivedWhileReading.add(url);
            this.receive(url);
        });
        source.getInitialURL()
            .then((url) => {
                launchUrlRead = true;
                // The launch URL may also have come in as an event; it is opened once.
                if (!url || arrivedWhileReading.has(url)) return;
                this.pending.unshift(url);
                this.drain();
            })
            .catch((error) => {
                launchUrlRead = true;
                console.warn('[Linking] initial URL failed:', error);
            });
    }

    receive(url: string): void {
        if (!url) return;
        this.pending.push(url);
        this.drain();
    }

    /** Hands every waiting and later URL to `handler` until the returned function detaches it. */
    attach(handler: IncomingUrlHandler): () => void {
        this.handler = handler;
        this.drain();
        return () => {
            if (this.handler === handler) this.handler = null;
        };
    }

    private drain(): void {
        while (this.handler && this.pending.length > 0) {
            const url = this.pending.shift() as string;
            try {
                this.handler(url);
            } catch (error) {
                console.warn('[Linking] incoming URL failed:', error);
            }
        }
    }
}

const incomingUrls = new IncomingUrlQueue();

/** Subscribes the app to incoming URLs. Called once, when the app's code loads. */
export function startIncomingUrls(source: IncomingUrlSource): void {
    incomingUrls.start(source);
}

/** See `IncomingUrlQueue.attach`; the app shell attaches once startup has succeeded. */
export function attachIncomingUrlHandler(handler: IncomingUrlHandler): () => void {
    return incomingUrls.attach(handler);
}

export type IncomingUrlNavigation =
    | { method: 'push' | 'replace'; href: { pathname: string; params: Record<string, string> } }
    /** An x-callback request that cannot be carried out; the shell says why. */
    | { method: 'reject'; rejection: ExternalLinkRejection };

/**
 * The screen an incoming URL opens, given the name of the screen on top. A file opens the import
 * screen. An x-callback request opens what `routeForAction` resolves (the editor, filled in, or a
 * browser search); when that screen is already on top it is replaced rather than stacked, so a
 * Shortcut that adds note after note leaves one editor instead of one per note. A request that is
 * incomplete or that the collection cannot serve (a missing note type or deck) is rejected with
 * its reason. Null for any other URL, which the router opens itself.
 */
export function incomingUrlNavigation(
    url: string,
    currentRouteName: string | undefined,
    routeForAction: (action: ExternalAppAction) => ExternalActionResult | null,
): IncomingUrlNavigation | null {
    const reading = readExternalAppUrl(url);
    if (reading) {
        if ('rejected' in reading) return { method: 'reject', rejection: reading.rejected };
        const route = routeForAction(reading.action);
        if (!route) return null;
        if ('rejected' in route) return { method: 'reject', rejection: route.rejected };
        return { method: currentRouteName === route.pathname.slice(1) ? 'replace' : 'push', href: route };
    }
    if (!inferImportFileType(url)) return null;
    return { method: 'push', href: { pathname: '/import', params: { incomingUri: url } } };
}
