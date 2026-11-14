/**
 * MathJax for the iPhone card document (lib/mathjax.ts). The vendored file is read from the app
 * bundle the first time a card needs it and kept in memory for the rest of the run; the card
 * WebView is then handed it with the rest of the app's own scripts. An ordinary card never reads
 * it. A release build reads it at once, so even the first card with a formula loads its document
 * only once; a development build fetches it from Metro first.
 *
 * Nothing is written to the media folder, so Check Media, exports and backups never see MathJax.
 * The web build runs MathJax in the page instead: lib/mathjaxRuntime.web.ts.
 */

import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { readUriText } from './files';
import { MATHJAX_SOURCE_LENGTH, cardMathJaxScript, mathJaxCardCss } from './mathjax';
import { requireMathJaxAsset } from './mathjaxAsset';

export interface MathJaxRuntime {
    /** CSS the card document gets beside its own: empty when it has no math or MathJax failed. */
    css: string;
    /** The script the card document is handed before its content loads; null until it is read. */
    script: string | null;
}

interface MathJaxSourceReader {
    /** The file's text when it can be read without waiting, otherwise null. */
    readNow(): string | null;
    read(): Promise<string>;
}

const OFF: MathJaxRuntime = { css: '', script: null };

function bundledAsset() {
    return Asset.fromModule(requireMathJaxAsset());
}

const bundleReader: MathJaxSourceReader = {
    readNow() {
        // A release build embeds the asset, so it is a file already; in development it is on Metro.
        const asset = bundledAsset();
        const uri = asset.localUri ?? asset.uri;
        if (!uri || !uri.startsWith('file://')) return null;
        const { File } = require('expo-file-system') as typeof import('expo-file-system');
        return new File(uri).textSync();
    },
    async read() {
        const asset = bundledAsset();
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!uri) throw new Error('MathJax asset could not be located');
        return readUriText(uri);
    },
};

let reader: MathJaxSourceReader = bundleReader;
let script: string | null = null;
let failed = false;
let triedNow = false;
let loading: Promise<void> | null = null;

/** Tests hand in their own reader; this also forgets what an earlier test loaded. */
export function setMathJaxSourceReaderForTesting(next: MathJaxSourceReader | null): void {
    reader = next ?? bundleReader;
    script = null;
    failed = false;
    triedNow = false;
    loading = null;
}

function accept(source: string): void {
    // A short read would hand the card a script that stops half way through.
    if (source.length !== MATHJAX_SOURCE_LENGTH) throw new Error(`MathJax asset has ${source.length} characters`);
    script = cardMathJaxScript(source);
}

function readyScript(): string | null {
    if (script || failed || triedNow) return script;
    triedNow = true;
    try {
        const source = reader.readNow();
        if (source !== null) accept(source);
    } catch (error) {
        // The slower path below may still read it.
        console.warn('[mathjax] could not read MathJax at once:', error);
    }
    return script;
}

/** Read MathJax (once per run) and build the card script; resolves null when it cannot be read. */
export function loadMathJaxScript(): Promise<string | null> {
    if (readyScript() || failed) return Promise.resolve(script);
    if (!loading) {
        loading = reader.read().then(accept).catch((error) => {
            failed = true;
            console.warn('[mathjax] MathJax could not be loaded; formulas stay as TeX:', error);
        });
    }
    return loading.then(() => script);
}

/** What a card document needs for its math: nothing at all when `needed` is false. */
export function useMathJaxRuntime(needed: boolean): MathJaxRuntime {
    const [, setLoaded] = useState(0);
    const ready = needed ? readyScript() : null;
    const waiting = needed && !ready && !failed;
    useEffect(() => {
        if (!waiting) return undefined;
        let live = true;
        void loadMathJaxScript().then(() => { if (live) setLoaded((count) => count + 1); });
        return () => { live = false; };
    }, [waiting]);
    if (!needed || failed) return OFF;
    return ready
        ? { css: mathJaxCardCss('ready'), script: ready }
        : { css: mathJaxCardCss('loading'), script: null };
}

/** The web build typesets a card frame from the page; a native card document does it itself. */
export function typesetCardDocument(_document: unknown): Promise<boolean> {
    return Promise.resolve(false);
}
