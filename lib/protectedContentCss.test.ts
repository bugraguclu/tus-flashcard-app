import { describe, expect, it } from 'vitest';
import { PROTECTED_CONTENT_CSS, PROTECTED_CONTENT_SCRIPT } from './protectedContentCss';

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
