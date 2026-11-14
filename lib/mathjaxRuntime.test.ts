import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MATHJAX_PENDING_STYLE_ID, MATHJAX_SOURCE_LENGTH } from './mathjax';
import {
    loadMathJaxScript,
    setMathJaxSourceReaderForTesting,
    useMathJaxRuntime,
    type MathJaxRuntime,
} from './mathjaxRuntime';

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
    setMathJaxSourceReaderForTesting(null);
    vi.restoreAllMocks();
});

/** Stands in for the vendored file: only its length is checked before it is handed on. */
const SOURCE = `/*mathjax*/${'x'.repeat(MATHJAX_SOURCE_LENGTH - 11)}`;

function renderRuntime(needed: boolean) {
    const seen: MathJaxRuntime[] = [];
    function Probe({ math }: { math: boolean }) {
        seen.push(useMathJaxRuntime(math));
        return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(React.createElement(Probe, { math: needed })); });
    return {
        seen,
        latest: () => seen[seen.length - 1],
        update: (math: boolean) => act(() => renderer.update(React.createElement(Probe, { math }))),
        unmount: () => act(() => renderer.unmount()),
    };
}

describe('MathJax runtime for the card document', () => {
    it('reads nothing for a card without math', () => {
        const reader = { readNow: vi.fn(() => SOURCE), read: vi.fn(async () => SOURCE) };
        setMathJaxSourceReaderForTesting(reader);
        const view = renderRuntime(false);
        view.update(false);
        expect(view.latest()).toEqual({ css: '', script: null });
        expect(reader.readNow).not.toHaveBeenCalled();
        expect(reader.read).not.toHaveBeenCalled();
        view.unmount();
    });

    it('gives the first card with a formula its script at once when the file is on the device', () => {
        const reader = { readNow: vi.fn(() => SOURCE), read: vi.fn(async () => SOURCE) };
        setMathJaxSourceReaderForTesting(reader);
        const view = renderRuntime(true);
        expect(view.seen).toHaveLength(1);
        const first = view.latest();
        expect(first.script).toContain(SOURCE);
        expect(first.css).toContain(`id="${MATHJAX_PENDING_STYLE_ID}" data-state="ready"`);
        view.update(true);
        view.update(false);
        view.update(true);
        // Read once per run, and the same script each time, so a WebView is never reloaded for it.
        expect(reader.readNow).toHaveBeenCalledTimes(1);
        expect(reader.read).not.toHaveBeenCalled();
        expect(view.latest().script).toBe(first.script);
        view.unmount();
    });

    it('loads the file first when it is not on the device yet, then hands over a new document', async () => {
        let deliver!: (source: string) => void;
        const reader = { readNow: vi.fn(() => null), read: vi.fn(() => new Promise<string>((resolve) => { deliver = resolve; })) };
        setMathJaxSourceReaderForTesting(reader);
        const view = renderRuntime(true);
        const waiting = view.latest();
        expect(waiting.script).toBeNull();
        expect(waiting.css).toContain('data-state="loading"');
        await act(async () => { deliver(SOURCE); });
        const ready = view.latest();
        expect(ready.script).toContain(SOURCE);
        expect(ready.css).toContain('data-state="ready"');
        expect(ready.css).not.toBe(waiting.css);
        expect(reader.read).toHaveBeenCalledTimes(1);
        view.unmount();
    });

    it('leaves the TeX source on the card when the file is incomplete or cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const reader = { readNow: vi.fn(() => 'truncated'), read: vi.fn(async () => { throw new Error('missing'); }) };
        setMathJaxSourceReaderForTesting(reader);
        const view = renderRuntime(true);
        await act(async () => { await loadMathJaxScript(); });
        expect(view.latest()).toEqual({ css: '', script: null });
        expect(await loadMathJaxScript()).toBeNull();
        // A failed read is not retried card after card.
        expect(reader.read).toHaveBeenCalledTimes(1);
        view.unmount();
    });
});
