import React, { createRef } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import WebHtmlFrame from '../components/WebHtmlFrame';

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('web HTML frame lifecycle', () => {
    it.each(['CardWebView', 'RichTextEditor'])('%s uses the history-safe HTML surface', (name) => {
        const source = readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), 'utf8');
        expect(source).toMatch(/<WebHtmlFrame\s/);
        expect(source).not.toMatch(/<iframe\s|\bsrcDoc\s*=/);
    });

    it('keeps card reveals and successive cards out of browser navigation', () => {
        const document = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
        const frame = { contentDocument: document } as unknown as HTMLIFrameElement;
        const frameRef = createRef<HTMLIFrameElement>();
        let renderer!: TestRenderer.ReactTestRenderer;
        const render = (html: string, height = 140) => React.createElement(WebHtmlFrame, {
            frameRef, html, sandbox: 'allow-same-origin', style: { height },
        });

        act(() => {
            renderer = TestRenderer.create(render('<p>Question 1</p>'), {
                createNodeMock: () => frame,
            });
        });
        act(() => renderer.update(render('<p>Answer 1</p>')));
        act(() => renderer.update(render('<p>Question 2</p>')));

        // src/srcDoc assignments are frame navigations. Safari can put their about:srcdoc
        // entries in the top-level history and restore a blank page when the router goes back.
        const iframe = renderer.root.findByType('iframe');
        expect(iframe.props).not.toHaveProperty('src');
        expect(iframe.props).not.toHaveProperty('srcDoc');
        expect(iframe.props.sandbox).toBe('allow-same-origin');
        expect(document.write.mock.calls).toEqual([
            ['<p>Question 1</p>'], ['<p>Answer 1</p>'], ['<p>Question 2</p>'],
        ]);
        expect(document.open).toHaveBeenCalledTimes(3);
        expect(document.close).toHaveBeenCalledTimes(3);

        // A height report must preserve the current document, listeners and input selection.
        act(() => renderer.update(render('<p>Question 2</p>', 600)));
        expect(document.open).toHaveBeenCalledTimes(3);
        act(() => renderer.unmount());
    });

    it('preserves the editor sandbox and load callback without reloading unchanged HTML', () => {
        const document = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
        const frame = { contentDocument: document } as unknown as HTMLIFrameElement;
        const frameRef = createRef<HTMLIFrameElement>();
        const onLoad = vi.fn();
        let renderer!: TestRenderer.ReactTestRenderer;
        act(() => {
            renderer = TestRenderer.create(React.createElement(WebHtmlFrame, {
                frameRef, html: '<p>Field</p>', title: 'Front',
                sandbox: 'allow-scripts allow-same-origin', onLoad,
            }), { createNodeMock: () => frame });
        });
        const iframe = renderer.root.findByType('iframe');
        expect(iframe.props.sandbox).toBe('allow-scripts allow-same-origin');
        expect(iframe.props.title).toBe('Front');
        expect(iframe.props.onLoad).toBe(onLoad);
        act(() => renderer.unmount());
    });
});
