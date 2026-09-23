import { describe, expect, it } from 'vitest';
import {
    RICH_TEXT_EDITOR_CONFIG_ID,
    RICH_TEXT_EDITOR_SCRIPT,
    RICH_TEXT_EDITOR_SCRIPT_HASH,
    richTextEditorConfigJson,
    type RichTextEditorDocumentConfig,
} from './richTextEditorScript';
import { cspHashSource } from './sha256';

type Listener = (event: any) => void;

/** Just enough of a document for the field script to start, take input and report back. */
function runEditorScript(config: RichTextEditorDocumentConfig, host: 'native' | 'web') {
    const posted: { message: unknown; targetOrigin?: string }[] = [];
    const listeners = new Map<string, Listener[]>();
    const on = (type: string, listener: Listener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    let html = '';
    const editor = {
        get innerHTML() { return html; },
        set innerHTML(value: string) { html = value; },
        scrollHeight: 120,
        dataset: {},
        addEventListener: on,
        querySelectorAll: () => [],
        contains: () => false,
        focus: () => undefined,
        blur: () => undefined,
    };
    const configElement = { textContent: richTextEditorConfigJson(config) };
    const document = {
        activeElement: null,
        getElementById: (id: string) => (
            id === RICH_TEXT_EDITOR_CONFIG_ID ? configElement : id === 'editor' ? editor : null
        ),
        getSelection: () => null,
        hasFocus: () => false,
        addEventListener: on,
        createElement: () => {
            let inner = '';
            return {
                get innerHTML() { return inner; },
                set innerHTML(value: string) { inner = value; },
                querySelectorAll: () => [],
            };
        },
    };
    const window: Record<string, unknown> = { addEventListener: () => undefined };
    if (host === 'native') {
        window.ReactNativeWebView = { postMessage: (message: string) => posted.push({ message: JSON.parse(message) }) };
    } else {
        window.parent = {
            postMessage: (data: { tusEditor: string }, targetOrigin: string) => {
                posted.push({ message: JSON.parse(data.tusEditor), targetOrigin });
            },
        };
    }
    const frames: (() => void)[] = [];
    new Function('document', 'window', 'requestAnimationFrame', RICH_TEXT_EDITOR_SCRIPT)(
        document,
        window,
        (callback: () => void) => frames.push(callback),
    );
    frames.splice(0).forEach((frame) => frame());
    const dispatch = (type: string, event: Record<string, unknown> = {}) => {
        for (const listener of listeners.get(type) ?? []) listener({ preventDefault: () => undefined, ...event });
        frames.splice(0).forEach((frame) => frame());
    };
    return { posted, dispatch, editorHtml: () => html, setEditorHtml: (value: string) => { html = value; } };
}

const baseConfig: RichTextEditorDocumentConfig = {
    html: '<b>kalp</b> kapakçıkları',
    minHeight: 58,
    editable: true,
    pasteImagesAsPng: false,
};

describe('rich text field script', () => {
    it('parses as plain JavaScript in every engine it is handed to', () => {
        expect(() => new Function(RICH_TEXT_EDITOR_SCRIPT)).not.toThrow();
    });

    it('cannot close the script element it is written into', () => {
        expect(RICH_TEXT_EDITOR_SCRIPT).not.toMatch(/<\/script/i);
        expect(RICH_TEXT_EDITOR_SCRIPT).not.toContain('<!--');
    });

    it('keeps the bracketed sound marker and the image type check as real regular expressions', () => {
        expect(RICH_TEXT_EDITOR_SCRIPT).toContain('/\\[sound:([^\\]]+)\\]/gi');
        expect(RICH_TEXT_EDITOR_SCRIPT).toContain('/^image\\//i.test');
    });

    it('publishes the hash of exactly the text it runs', () => {
        expect(RICH_TEXT_EDITOR_SCRIPT_HASH).toBe(cspHashSource(RICH_TEXT_EDITOR_SCRIPT));
    });

    it('loads the field from its config and reports ready over the native bridge', () => {
        const run = runEditorScript(baseConfig, 'native');
        expect(run.editorHtml()).toBe(baseConfig.html);
        expect(run.posted.map((entry) => (entry.message as { type: string }).type)).toEqual(['ready', 'height']);
        expect(run.posted[1].message).toEqual({ type: 'height', height: 120 });
    });

    it('answers the web host through postMessage to its origin only', () => {
        const run = runEditorScript({ ...baseConfig, hostOrigin: 'https://app.example' }, 'web');
        expect(run.posted.length).toBeGreaterThan(0);
        expect(run.posted.every((entry) => entry.targetOrigin === 'https://app.example')).toBe(true);
        run.setEditorHtml('yeni <i>metin</i>');
        run.dispatch('input');
        expect(run.posted.some((entry) => (
            (entry.message as { type: string; html?: string }).type === 'change'
            && (entry.message as { html?: string }).html === 'yeni <i>metin</i>'
        ))).toBe(true);
    });

    it('stays silent on web without a host origin to address', () => {
        const run = runEditorScript(baseConfig, 'web');
        expect(run.posted).toEqual([]);
    });
});

describe('rich text field config', () => {
    it('round-trips field HTML that would otherwise end the element early', () => {
        const config = { ...baseConfig, html: '</script><script>alert(1)</script> ' };
        const json = richTextEditorConfigJson(config);
        expect(json).not.toMatch(/<\/script/i);
        expect(json).not.toContain('<');
        expect(JSON.parse(json)).toEqual(config);
    });
});
