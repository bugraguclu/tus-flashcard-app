import { describe, expect, it } from 'vitest';
import { deckDescriptionHtml, deckDescriptionRuns, markdownDescriptionHtml } from './deckDescription';
import { deckDescriptionText } from './deckNavigation';

describe('deckDescriptionRuns', () => {
    it('keeps bold, italic, underline, safe links and line breaks', () => {
        expect(deckDescriptionRuns('<b>Kalp</b> ve <i>damar</i><br><a href="https://ornek.org/a?b=1&amp;c=2">kaynak</a>')).toEqual([
            { text: 'Kalp', bold: true },
            { text: ' ve ' },
            { text: 'damar', italic: true },
            { text: '\n' },
            { text: 'kaynak', href: 'https://ornek.org/a?b=1&c=2' },
        ]);
    });

    it('drops scripts, styles, comments and non-http links, and returns nothing for an empty description', () => {
        expect(deckDescriptionRuns('<script>alert(1)</script><style>p{}</style><!-- x --><a href="javascript:x">tık</a>')).toEqual([{ text: 'tık' }]);
        expect(deckDescriptionRuns('  <div></div> ')).toEqual([]);
    });

    it('gives list items a bullet each and decodes numeric entities', () => {
        expect(deckDescriptionRuns('<ul><li>Bir</li><li>&#304;ki</li></ul>')).toEqual([{ text: '• Bir\n• İki' }]);
    });
});

describe('markdownDescriptionHtml (Anki "Interpret as Markdown")', () => {
    it('renders the CommonMark subset a description uses', () => {
        const runs = deckDescriptionRuns(markdownDescriptionHtml('# Kardiyoloji\n\n**Kalp** ve *damar*\nbir paragraf.\n\n- [Anki](https://docs.ankiweb.net)\n2. ikinci'));
        expect(runs).toEqual([
            { text: 'Kardiyoloji', bold: true },
            { text: '\n' },
            { text: 'Kalp', bold: true },
            { text: ' ve ' },
            { text: 'damar', italic: true },
            { text: ' bir paragraf.\n• ' },
            { text: 'Anki', href: 'https://docs.ankiweb.net' },
            { text: '\n2. ikinci' },
        ]);
    });

    it('keeps a hard line break made with two trailing spaces', () => {
        expect(deckDescriptionText(markdownDescriptionHtml('bir  \niki'))).toBe('bir\niki');
    });
});

describe('deckDescriptionHtml (Anki Overview._desc)', () => {
    it('shows the fixed explanation for a filtered deck and Markdown only when asked', () => {
        expect(deckDescriptionHtml({ isFiltered: true, description: 'Filtered deck' }, 'Özel deste')).toBe('Özel deste');
        expect(deckDescriptionHtml({ description: '**a**' }, '')).toBe('**a**');
        expect(deckDescriptionHtml({ description: '**a**', descriptionMarkdown: true }, '')).toBe('<div><b>a</b></div>');
    });
});
