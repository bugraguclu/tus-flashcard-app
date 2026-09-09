// The toolbar inserts HTML into a note field, so what it produces has to survive the field
// sanitizer unchanged — anything the sanitizer rewrites is markup the user would silently lose.
// Every insertion here is therefore asserted twice: once for its shape, once for what
// sanitizeUntrustedHtml leaves of it.

import { describe, expect, it } from 'vitest';
import {
    blockFormatValue,
    calculateToolbarButtonWidth,
    calloutHtml,
    EDITOR_BLOCK_STYLES,
    EDITOR_CALLOUTS,
    EDITOR_TOOL_KEYS,
    EDITOR_TOOLBAR_TABS,
    editorToolKeysForTab,
    escapeInsertedHtml,
    linkHtml,
    normalizeLinkUrl,
    tableHtml,
    EDITOR_FONT_SIZES,
    changeTextCase,
    fontFamilyStyleValue,
    isFontSizeAtLimit,
    lineHeightStyleValue,
    nextCaseMode,
    stepFontSize,
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

describe('toolbar layout', () => {
    it('puts every tool on exactly one tab', () => {
        const placed = EDITOR_TOOLBAR_TABS.flatMap((tab) => [...editorToolKeysForTab(tab.id)]);

        expect(new Set(placed).size).toBe(placed.length);
        expect([...placed].sort()).toEqual([...EDITOR_TOOL_KEYS].sort());
    });

    it('gives every tab a tool and every tab a name in both languages', () => {
        EDITOR_TOOLBAR_TABS.forEach((tab) => {
            expect(editorToolKeysForTab(tab.id).length).toBeGreaterThan(0);
            expect(tab.tr.trim()).not.toBe('');
            expect(tab.en.trim()).not.toBe('');
        });
    });

    it('offers the whole word-processor set the editor promises', () => {
        // Losing one of these to a refactor is exactly the kind of silent regression the toolbar
        // cannot afford, so the promise is asserted rather than left to review.
        const required = [
            'undo', 'redo', 'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript',
            'color', 'removeFormat', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
            'p', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'listBullet', 'listNumber', 'indent', 'outdent',
            'rule', 'table', 'link',
        ];
        required.forEach((key) => expect(EDITOR_TOOL_KEYS).toContain(key));
    });

    it('names a Styles-tab key for every block format the tab applies', () => {
        EDITOR_BLOCK_STYLES.forEach((style) => {
            expect(editorToolKeysForTab('styles')).toContain(style.key);
        });
    });

    it('leads Home with history, the way a ribbon does', () => {
        expect(editorToolKeysForTab('home').slice(0, 2)).toEqual(['undo', 'redo']);
    });
});

describe('toolbar button width calculation and peeking affordance', () => {
    it('shows 50% peek of the 9th item across standard iPhone screen sizes', () => {
        // iPhone SE (375pt), iPhone 12/13/14 (390pt), iPhone 14 Pro / 15 / 16 (393pt),
        // iPhone 16 Pro (402pt), iPhone Plus/Pro Max (430pt)
        const phoneWidths = [375, 390, 393, 402, 430];
        const homeItemCount = 15;

        for (const width of phoneWidths) {
            const { buttonWidth, isPeeking } = calculateToolbarButtonWidth({
                screenWidth: width,
                toolbarItemCount: homeItemCount,
                isScrollable: true,
            });

            expect(isPeeking).toBe(true);
            expect(buttonWidth).toBeGreaterThanOrEqual(44);

            // 8 full buttons fit before the 9th button
            const widthBefore9th = 8 * buttonWidth;
            expect(widthBefore9th).toBeLessThan(width);

            // Visible portion of 9th button at the screen edge
            const visibleOf9th = width - widthBefore9th;
            const peekPercentage = visibleOf9th / buttonWidth;

            // Must peek out between 47% and 53% (close to 50% cut-off)
            expect(peekPercentage).toBeGreaterThanOrEqual(0.47);
            expect(peekPercentage).toBeLessThanOrEqual(0.53);
        }
    });

    it('returns standard 44pt width when toolbar fits without scrolling', () => {
        const result = calculateToolbarButtonWidth({
            screenWidth: 390,
            toolbarItemCount: 6, // 6 * 44 = 264 <= 390
            isScrollable: true,
        });

        expect(result.isPeeking).toBe(false);
        expect(result.buttonWidth).toBe(44);
    });

    it('returns standard 44pt width when toolbar wrapping is enabled', () => {
        const result = calculateToolbarButtonWidth({
            screenWidth: 390,
            toolbarItemCount: 15,
            isScrollable: false,
        });

        expect(result.isPeeking).toBe(false);
        expect(result.buttonWidth).toBe(44);
    });

    it('returns standard 44pt width on tablets / wide screens (>= 600)', () => {
        const result = calculateToolbarButtonWidth({
            screenWidth: 768,
            toolbarItemCount: 15,
            isScrollable: true,
        });

        expect(result.isPeeking).toBe(false);
        expect(result.buttonWidth).toBe(44);
    });
});

describe('font size ladder', () => {
    it('steps up and down the ladder', () => {
        expect(stepFontSize('medium', 1)).toBe('large');
        expect(stepFontSize('medium', -1)).toBe('small');
    });

    it('stops at the ends instead of wrapping', () => {
        const largest = EDITOR_FONT_SIZES[EDITOR_FONT_SIZES.length - 1]!;
        const smallest = EDITOR_FONT_SIZES[0]!;
        expect(stepFontSize(largest, 1)).toBe(largest);
        expect(stepFontSize(smallest, -1)).toBe(smallest);
        expect(isFontSizeAtLimit(largest, 1)).toBe(true);
        expect(isFontSizeAtLimit(largest, -1)).toBe(false);
    });

    it('treats an unknown or missing size as medium', () => {
        expect(stepFontSize(null, 1)).toBe('large');
        expect(stepFontSize('14pt', -1)).toBe('small');
    });
});

describe('font family and line spacing values', () => {
    it('writes no font-family for the default entry', () => {
        expect(fontFamilyStyleValue('default')).toBeNull();
    });

    it('ends every named stack in a generic family', () => {
        for (const key of ['sans', 'serif', 'mono', 'rounded'] as const) {
            const css = fontFamilyStyleValue(key);
            expect(css).toBeTruthy();
            expect(css).toMatch(/(sans-serif|serif|monospace)$/);
        }
    });

    it('keeps line-height unitless and falls back to single spacing', () => {
        expect(lineHeightStyleValue(1.15)).toBe('1.15');
        expect(lineHeightStyleValue(2)).toBe('2');
        expect(lineHeightStyleValue(3.7)).toBe('1');
    });
});

describe('changeTextCase', () => {
    it('maps both Turkish i letters the way Turkish requires', () => {
        // The whole point of passing a locale: English casing corrupts these words.
        expect(changeTextCase('istanbul', 'upper')).toBe('\u0130STANBUL');
        expect(changeTextCase('\u0131s\u0131', 'upper')).toBe('ISI');
        expect(changeTextCase('\u0130STANBUL', 'lower')).toBe('istanbul');
        expect(changeTextCase('ISI', 'lower')).toBe('\u0131s\u0131');
    });

    it('differs from the English mapping, proving the locale is honoured', () => {
        expect(changeTextCase('istanbul', 'upper')).not.toBe('istanbul'.toUpperCase());
        expect(changeTextCase('istanbul', 'upper', 'en')).toBe('ISTANBUL');
    });

    it('capitalises each word for title case', () => {
        expect(changeTextCase('genel cerrahi notlar\u0131', 'title')).toBe('Genel Cerrahi Notlar\u0131');
        expect(changeTextCase('\u0131s\u0131 dengesi', 'title')).toBe('Is\u0131 Dengesi');
    });

    it('capitalises only sentence openings for sentence case', () => {
        expect(changeTextCase('BU B\u0130R TEST. \u0130K\u0130NC\u0130 C\u00dcMLE!', 'sentence'))
            .toBe('Bu bir test. \u0130kinci c\u00fcmle!');
    });

    it('is its own inverse for toggle case', () => {
        const source = 'Mikrobiyoloji \u0130SI';
        expect(changeTextCase(changeTextCase(source, 'toggle'), 'toggle')).toBe(source);
    });

    it('cycles the way Word Shift+F3 does', () => {
        expect(nextCaseMode(null)).toBe('sentence');
        expect(nextCaseMode('sentence')).toBe('lower');
        expect(nextCaseMode('lower')).toBe('upper');
        expect(nextCaseMode('upper')).toBe('sentence');
    });
});
