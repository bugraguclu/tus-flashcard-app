import { describe, expect, it } from 'vitest';
import { HOVER_ATTRIBUTE, hoverStyleSheet, installWebHover, isHoverableSize } from './webHover';

const viewport = { width: 1440, height: 900 };

describe('isHoverableSize', () => {
    it('tints rows, buttons and cards', () => {
        expect(isHoverableSize({ width: 920, height: 52 }, viewport)).toBe(true);
        expect(isHoverableSize({ width: 44, height: 44 }, viewport)).toBe(true);
    });

    it('leaves a backdrop that covers the window alone', () => {
        expect(isHoverableSize({ width: 1440, height: 900 }, viewport)).toBe(false);
        expect(isHoverableSize({ width: 1440, height: 600 }, viewport)).toBe(false);
    });

    it('ignores what is not laid out', () => {
        expect(isHoverableSize({ width: 0, height: 0 }, viewport)).toBe(false);
    });
});

// Just enough of the DOM for installWebHover: elements know their nearest control themselves.
type Listener = (event: any) => void;
class FakeTarget {
    listeners = new Map<string, Listener[]>();
    addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    removeEventListener(type: string, listener: Listener) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
    fire(type: string, event: object) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}
class FakeElement extends FakeTarget {
    attributes = new Map<string, string>();
    disabled = false;
    textContent = '';
    removed = false;
    constructor(public control: FakeElement | null = null, public size = { width: 100, height: 44 }) {
        super();
    }
    closest() { return this.control; }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    getBoundingClientRect() { return this.size; }
    remove() { this.removed = true; }
}

function fakeDocument() {
    const doc = new FakeTarget() as FakeTarget & Record<string, any>;
    const styles: FakeElement[] = [];
    doc.head = { appendChild: (element: FakeElement) => styles.push(element) };
    doc.documentElement = new FakeTarget();
    doc.defaultView = { innerWidth: viewport.width, innerHeight: viewport.height };
    doc.createElement = () => new FakeElement();
    return { doc, styles, over: (target: FakeElement, pointerType = 'mouse') => doc.fire('pointerover', { target, pointerType }) };
}

function control(size?: { width: number; height: number }) {
    const element = new FakeElement(null, size);
    element.control = element;
    return element;
}

describe('installWebHover', () => {
    it('marks the innermost control under the mouse and moves with it', () => {
        const { doc, over } = fakeDocument();
        const row = control({ width: 900, height: 52 });
        const label = new FakeElement(row);
        const more = control();
        const stop = installWebHover(doc as unknown as Document, 'rgba(0, 0, 0, 0.045)');

        over(label);
        expect(row.hasAttribute(HOVER_ATTRIBUTE)).toBe(true);
        over(more);
        expect(more.hasAttribute(HOVER_ATTRIBUTE)).toBe(true);
        expect(row.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);
        stop();
        expect(more.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);
    });

    it('skips touch, disabled controls and backdrops, and clears on press', () => {
        const { doc, over } = fakeDocument();
        const button = control();
        const disabled = control();
        disabled.setAttribute('aria-disabled', 'true');
        const backdrop = control({ width: viewport.width, height: viewport.height });
        installWebHover(doc as unknown as Document, 'rgba(0, 0, 0, 0.045)');

        over(button, 'touch');
        expect(button.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);
        over(disabled);
        expect(disabled.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);
        over(backdrop);
        expect(backdrop.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);

        over(button);
        expect(button.hasAttribute(HOVER_ATTRIBUTE)).toBe(true);
        doc.fire('pointerdown', {});
        expect(button.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);
    });

    it('adds one style sheet for the theme and takes it away again', () => {
        const { doc, styles } = fakeDocument();
        const stop = installWebHover(doc as unknown as Document, 'rgba(0, 0, 0, 0.045)');
        expect(styles).toHaveLength(1);
        expect(styles[0].textContent).toContain('rgba(0, 0, 0, 0.045)');
        stop();
        expect(styles[0].removed).toBe(true);
    });

    it('only tints under a fine pointer that can hover', () => {
        expect(hoverStyleSheet('red')).toContain('@media (hover: hover) and (pointer: fine)');
    });

    it('tints the visible shape of a button marked with one, not its whole box', () => {
        const sheet = hoverStyleSheet('red');
        expect(sheet).toContain('[data-tus-hover]:not(:has([data-focus-face]))');
        expect(sheet).toContain('[data-tus-hover] [data-focus-face]');
    });

    it('brings thin scroll bars back for a mouse when given their colour', () => {
        expect(hoverStyleSheet('red')).not.toContain('scrollbar-width');
        const sheet = hoverStyleSheet('red', 'gray');
        expect(sheet).toContain('[class*="r-scrollbarWidth-"] { scrollbar-width: thin !important; scrollbar-color: gray transparent !important; }');
        expect(sheet.indexOf('scrollbar-width')).toBeLessThan(sheet.lastIndexOf('}'));
    });
});
