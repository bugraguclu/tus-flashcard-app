import { describe, expect, it, vi } from 'vitest';
import {
    PROTECTED_BLOCKED_EVENTS,
    PROTECTED_CONTENT_CSS,
    PROTECTED_CONTENT_SCRIPT,
    installProtectedContentGuards,
} from './protectedContentCss';

type Listener = (event: Event) => void;

function fakeDocument() {
    const listeners = new Map<string, { listener: Listener; capture: boolean }[]>();
    return {
        addEventListener(type: string, listener: Listener, capture?: boolean) {
            listeners.set(type, [...(listeners.get(type) ?? []), { listener, capture: capture === true }]);
        },
        dispatch(type: string, init: Record<string, unknown> = {}) {
            const event = { type, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...init };
            for (const entry of listeners.get(type) ?? []) entry.listener(event as unknown as Event);
            return event;
        },
        listeners,
    };
}

describe('protected content lockdown', () => {
    it('disables selection, callouts and dragging on every node', () => {
        expect(PROTECTED_CONTENT_CSS).toContain('user-select: none !important');
        expect(PROTECTED_CONTENT_CSS).toContain('-webkit-touch-callout: none !important');
        expect(PROTECTED_CONTENT_CSS).toContain('-webkit-user-drag: none !important');
    });

    it('takes images out of the long-press save menu', () => {
        expect(PROTECTED_CONTENT_CSS).toMatch(/img\s*\{[^}]*pointer-events: none !important/);
    });

    it('blanks the document for the print dialog', () => {
        expect(PROTECTED_CONTENT_CSS).toMatch(/@media print\s*\{[^}]*display: none !important/);
    });

    it('cancels every clipboard and selection event in the capture phase', () => {
        for (const event of ['copy', 'cut', 'beforecopy', 'contextmenu', 'dragstart', 'selectstart']) {
            expect(PROTECTED_CONTENT_SCRIPT).toContain(`'${event}'`);
        }
        expect(PROTECTED_CONTENT_SCRIPT).toContain('true);');
    });

    it('intercepts the keyboard shortcuts that copy, print or save', () => {
        expect(PROTECTED_CONTENT_SCRIPT).toContain("key === 'a'");
        expect(PROTECTED_CONTENT_SCRIPT).toContain("key === 'c'");
        expect(PROTECTED_CONTENT_SCRIPT).toContain("key === 'p'");
    });

    it('stays a self-contained IIFE so it can be concatenated into an injection bundle', () => {
        expect(PROTECTED_CONTENT_SCRIPT.startsWith('(function(){')).toBe(true);
        expect(PROTECTED_CONTENT_SCRIPT.endsWith('})();')).toBe(true);
    });
});

describe('protected content guards installed from the host page', () => {
    it('cancels the same clipboard and selection events as the injected script', () => {
        const doc = fakeDocument();
        installProtectedContentGuards(doc);
        for (const name of PROTECTED_BLOCKED_EVENTS) {
            expect(PROTECTED_CONTENT_SCRIPT).toContain(`'${name}'`);
            expect(doc.listeners.get(name)?.every((entry) => entry.capture)).toBe(true);
            expect(doc.dispatch(name).preventDefault).toHaveBeenCalled();
        }
    });

    it('blocks the copy, print and save shortcuts but leaves plain typing alone', () => {
        const doc = fakeDocument();
        installProtectedContentGuards(doc);
        expect(doc.dispatch('keydown', { key: 'C', metaKey: true }).preventDefault).toHaveBeenCalled();
        expect(doc.dispatch('keydown', { key: 'p', ctrlKey: true }).preventDefault).toHaveBeenCalled();
        expect(doc.dispatch('keydown', { key: 'c' }).preventDefault).not.toHaveBeenCalled();
        expect(doc.dispatch('keydown', { key: 'b', metaKey: true }).preventDefault).not.toHaveBeenCalled();
    });
});
