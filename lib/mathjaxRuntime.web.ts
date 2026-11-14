/**
 * MathJax for the web build's card frames (lib/mathjax.ts). A card frame is a same-origin iframe
 * sandboxed without scripts, so MathJax cannot run inside it. It runs once in the app page instead
 * and typesets each frame's document from there, as CardWebView already binds the frame's links
 * and hints from outside, so the frame keeps its sandbox and its `script-src 'none'`.
 *
 * The page fetches the vendored file — a content-hashed asset, which the service worker keeps for
 * offline use — and runs it as one inline script that the page's policy allows by its hash
 * (lib/webAppContentSecurityPolicy.ts); MathJax's loader refuses every other file. MathJax is set
 * up with `startup.typeset: false`, so it never touches the page itself.
 */

import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { MATHJAX_PENDING_STYLE_ID, MATHJAX_SOURCE_LENGTH, mathJaxCardCss, mathJaxConfig } from './mathjax';
import { requireMathJaxAsset } from './mathjaxAsset';
import type { MathJaxRuntime } from './mathjaxRuntime';

interface MathJaxApi {
    startup: { promise: Promise<unknown> };
    typesetPromise(elements?: unknown[]): Promise<unknown>;
    typesetClear(elements?: unknown[]): void;
    svgStylesheet(): Element;
}

/** A typeset that has not finished by then no longer holds the frames queued behind it. */
const TYPESET_TIMEOUT_MS = 4000;

const OFF: MathJaxRuntime = { css: '', script: null };
const WAITING: MathJaxRuntime = { css: mathJaxCardCss('page'), script: null };

let runtime: Promise<MathJaxApi | null> | null = null;
let unavailable = false;
let queue: Promise<unknown> = Promise.resolve();

function assetUri(): string {
    const module = requireMathJaxAsset() as unknown;
    const reference = module && typeof module === 'object' && typeof (module as { default?: unknown }).default === 'string'
        ? (module as { default: string }).default
        : module;
    return Asset.fromModule(reference as number | string).uri;
}

async function start(): Promise<MathJaxApi> {
    const response = await fetch(assetUri());
    if (!response.ok) throw new Error(`MathJax asset answered ${response.status}`);
    const source = await response.text();
    if (source.length !== MATHJAX_SOURCE_LENGTH) throw new Error(`MathJax asset has ${source.length} characters`);
    const scope = window as unknown as { MathJax?: unknown };
    scope.MathJax = mathJaxConfig();
    const element = document.createElement('script');
    element.textContent = source;
    document.head.appendChild(element);
    // A policy that does not name the file's hash leaves the configuration object in place.
    const api = scope.MathJax as Partial<MathJaxApi> | undefined;
    if (!api?.startup?.promise) throw new Error('MathJax did not start');
    await api.startup.promise;
    if (typeof api.typesetPromise !== 'function' || typeof api.svgStylesheet !== 'function') {
        throw new Error('MathJax started without its typeset methods');
    }
    return api as MathJaxApi;
}

/** Start MathJax in the page, once per run; resolves null when it cannot run here. */
export function startWebMathJax(): Promise<MathJaxApi | null> {
    if (!runtime) {
        runtime = start().catch((error) => {
            unavailable = true;
            console.warn('[mathjax] MathJax could not start; formulas stay as TeX:', error);
            return null;
        });
    }
    return runtime;
}

function typesetIn(api: MathJaxApi, frameDocument: Document): Promise<boolean> {
    // A frame that has gone since its load event has nothing left to typeset.
    const root = frameDocument.defaultView ? frameDocument.getElementById('qa') ?? frameDocument.body : null;
    if (!root?.isConnected) return Promise.resolve(false);
    // MathJax puts its stylesheet in the page it runs in; the frame needs its own copy, or the
    // MathML it keeps for screen readers would show beside each formula.
    const sheet = api.svgStylesheet();
    if (sheet && !(sheet.id && frameDocument.getElementById(sheet.id))) {
        (frameDocument.head ?? frameDocument.documentElement).appendChild(frameDocument.importNode(sheet, true));
    }
    // Forget the formulas of frames typeset before, which would otherwise keep their documents alive.
    api.typesetClear();
    return api.typesetPromise([root]).then(() => true);
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return Promise.race([promise, new Promise<T>((resolve) => { setTimeout(() => resolve(fallback), TYPESET_TIMEOUT_MS); })]);
}

/**
 * Typeset a card frame's document, then show it: the pending style comes off whether or not
 * MathJax could run, so the TeX source is what the learner sees if it could not. One frame is
 * typeset at a time, because MathJax keeps a single set of formulas per page.
 */
export async function typesetCardDocument(frameDocument: Document): Promise<boolean> {
    const api = await startWebMathJax();
    let done = false;
    if (api) {
        const run = queue.then(() => typesetIn(api, frameDocument));
        queue = withTimeout(run.catch(() => false), false);
        done = await withTimeout(run, false).catch((error) => {
            console.warn('[mathjax] a card could not be typeset:', error);
            return false;
        });
    }
    frameDocument.getElementById(MATHJAX_PENDING_STYLE_ID)?.remove();
    return done;
}

/** What a card frame needs for its math: nothing at all when `needed` is false. */
export function useMathJaxRuntime(needed: boolean): MathJaxRuntime {
    const [failed, setFailed] = useState(unavailable);
    useEffect(() => {
        if (!needed || failed) return undefined;
        let live = true;
        void startWebMathJax().then((api) => { if (live && !api) setFailed(true); });
        return () => { live = false; };
    }, [needed, failed]);
    return needed && !failed && !unavailable ? WAITING : OFF;
}
