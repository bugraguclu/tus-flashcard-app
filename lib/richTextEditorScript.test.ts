import { describe, expect, it } from 'vitest';
import {
    RICH_TEXT_EDITOR_CONFIG_ID,
    RICH_TEXT_EDITOR_SCRIPT,
    RICH_TEXT_EDITOR_SCRIPT_HASH,
    richTextEditorConfigJson,
    type RichTextEditorDocumentConfig,
} from './richTextEditorScript';
import { isBareMediaReference } from './mediaStore';
import { cspHashSource } from './sha256';

type Listener = (event: any) => void;

/**
 * A container for the field script's detached document that parses just the media tags, enough
 * to read and change their attributes and write them back out as a browser does (`controls=""`).
 */
function parsedMediaContainer() {
    type Tag = { name: string; attributes: Map<string, string> };
    let parts: (string | Tag)[] = [];
    const tags = () => parts.filter((part): part is Tag => typeof part !== 'string');
    const element = (tag: Tag) => ({
        getAttribute: (name: string) => tag.attributes.get(name) ?? null,
        hasAttribute: (name: string) => tag.attributes.has(name),
        setAttribute: (name: string, value: string) => { tag.attributes.set(name, value); },
        removeAttribute: (name: string) => { tag.attributes.delete(name); },
    });
    return {
        get innerHTML() {
            return parts.map((part) => (typeof part === 'string' ? part : `<${part.name}${
                [...part.attributes].map(([name, value]) => ` ${name}="${value}"`).join('')}>`)).join('');
        },
        set innerHTML(value: string) {
            parts = value.split(/(<(?:img|audio|video|source)\b[^>]*>)/i).map((part) => {
                const head = part.match(/^<(img|audio|video|source)\b/i);
                if (!head) return part;
                const attributes = new Map<string, string>();
                for (const match of part.slice(head[0].length).matchAll(/\s([^\s=/>]+)(?:="([^"]*)")?/g)) {
                    attributes.set(match[1].toLowerCase(), match[2] ?? '');
                }
                return { name: head[1].toLowerCase(), attributes };
            });
        },
        querySelectorAll: (selector: string) => {
            if (selector === '[data-tus-src]') return tags().filter((tag) => tag.attributes.has('data-tus-src')).map(element);
            if (selector.includes('[src]')) return tags().filter((tag) => tag.attributes.has('src')).map(element);
            return [];
        },
    };
}

/** Just enough of a document for the field script to start, take input and report back. */
function runEditorScript(config: RichTextEditorDocumentConfig, host: 'native' | 'web', extras: {
    selection?: unknown;
    execCommand?: (command: string, ui: boolean, value: string) => boolean;
    /** The field is being typed in when the host calls. */
    focused?: boolean;
    /** Records what happens to the field element itself. */
    trace?: string[];
} = {}) {
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
        focus: () => { extras.trace?.push('focus'); },
        blur: () => { extras.trace?.push('blur'); },
        setAttribute: (name: string, value: string) => { extras.trace?.push(`set ${name}=${value}`); },
        removeAttribute: (name: string) => { extras.trace?.push(`remove ${name}`); },
    };
    const configElement = { textContent: richTextEditorConfigJson(config) };
    // Elements made in the field's own document, and in a document made apart from it.
    const elementsMade = { field: 0, detached: 0 };
    const createElement = () => {
        let inner = '';
        return {
            get innerHTML() { return inner; },
            set innerHTML(value: string) { inner = value; },
            querySelectorAll: () => [],
            appendChild: (fragment: { html?: string }) => { inner += fragment.html ?? ''; },
        };
    };
    const document = {
        get activeElement() { return extras.focused ? editor : null; },
        getElementById: (id: string) => (
            id === RICH_TEXT_EDITOR_CONFIG_ID ? configElement : id === 'editor' ? editor : null
        ),
        getSelection: () => extras.selection ?? null,
        execCommand: extras.execCommand,
        createRange: () => ({ selectNodeContents: () => undefined, collapse: () => undefined, cloneRange() { return this; } }),
        hasFocus: () => false,
        addEventListener: on,
        createElement: () => {
            elementsMade.field += 1;
            return createElement();
        },
        implementation: {
            createHTMLDocument: () => ({
                createElement: () => {
                    elementsMade.detached += 1;
                    return parsedMediaContainer();
                },
            }),
        },
    };
    const window: Record<string, unknown> = { addEventListener: () => undefined, getSelection: () => extras.selection ?? null };
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
    return {
        posted,
        dispatch,
        elementsMade,
        editorHtml: () => html,
        setEditorHtml: (value: string) => { html = value; },
        readHtml: () => (window.__tusEditorReadHtml as () => unknown)(),
        insertHtml: (html: unknown, options?: unknown) => (window.__tusEditorInsertHtml as (h: unknown, o?: unknown) => void)(html, options),
        setHtml: (html: unknown) => (window.__tusEditorSetHtml as (h: unknown) => void)(html),
        command: (payload: { command: string; value?: string }) => (window.__tusEditorCommand as (p: unknown) => void)(payload),
    };
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

    it('numbers each edit it reports so a late message cannot pass for a newer one', () => {
        const run = runEditorScript({ ...baseConfig, hostOrigin: 'https://app.example' }, 'web');
        run.setEditorHtml('ilk');
        run.dispatch('input');
        run.setEditorHtml('ilk ikinci');
        run.dispatch('input');
        const changes = run.posted
            .map((entry) => entry.message as { type: string; html?: string; seq?: number })
            .filter((message) => message.type === 'change');
        expect(changes).toEqual([
            { type: 'change', html: 'ilk', seq: 1 },
            { type: 'change', html: 'ilk ikinci', seq: 2 },
        ]);
    });

    it('lets the web host read the newest edit before its message has been delivered', () => {
        const run = runEditorScript({ ...baseConfig, hostOrigin: 'https://app.example' }, 'web');
        expect(run.readHtml()).toEqual({ html: baseConfig.html, seq: 0 });
        run.setEditorHtml('son kelime');
        run.dispatch('input');
        expect(run.readHtml()).toEqual({ html: 'son kelime', seq: 1 });
    });

    it('copies a field for saving in a document apart from the field, where pictures load nothing', () => {
        // Saving sets each picture's src back to its bare filename on the copy. Made in the
        // field's own document, the browser fetched every picture again on each edit: on web from
        // the page's origin, which answered 404.
        const run = runEditorScript({ ...baseConfig, hostOrigin: 'https://app.example' }, 'web');
        run.setEditorHtml('<img src="blob:https://app.example/1" data-tus-src="kalp.jpg">');
        const before = { ...run.elementsMade };
        run.dispatch('input');
        run.readHtml();
        expect(run.elementsMade.field).toBe(before.field);
        expect(run.elementsMade.detached).toBeGreaterThan(before.detached);
    });

    it('stays silent on web without a host origin to address', () => {
        const run = runEditorScript(baseConfig, 'web');
        expect(run.posted).toEqual([]);
    });
});

describe('media entering a web field', () => {
    const web = { ...baseConfig, hostOrigin: 'https://app.example' };
    const inserting = (config: RichTextEditorDocumentConfig, host: 'native' | 'web') => {
        const inserted: string[] = [];
        const run = runEditorScript(config, host, {
            execCommand: (command, _ui, value) => { if (command === 'insertHTML') inserted.push(value); return true; },
        });
        return { run, inserted };
    };

    it('gives the first document its media with no bare src, and saves it byte for byte', () => {
        // The browser fetches a src as soon as the element is in the field document; a bare
        // filename went to the page's origin, which answered 404, before the host showed the file.
        const html = '<p><img src="kalp.jpg" alt="Kalp"> <video controls><source src="atim.mp4"></video></p>';
        const run = runEditorScript({ ...web, html }, 'web');
        expect(run.editorHtml()).toBe(
            '<p><img src="" alt="Kalp" data-tus-src="kalp.jpg"> <video controls=""><source src="" data-tus-src="atim.mp4"></video></p>',
        );
        expect(run.readHtml()).toEqual({ html: '<p><img src="kalp.jpg" alt="Kalp"> <video controls=""><source src="atim.mp4"></video></p>', seq: 0 });
        // Once the host has pointed the picture at its object URL, the saved field is the same.
        run.setEditorHtml(run.editorHtml().replace('src="" alt', 'src="blob:https://app.example/1" alt'));
        expect(run.readHtml()).toMatchObject({ html: '<p><img src="kalp.jpg" alt="Kalp"> <video controls=""><source src="atim.mp4"></video></p>' });
    });

    it('leaves every src that is no bare filename, and HTML without one, exactly as written', () => {
        const html = '<img src="blob:https://app.example/1" data-tus-src="a.jpg"><img src="data:image/png;base64,AA"><img src="https://x.test/b.png"><img src="/c.png"><img src="//x.test/d.png"><img src="#e"><img src="">';
        expect(runEditorScript({ ...web, html }, 'web').editorHtml()).toBe(html);
        const odd = '<b>kalp</b><IMG SRC=x.png class=y>';
        expect(runEditorScript({ ...web, html: '<b>kalp</b>' }, 'web').editorHtml()).toBe('<b>kalp</b>');
        expect(runEditorScript({ ...baseConfig, html: odd }, 'native').editorHtml()).toBe(odd);
    });

    it('treats as bare exactly what the web host resolves', () => {
        for (const src of ['kalp.jpg', 'ses kaydı.mp3', 'a&amp;b.png', 'blob:x', 'data:,', 'https://x.test/a.png', 'C:x.png', '/a.png', '//x/a.png', '#a']) {
            const run = runEditorScript({ ...web, html: `<img src="${src}">` }, 'web');
            expect(run.editorHtml() !== `<img src="${src}">`, src).toBe(isBareMediaReference(src));
        }
    });

    it('inserts pictures and sounds with no bare src, in the order they were asked for', () => {
        const { run, inserted } = inserting(web, 'web');
        run.insertHtml('[sound:ses.mp3]');
        run.insertHtml({ html: '<img src="kalp.jpg">', original: '<img src="kalp.jpg">', preserved: {} });
        expect(inserted).toEqual([
            '<audio controls="" src="" disableremoteplayback="" controlslist="nodownload" data-tus-src="ses.mp3"></audio>',
            '<img src="" data-tus-src="kalp.jpg">',
        ]);
    });

    it('replaces a web field\'s HTML with no bare src', () => {
        const run = runEditorScript(web, 'web');
        run.setHtml({ html: '<img src="a.jpg">', original: '<img src="a.jpg">', preserved: {} });
        expect(run.editorHtml()).toBe('<img src="" data-tus-src="a.jpg">');
        run.setHtml('<img src="b.jpg">');
        expect(run.editorHtml()).toBe('<img src="" data-tus-src="b.jpg">');
    });

    it('hands the native WebView bare filenames, which it reads from the media folder', () => {
        const html = '<img src="kalp.jpg">';
        expect(runEditorScript({ ...baseConfig, html }, 'native').editorHtml()).toBe(html);
        const { run, inserted } = inserting(baseConfig, 'native');
        run.insertHtml('[sound:ses.mp3]');
        run.setHtml('<img src="b.jpg">');
        expect(inserted).toEqual(['<audio controls src="ses.mp3" disableRemotePlayback controlsList="nodownload"></audio>']);
        expect(run.editorHtml()).toBe('<img src="b.jpg">');
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

describe('cloze button (EDT-3)', () => {
    const selectionOf = (html: string) => ({
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt: () => ({ cloneContents: () => ({ html }) }),
        removeAllRanges: () => undefined,
        addRange: () => undefined,
    });
    it('wraps the selection with its formatting and media in the number the host asks for', () => {
        const calls: [string, string][] = [];
        const run = runEditorScript(baseConfig, 'native', {
            selection: selectionOf('<b>kalp</b> <img src="x.png">'),
            execCommand: (command, _ui, value) => { calls.push([command, value]); return true; },
        });
        run.command({ command: 'cloze', value: '3' });
        expect(calls).toContainEqual(['insertHTML', '{{c3::<b>kalp</b> <img src="x.png">}}']);
    });
    it('falls back to the field\'s own next number', () => {
        const calls: [string, string][] = [];
        const run = runEditorScript({ ...baseConfig, html: '{{c2::a}}' }, 'native', {
            selection: selectionOf('b'),
            execCommand: (command, _ui, value) => { calls.push([command, value]); return true; },
        });
        run.command({ command: 'cloze' });
        expect(calls).toContainEqual(['insertHTML', '{{c3::b}}']);
    });
});

describe('cloze numbering across fields', async () => {
    const { nextClozeNumber } = await import('./templates');
    it('counts every field, and reuses the highest number on request', () => {
        expect(nextClozeNumber(['{{c1::a}}', 'Extra {{c4::b}}'])).toBe(5);
        expect(nextClozeNumber(['{{c1::a}}', 'Extra {{c4::b}}'], true)).toBe(4);
        expect(nextClozeNumber(['', ''])).toBe(1);
        expect(nextClozeNumber(['', ''], true)).toBe(1);
    });
});

describe('pasted pictures (EDT-7)', () => {
    it('stores a pasted picture as media whether or not PNG paste is on', () => {
        expect(RICH_TEXT_EDITOR_SCRIPT).not.toContain('if (!config.pasteImagesAsPng) return;');
        expect(RICH_TEXT_EDITOR_SCRIPT).toContain("canvas.toDataURL('image/jpeg', 0.9)");
        expect(RICH_TEXT_EDITOR_SCRIPT).toContain("canvas.toDataURL('image/png')");
    });
    it('intercepts an image paste even with PNG paste off', () => {
        const prevented: string[] = [];
        const run = runEditorScript(baseConfig, 'native');
        (globalThis as any).FileReader = class { readAsDataURL() { /* never loads in this stub */ } };
        run.dispatch('paste', {
            clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => ({}) }] },
            preventDefault: () => prevented.push('paste'),
        });
        delete (globalThis as any).FileReader;
        expect(prevented).toEqual(['paste']);
    });
});

describe('attachments from the paper-clip', () => {
    const recording = (focused: boolean) => {
        const trace: string[] = [];
        const run = runEditorScript(baseConfig, 'native', {
            focused,
            trace,
            execCommand: (command) => { trace.push(command); return true; },
        });
        return { run, trace };
    };

    it('go in at the caret with no on-screen keyboard, and leave the field unfocused', () => {
        // On iPhone a focus this script gives the document opens the keyboard; inputmode none
        // keeps it down for the insertion, and the field is let go once the picture is in.
        const { run, trace } = recording(false);
        run.insertHtml({ html: '<img src="kalp.jpg">', original: '<img src="kalp.jpg">', preserved: {} }, { focus: false });
        expect(trace).toEqual(['set inputmode=none', 'focus', 'insertHTML', 'blur', 'remove inputmode']);
        expect(run.posted.some(({ message }) => (message as { type?: string }).type === 'change')).toBe(true);
    });

    it('leave a field that is being typed in focused, keyboard and all', () => {
        const { run, trace } = recording(true);
        run.insertHtml({ html: '<img src="kalp.jpg">', original: '<img src="kalp.jpg">', preserved: {} }, { focus: false });
        expect(trace).toContain('insertHTML');
        expect(trace).not.toContain('blur');
        expect(trace.some((step) => step.includes('inputmode'))).toBe(false);
    });

    it('focus the field as before when the host does not ask otherwise', () => {
        const { run, trace } = recording(false);
        run.insertHtml({ html: '<b>x</b>', original: '<b>x</b>', preserved: {} });
        expect(trace).toEqual(['focus', 'insertHTML']);
    });

    it('let the field go even when the insertion fails', () => {
        const trace: string[] = [];
        const run = runEditorScript(baseConfig, 'native', {
            trace,
            execCommand: () => { throw new Error('no selection'); },
        });
        expect(() => run.insertHtml('<img src="a.png">', { focus: false })).toThrow('no selection');
        expect(trace.slice(-2)).toEqual(['blur', 'remove inputmode']);
    });
});
