// The toolbar inserts HTML into a note field, so what it produces has to survive the field
// sanitizer unchanged — anything the sanitizer rewrites is markup the user would silently lose.
// Every insertion here is therefore asserted twice: once for its shape, once for what
// sanitizeUntrustedHtml leaves of it.

import { describe, expect, it } from 'vitest';
import {
    blockFormatValue,
    calloutHtml,
    EDITOR_BLOCK_STYLES,
    EDITOR_CALLOUTS,
    EDITOR_TOOLBAR_TABS,
    escapeInsertedHtml,
    linkHtml,
    normalizeLinkUrl,
    tableHtml,
} from './editorToolbar';
import { sanitizeUntrustedHtml } from './templates';

describe('editor toolbar structure', () => {
    it('names every tab in both languages', () => {
        expect(EDITOR_TOOLBAR_TABS.map((tab) => tab.id)).toEqual(['home', 'styles', 'insert']);
        for (const tab of EDITOR_TOOLBAR_TABS) {
            expect(tab.tr.length).toBeGreaterThan(0);
            expect(tab.en.length).toBeGreaterThan(0);
        }
    });

    it('wraps block tags the way execCommand expects them', () => {
        expect(blockFormatValue('h2')).toBe('<h2>');
        expect(blockFormatValue('blockquote')).toBe('<blockquote>');
        expect(blockFormatValue('pre')).toBe('<pre>');
        // An unknown key must still produce a valid block rather than a broken command value.
        expect(blockFormatValue('nope' as never)).toBe('<p>');
    });

    it('offers a block style for every key it advertises', () => {
        for (const style of EDITOR_BLOCK_STYLES) {
            expect(blockFormatValue(style.key)).toBe(`<${style.tag}>`);
        }
    });
});

describe('table insertion', () => {
    it('builds a header row plus body rows', () => {
        const html = tableHtml(2, 2);
        expect(html.match(/<tr>/g)).toHaveLength(2);
        expect(html.match(/<th\b/g)).toHaveLength(2);
        expect(html.match(/<td\b/g)).toHaveLength(2);

        const bigger = tableHtml(3, 3);
        expect(bigger.match(/<th\b/g)).toHaveLength(3);
        expect(bigger.match(/<td\b/g)).toHaveLength(6);
    });

    it('leaves a paragraph after the table so the caret can escape it', () => {
        expect(tableHtml(2, 2).endsWith('<p><br></p>')).toBe(true);
    });

    it('clamps a dimension that would be unusable on a phone', () => {
        expect(tableHtml(0, 0).match(/<tr>/g)).toHaveLength(1);
        expect(tableHtml(99, 99).match(/<tr>/g)).toHaveLength(8);
        expect(tableHtml(Number.NaN, Number.NaN).match(/<tr>/g)).toHaveLength(2);
    });

    it('survives the field sanitizer with its borders intact', () => {
        const html = tableHtml(2, 2);
        expect(sanitizeUntrustedHtml(html)).toBe(html);
    });
});

describe('callout insertion', () => {
    it('renders each tone with its own colours', () => {
        for (const tone of EDITOR_CALLOUTS) {
            const html = calloutHtml(tone.key);
            expect(html).toContain(tone.border);
            expect(html).toContain(tone.background);
        }
    });

    it('falls back to the first tone for an unknown key', () => {
        expect(calloutHtml('unknown' as never)).toContain(EDITOR_CALLOUTS[0].border);
    });

    it('survives the field sanitizer', () => {
        const html = calloutHtml('warning');
        expect(sanitizeUntrustedHtml(html)).toBe(html);
    });
});

describe('link insertion', () => {
    it('assumes https for a bare domain, which is what people type', () => {
        expect(normalizeLinkUrl('docs.ankiweb.net')).toBe('https://docs.ankiweb.net');
        expect(normalizeLinkUrl('  example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    });

    it('keeps a scheme the note may legitimately carry', () => {
        expect(normalizeLinkUrl('https://example.com')).toBe('https://example.com');
        expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com');
        expect(normalizeLinkUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    });

    it('refuses a scheme that would execute or read local state', () => {
        expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
        expect(normalizeLinkUrl('JaVaScRiPt:alert(1)')).toBeNull();
        expect(normalizeLinkUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
        expect(normalizeLinkUrl('file:///etc/passwd')).toBeNull();
        expect(normalizeLinkUrl('')).toBeNull();
        expect(normalizeLinkUrl('   ')).toBeNull();
        // Whitespace or quotes would break out of the attribute this value is written into.
        expect(normalizeLinkUrl('https://a.com" onclick="alert(1)')).toBeNull();
        expect(normalizeLinkUrl('java\nscript:alert(1)')).toBeNull();
    });

    it('escapes the label so it cannot close the anchor it sits in', () => {
        const html = linkHtml('example.com', '<img src=x onerror=alert(1)>');
        expect(html).toBe('<a href="https://example.com" rel="noopener noreferrer">'
            + '&lt;img src=x onerror=alert(1)&gt;</a>');
        expect(sanitizeUntrustedHtml(html!)).toBe(html);
    });

    it('falls back to the URL when no label was given', () => {
        expect(linkHtml('example.com', '   ')).toContain('>https://example.com</a>');
    });

    it('returns null rather than an anchor the sanitizer would blank out', () => {
        expect(linkHtml('javascript:alert(1)', 'tıkla')).toBeNull();
    });

    it('escapes every character that could end an attribute or a tag', () => {
        expect(escapeInsertedHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#039;');
    });
});
