import React, { createRef, useLayoutEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (spec: { web?: unknown; default?: unknown }) => spec.web ?? spec.default },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
    InteractionManager: { runAfterInteractions: () => ({ cancel: () => undefined }) },
    TextInput: 'TextInput',
    View: 'View',
}));
vi.mock('react-native-webview', () => ({ WebView: 'WebView' }));
vi.mock('./mediaStore', () => ({
    getMediaBaseUrl: () => '',
    getWebMediaUrl: async () => null,
    isBareMediaReference: () => false,
    saveMediaBytes: async () => undefined,
}));
vi.mock('./storage', () => ({ getDbSetting: () => null, setDbSetting: () => undefined }));

import RichTextEditor, { type RichTextEditorHandle } from '../components/RichTextEditor';
import { Colors } from '../constants/theme';

/**
 * The web field is a same-origin iframe that WebHtmlFrame writes during the layout phase. The
 * document's script runs inside that write and posts `ready` at once, and the browser delivers the
 * message in a later task. React flushes passive effects in the same task only after a synchronous
 * commit; after any other (a direct page load of /editor) they can run after that message. The
 * harness delivers the message from a later sibling's layout effect, which is that ordering.
 */
const ORIGIN = 'http://localhost:8081';
type MessageListener = (event: { source: unknown; origin: string; data: unknown }) => void;
const listeners = new Set<MessageListener>();
const hostWindow = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: MessageListener) => { if (type === 'message') listeners.add(listener); },
    removeEventListener: (type: string, listener: MessageListener) => { if (type === 'message') listeners.delete(listener); },
};

const EDITOR_FUNCTIONS = ['__tusEditorSetHtml', '__tusEditorInsertHtml', '__tusEditorCommand', '__tusEditorRequestState'];

function fieldFrame() {
    const queued: string[] = [];
    const calls: { fn: string; args: unknown[] }[] = [];
    const contentWindow: Record<string, unknown> = {};
    const contentDocument = {
        open: () => undefined,
        // The document's script installs the host functions and announces itself while it is written.
        write: () => {
            for (const fn of EDITOR_FUNCTIONS) contentWindow[fn] = (...args: unknown[]) => { calls.push({ fn, args }); };
            queued.push(JSON.stringify({ type: 'ready' }));
        },
        close: () => undefined,
    };
    const deliver = () => {
        for (const message of queued.splice(0)) {
            for (const listener of [...listeners]) listener({ source: contentWindow, origin: ORIGIN, data: { tusEditor: message } });
        }
    };
    return { frame: { contentWindow, contentDocument }, calls, deliver };
}

/** Delivers the queued messages after the commit's layout effects and before its passive ones. */
function DeliverBeforePassiveEffects({ deliver, active }: { deliver: () => void; active: boolean }) {
    useLayoutEffect(() => { if (active) deliver(); });
    return null;
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { window?: unknown }).window = hostWindow;
});
afterAll(() => { delete (globalThis as { window?: unknown }).window; });

let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
    listeners.clear();
    vi.useRealTimers();
});

function mountField({ deliverInLayout }: { deliverInLayout: boolean }) {
    const field = fieldFrame();
    const ref = createRef<RichTextEditorHandle>();
    const element = (placeholder: string, active: boolean) => React.createElement(React.Fragment, null,
        React.createElement(RichTextEditor, {
            ref, value: 'abc', onChange: () => undefined, placeholder, colors: Colors, scrollMode: 'intrinsic',
        }),
        React.createElement(DeliverBeforePassiveEffects, { deliver: field.deliver, active }),
    );
    act(() => {
        renderer = TestRenderer.create(element('Ön', deliverInLayout), {
            createNodeMock: (node) => (node.type === 'iframe' ? field.frame : null),
        });
    });
    const inserts = () => field.calls.filter((call) => call.fn === '__tusEditorInsertHtml');
    return { field, ref, inserts, rebuild: (placeholder: string) => act(() => renderer!.update(element(placeholder, true))) };
}

describe('web rich text field start', () => {
    it('hears the field document announce itself before passive effects have run', () => {
        vi.useFakeTimers();
        const { ref, inserts } = mountField({ deliverInLayout: true });

        act(() => ref.current!.insertHtml('<img src="photo.png">'));
        expect(inserts()).toHaveLength(1);
        expect(inserts()[0].args[0]).toMatchObject({ original: '<img src="photo.png">' });

        // A started field never falls back to the plain-text stand-in, which would show raw HTML.
        act(() => { vi.advanceTimersByTime(5_000); });
        expect(renderer!.root.findAll((node) => (node.type as unknown) === 'TextInput')).toHaveLength(0);
    });

    it('keeps a rebuilt field document usable when its ready message beats the passive effects', () => {
        const { field, ref, inserts, rebuild } = mountField({ deliverInLayout: false });
        act(() => field.deliver());
        act(() => ref.current!.insertHtml('<b>first</b>'));
        expect(inserts()).toHaveLength(1);

        // Any change to the document's look (theme, field font, placeholder) writes a new one.
        rebuild('Arka');
        act(() => ref.current!.insertHtml('<img src="photo.png">'));
        expect(inserts()).toHaveLength(2);
        expect(inserts()[1].args[0]).toMatchObject({ original: '<img src="photo.png">' });
    });
});
