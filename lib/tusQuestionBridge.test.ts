import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    TUS_QUESTION_DOUBLE_TAP_MS,
    TUS_QUESTION_LONG_PRESS_MS,
    bindTusQuestionDocument,
    parseTusQuestionMessage,
    tusQuestionBridgeScript,
} from './tusQuestionBridge';

/** Just enough DOM for the binder: classes, attributes and listeners that can be fired. */
class FakeElement {
    readonly classes: Set<string>;
    readonly attributes: Record<string, string>;
    readonly listeners: Record<string, Array<(event: unknown) => void>> = {};
    children: FakeElement[] = [];

    constructor(classes: string[], attributes: Record<string, string> = {}) {
        this.classes = new Set(classes);
        this.attributes = { ...attributes };
    }

    classList = {
        add: (name: string) => { this.classes.add(name); },
        remove: (name: string) => { this.classes.delete(name); },
        contains: (name: string) => this.classes.has(name),
    };

    getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
    setAttribute(name: string, value: string): void { this.attributes[name] = String(value); }
    addEventListener(type: string, listener: (event: unknown) => void): void {
        (this.listeners[type] ??= []).push(listener);
    }
    querySelectorAll(): FakeElement[] { return this.children; }

    fire(type: string, event: Record<string, unknown> = {}): void {
        for (const listener of this.listeners[type] ?? []) listener({ button: 0, preventDefault() {}, ...event });
    }
    tap(): void { this.fire('click'); }
}

const TOKEN = 'card-token';

function card(revealed = false) {
    const root = new FakeElement(revealed ? ['tusq', 'tusq-revealed'] : ['tusq']);
    root.children = ['A', 'B', 'C', 'D', 'E'].map((letter) => new FakeElement(['tusq-option'], { 'data-letter': letter }));
    const document = { querySelector: (selector: string) => (selector === '.tusq' ? root : null) };
    const option = (letter: string) => root.children.find((child) => child.getAttribute('data-letter') === letter)!;
    return { root, document, option };
}

let posted: string[];
beforeEach(() => {
    vi.useFakeTimers();
    posted = [];
});
afterEach(() => { vi.useRealTimers(); });

const chosen = () => posted.map((raw) => parseTusQuestionMessage(raw, TOKEN));

describe('TUS question gestures (web binder)', () => {
    it('answers with a single tap once the double-tap window has passed, then ignores further taps', () => {
        const { document, option } = card();
        bindTusQuestionDocument(document as never, TOKEN, (raw) => posted.push(raw));

        option('C').tap();
        expect(posted).toEqual([]);
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(chosen()).toEqual(['C']);
        expect(option('C').classes.has('tusq-picked')).toBe(true);

        option('A').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(chosen()).toEqual(['C']);
    });

    it('strikes an option out with a double tap, refuses it as an answer, and restores it with another', () => {
        const { document, option } = card();
        bindTusQuestionDocument(document as never, TOKEN, (raw) => posted.push(raw));

        option('B').tap();
        vi.advanceTimersByTime(100);
        option('B').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS * 2);
        expect(option('B').classes.has('tusq-eliminated')).toBe(true);
        expect(option('B').getAttribute('aria-disabled')).toBe('true');
        expect(posted).toEqual([]);

        option('B').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(posted).toEqual([]);

        option('B').tap();
        option('B').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(option('B').classes.has('tusq-eliminated')).toBe(false);

        option('B').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(chosen()).toEqual(['B']);
    });

    it('strikes an option out with a long press, and the click the press ends in does not answer', () => {
        const { document, option } = card();
        bindTusQuestionDocument(document as never, TOKEN, (raw) => posted.push(raw));

        option('E').fire('touchstart', { touches: [{ clientX: 10, clientY: 10 }] });
        vi.advanceTimersByTime(TUS_QUESTION_LONG_PRESS_MS);
        expect(option('E').classes.has('tusq-eliminated')).toBe(true);
        option('E').fire('touchend');
        option('E').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(posted).toEqual([]);
        expect(option('E').classes.has('tusq-eliminated')).toBe(true);
    });

    it('treats a press that moves as a scroll, not an elimination', () => {
        const { document, option } = card();
        bindTusQuestionDocument(document as never, TOKEN, (raw) => posted.push(raw));

        option('A').fire('touchstart', { touches: [{ clientX: 10, clientY: 10 }] });
        option('A').fire('touchmove', { touches: [{ clientX: 10, clientY: 60 }] });
        vi.advanceTimersByTime(TUS_QUESTION_LONG_PRESS_MS * 2);
        expect(option('A').classes.has('tusq-eliminated')).toBe(false);
    });

    it('leaves an answer side alone', () => {
        const { document, option, root } = card(true);
        bindTusQuestionDocument(document as never, TOKEN, (raw) => posted.push(raw));
        expect(root.getAttribute('data-tusq-bound')).toBeNull();
        expect(option('A').listeners.click).toBeUndefined();
    });
});

describe('TUS question gestures (native script)', () => {
    it('runs the same binder in the WebView and posts through the native bridge', () => {
        const { document, option, root } = card();
        const window = { ReactNativeWebView: { postMessage: (raw: string) => posted.push(raw) } };
        // eslint-disable-next-line no-new-func
        new Function('document', 'window', tusQuestionBridgeScript(TOKEN))(document, window);
        expect(root.getAttribute('data-tusq-bound')).toBe('1');

        // Binding twice (a re-injected script) must not double every listener.
        // eslint-disable-next-line no-new-func
        new Function('document', 'window', tusQuestionBridgeScript(TOKEN))(document, window);
        expect(option('D').listeners.click).toHaveLength(1);

        option('D').tap();
        vi.advanceTimersByTime(TUS_QUESTION_DOUBLE_TAP_MS);
        expect(chosen()).toEqual(['D']);
    });
});

describe('parseTusQuestionMessage', () => {
    it('accepts only this card view’s token, the choose type and a letter', () => {
        const message = (overrides: Record<string, unknown>) => JSON.stringify({ source: 'tus-question', token: TOKEN, type: 'choose', letter: 'A', ...overrides });
        expect(parseTusQuestionMessage(message({}), TOKEN)).toBe('A');
        expect(parseTusQuestionMessage(message({ token: 'other' }), TOKEN)).toBeNull();
        expect(parseTusQuestionMessage(message({ source: 'tus-type-answer' }), TOKEN)).toBeNull();
        expect(parseTusQuestionMessage(message({ type: 'eliminate' }), TOKEN)).toBeNull();
        expect(parseTusQuestionMessage(message({ letter: 'F' }), TOKEN)).toBeNull();
        expect(parseTusQuestionMessage('1240', TOKEN)).toBeNull();
        expect(parseTusQuestionMessage('{oops', TOKEN)).toBeNull();
    });
});
