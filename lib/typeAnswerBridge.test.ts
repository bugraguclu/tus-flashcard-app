import { describe, expect, it } from 'vitest';
import {
    MAX_TYPE_ANSWER_CHARS,
    parseTypeAnswerBridgeMessage,
    typeAnswerBridgeScript,
} from './typeAnswerBridge';

describe('typed-answer WebView bridge', () => {
    const token = 'runtime-token';

    it('accepts only bounded change and submit messages carrying the runtime token', () => {
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token, type: 'change', value: 'mitoz',
        }), token)).toEqual({ type: 'change', value: 'mitoz' });
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token, type: 'submit', value: 'mayoz',
        }), token)).toEqual({ type: 'submit', value: 'mayoz' });

        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token: 'wrong', type: 'change', value: 'x',
        }), token)).toBeNull();
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'card-template', token, type: 'change', value: 'x',
        }), token)).toBeNull();
        expect(parseTypeAnswerBridgeMessage(JSON.stringify({
            source: 'tus-type-answer', token, type: 'change', value: 'x'.repeat(MAX_TYPE_ANSWER_CHARS + 1),
        }), token)).toBeNull();
        expect(parseTypeAnswerBridgeMessage('{broken', token)).toBeNull();
    });

    it('binds only the token-matched input and enables focus only when requested', () => {
        const passive = typeAnswerBridgeScript(token, false);
        const focused = typeAnswerBridgeScript(token, true);

        expect(passive).toContain('data-tus-type-answer-token');
        expect(passive).toContain(JSON.stringify(token));
        expect(passive).not.toContain('input.focus()');
        expect(focused).toContain('input.focus()');
        expect(focused).toContain(`slice(0,${MAX_TYPE_ANSWER_CHARS})`);
    });

    describe('a tap that puts the keyboard away', () => {
        type Listener = (event: FakeEvent) => void;
        interface FakeEvent { target: FakeElement; stopPropagation: () => void; preventDefault: () => void; stopped: boolean; prevented: boolean }
        class FakeElement {
            listeners: Record<string, Listener[]> = {};
            attributes: Record<string, string> = {};
            value = '';
            constructor(readonly control: boolean) {}
            getAttribute(name: string) { return this.attributes[name] ?? null; }
            setAttribute(name: string, value: string) { this.attributes[name] = value; }
            addEventListener(type: string, listener: Listener) { (this.listeners[type] ??= []).push(listener); }
            closest() { return this.control ? this : null; }
            blur() { page.document.activeElement = null; (this.listeners.blur ?? []).forEach((listener) => listener(event(this))); }
        }
        const event = (target: FakeElement): FakeEvent => {
            const fake: FakeEvent = {
                target, stopped: false, prevented: false,
                stopPropagation: () => { fake.stopped = true; },
                preventDefault: () => { fake.prevented = true; },
            };
            return fake;
        };
        let page: { window: { listeners: Listener[]; addEventListener: (type: string, listener: Listener) => void }; document: { activeElement: FakeElement | null; querySelectorAll: () => FakeElement[] } };
        let input: FakeElement;

        function load(): (target: FakeElement) => FakeEvent {
            input = new FakeElement(true);
            input.setAttribute('data-tus-type-answer-token', token);
            page = {
                window: { listeners: [], addEventListener(type, listener) { if (type === 'click') this.listeners.push(listener); } },
                document: { activeElement: null, querySelectorAll: () => [input] },
            };
            new Function('window', 'document', typeAnswerBridgeScript(token, false))(page.window, page.document);
            return (target) => {
                const click = event(target);
                page.window.listeners.forEach((listener) => listener(click));
                return click;
            };
        }

        it('hides the keyboard and keeps the tap from the card while the box has focus', () => {
            const click = load();
            page.document.activeElement = input;
            const first = click(new FakeElement(false));
            expect(page.document.activeElement).toBeNull();
            expect(first.stopped && first.prevented).toBe(true);
            // The keyboard is away: the next tap reaches the card.
            const second = click(new FakeElement(false));
            expect(second.stopped).toBe(false);
        });

        it('keeps the tap from the card when the focus left the box an instant before it', () => {
            const click = load();
            page.document.activeElement = input;
            input.blur();
            expect(click(new FakeElement(false)).stopped).toBe(true);
        });

        it('leaves taps on the card controls, on the box and without the keyboard alone', () => {
            const click = load();
            expect(click(new FakeElement(false)).stopped).toBe(false);
            page.document.activeElement = input;
            expect(click(new FakeElement(true)).stopped).toBe(false);
            expect(click(input).stopped).toBe(false);
            expect(page.document.activeElement).toBe(input);
        });
    });
});

