import { describe, expect, it } from 'vitest';
import type { Note, NoteType } from './models';
import { BUILTIN_NOTE_TYPES } from './models';
import {
    clozeFieldIndex,
    countCardsForNote,
    extractClozeNumbers,
    getTypeAnswerField,
    renderCardHtml,
    renderTemplate,
    renderTypeAnswerDiff,
    typeAnswerPlainText,
    shouldGenerateCard,
} from './templates';

describe('clozeFieldIndex', () => {
    function clozeNoteType(fieldNames: string[], clozeField: string): NoteType {
        return {
            id: 99,
            name: 'Custom Cloze',
            kind: 'cloze',
            fields: fieldNames.map((name, ord) => ({ name, ord, sticky: false, rtl: false })),
            templates: [{ name: 'Cloze', ord: 0, qfmt: `{{cloze:${clozeField}}}`, afmt: `{{cloze:${clozeField}}}` }],
            css: '',
            sortFieldIdx: 0,
            mod: 0,
        };
    }

    it('resolves the cloze field from the template, not a hardcoded name', () => {
        // Field is named "Metin", not "Text" — the old hardcoded lookup returned -1 here.
        const nt = clozeNoteType(['Metin', 'Ekstra'], 'Metin');
        expect(clozeFieldIndex(nt)).toBe(0);

        const nt2 = clozeNoteType(['Ekstra', 'Metin'], 'Metin');
        expect(clozeFieldIndex(nt2)).toBe(1);
    });

    it('counts cards for a custom-named cloze field instead of generating none', () => {
        const nt = clozeNoteType(['Metin', 'Ekstra'], 'Metin');
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 99, mod: 0, usn: -1, tags: [],
            fields: ['{{c1::a}} {{c2::b}}', ''], sfld: '', csum: 0, flags: 0,
        };
        expect(countCardsForNote(nt, note)).toBe(2);
    });

    it('recognizes AnKing edit:cloze templates', () => {
        const nt = clozeNoteType(['Text', 'Extra'], 'Text');
        nt.templates[0].qfmt = '{{edit:cloze:Text}}';
        expect(clozeFieldIndex(nt)).toBe(0);

        const html = renderCardHtml(nt, {
            id: 3, guid: 'anking', noteTypeId: nt.id, mod: 0, usn: -1, tags: [],
            fields: ['Kalp {{c1::dört}} odacıklıdır', ''], sfld: '', csum: 0, flags: 0,
        }, 0, 'question');
        // Anki chains filters right-to-left, so `cloze` runs and the unknown `edit` is skipped.
        expect(html).toContain('<span class="cloze" data-cloze="dört" data-ordinal="1">[...]</span>');
        expect(html).not.toContain('edit:cloze');
    });
});

describe('templates', () => {
    it('renders nested positive/negative conditionals correctly', () => {
        const template = '{{#A}}A{{#B}}B{{/B}}{{^B}}NB{{/B}}{{/A}}{{^A}}NA{{/A}}';

        expect(renderTemplate(template, { fields: { A: '1', B: 'x' } })).toBe('AB');
        expect(renderTemplate(template, { fields: { A: '1', B: '' } })).toBe('ANB');
        expect(renderTemplate(template, { fields: { A: '', B: 'x' } })).toBe('NA');
    });

    it('sanitizes svg/event-handler/javascript/data-uri vectors while preserving safe html', () => {
        const basic = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!;
        const note: Note = {
            id: 1,
            guid: 'abc',
            noteTypeId: basic.id,
            mod: 0,
            usn: -1,
            tags: [],
            fields: [
                '<b>safe</b> <svg onload="alert(1)"><script>alert(1)</script></svg> <img src="data:image/svg+xml;base64,PHN2Zy8+" onerror="alert(1)" /> <a href="javascript:alert(1)">x</a> <img src="data:image/png;base64,AAAA" />',
                'back',
            ],
            sfld: 'safe',
            csum: 0,
            flags: 0,
        };

        const html = renderCardHtml(basic as NoteType, note, 0, 'question');

        expect(html).toContain('<b>safe</b>');
        expect(html).toContain('data:image/png;base64,AAAA');

        expect(html.toLowerCase()).not.toContain('<script');
        expect(html.toLowerCase()).not.toContain('<svg');
        expect(html.toLowerCase()).not.toContain('onerror=');
        expect(html.toLowerCase()).not.toContain('onload=');
        expect(html.toLowerCase()).not.toContain('javascript:');
        expect(html.toLowerCase()).not.toContain('data:image/svg+xml');
    });

    it('blocks encoded, malformed and template-level active content', () => {
        const basic = structuredClone(BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!) as NoteType;
        basic.templates[0].qfmt = `<script<script>>alert(1)</script>{{${basic.fields[0].name}}}<math><maction actiontype="statusline">x</maction></math>`;
        basic.css = '@import url(https://evil.example/x.css); .card{background:url(javascript:alert(1))}';
        const note: Note = {
            id: 2,
            guid: 'encoded',
            noteTypeId: basic.id,
            mod: 0,
            usn: -1,
            tags: [],
            fields: [
                '<img src="x" o&#110;error="alert(1)"><a href="java&#x73;cript&colon;alert(1)">safe label</a>',
                'back',
            ],
            sfld: 'safe label',
            csum: 0,
            flags: 0,
        };

        const html = renderCardHtml(basic, note, 0, 'question').toLowerCase();

        expect(html).toContain('safe label');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('<math');
        expect(html).not.toContain('onerror');
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('@import');
        expect(html).not.toContain('evil.example');
    });

    it('renders hint and unknown add-on filters the way a stock Anki install does', () => {
        const rendered = renderTemplate(
            '{{#Extra}}{{hint:Extra}}{{/Extra}} {{#Tags}}{{clickable::Tags}}{{/Tags}}',
            { fields: { Extra: '<b>Açıklama</b>' }, tags: 'kardiyoloji tus' },
        );

        // Anki's own hint markup: a link whose target div starts hidden. The reviewer binds the
        // reveal, so the note type's `a.hint` / `.hint` rules style exactly what their author meant.
        expect(rendered).toMatch(/<a class=hint href="#" data-hint-target="hint[0-9a-f]{8}" draggable=false>Extra<\/a>/);
        expect(rendered).toMatch(/<div id="hint[0-9a-f]{8}" class=hint style="display: none"><b>Açıklama<\/b><\/div>/);
        // `clickable` is an add-on filter. Without the add-on Anki skips it and prints the field.
        expect(rendered).toContain('kardiyoloji tus');
        expect(rendered).not.toContain('{{hint:');
        expect(rendered).not.toContain('{{clickable:');
    });
});

describe('typed-answer (type:Field)', () => {
    const typeAnswerNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 8)!;

    it('getTypeAnswerField finds the field name from a template qfmt', () => {
        expect(getTypeAnswerField(typeAnswerNoteType.templates[0])).toBe('Back');
        expect(getTypeAnswerField(BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!.templates[0])).toBeNull();
        expect(getTypeAnswerField(undefined)).toBeNull();
    });

    it('renders no live input on the question side (WebView JS is disabled, so it would be inert)', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 8, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Doğru cevap'], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const html = renderCardHtml(typeAnswerNoteType, note, 0, 'question');
        expect(html).not.toContain('<input');
        expect(html).not.toContain('Doğru cevap');
    });

    it('inserts only the reviewer-owned input at the template marker when requested', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 8, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Doğru cevap'], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const html = renderCardHtml(typeAnswerNoteType, note, 0, 'question', {
            typeAnswerInput: {
                token: 'runtime-token',
                placeholder: 'Yanıtınızı <yazın>',
            },
        });

        expect(html).toContain('id="typeans"');
        expect(html).toContain('data-tus-type-answer-token="runtime-token"');
        expect(html).toContain('Yanıtınızı &lt;yazın&gt;');
        expect(html).not.toContain('Doğru cevap');
        expect(html).not.toContain('oninput=');
        expect(html).not.toContain('onkeydown=');
    });

    it('renders at most one in-card input when a malformed template has multiple type markers', () => {
        const noteType = structuredClone(typeAnswerNoteType);
        noteType.templates[0].qfmt = '{{Front}}{{type:Back}}{{type:Front}}';
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 8, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Doğru cevap'], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const html = renderCardHtml(noteType, note, 0, 'question', {
            typeAnswerInput: { token: 'runtime-token', placeholder: 'Yanıt' },
        });

        expect(html.match(/<input\b/g)).toHaveLength(1);
    });

    it('renders the plain correct answer on the answer side when nothing was typed yet', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 8, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Doğru cevap'], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const html = renderCardHtml(typeAnswerNoteType, note, 0, 'answer');
        expect(html).toContain('Doğru cevap');
        expect(html).not.toContain('class="typeGood"');
    });

    it('diffs a typed answer against the real one on the answer side', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 8, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'mitoz'], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const exact = renderCardHtml(typeAnswerNoteType, note, 0, 'answer', { typedAnswer: 'mitoz' });
        expect(exact).toContain('class="typeGood"');
        expect(exact).not.toContain('class="typeBad"');

        const wrong = renderCardHtml(typeAnswerNoteType, note, 0, 'answer', { typedAnswer: 'mayoz' });
        expect(wrong).toContain('class="typeanswer"');
        expect(wrong).toContain('class="typed"');
        expect(wrong).toContain('class="correct"');
    });
});

describe('omitFrontSide (stacked question+answer layouts)', () => {
    const basicNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!;
    const note: Note = {
        id: 1, guid: 'g', noteTypeId: 1, mod: 0, usn: -1, tags: [],
        fields: ['Soru metni', 'Cevap metni'], sfld: 'Soru metni', csum: 0, flags: 0,
    };

    it('renders the answer without the question or the hr separator', () => {
        const html = renderCardHtml(basicNoteType, note, 0, 'answer', { omitFrontSide: true });
        expect(html).toContain('Cevap metni');
        expect(html).not.toContain('Soru metni');
        expect(html).not.toContain('<hr');
    });

    it('keeps the full Anki back (FrontSide + answer) without the option', () => {
        const html = renderCardHtml(basicNoteType, note, 0, 'answer');
        expect(html).toContain('Soru metni');
        expect(html).toContain('Cevap metni');
        expect(html).toContain('<hr id=answer>');
    });

    it('still renders the ANSWER side of a cloze (frontSide presence drives side detection)', () => {
        const cloze = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 3)!;
        const clozeNote: Note = {
            id: 2, guid: 'g2', noteTypeId: 3, mod: 0, usn: -1, tags: [],
            fields: ['{{c1::mitokondri}} enerji üretir', ''], sfld: '', csum: 0, flags: 0,
        };
        const html = renderCardHtml(cloze, clozeNote, 0, 'answer', { omitFrontSide: true });
        expect(html).toContain('<span class="cloze" data-ordinal="1">mitokondri</span>');
        expect(html).not.toContain('[...]');
    });
});

describe('Anki cloze parity (rslib/src/cloze.rs)', () => {
    const clozeType = (): NoteType => ({
        id: 3, name: 'Cloze', kind: 'cloze',
        fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }],
        templates: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
        css: '', sortFieldIdx: 0, mod: 0,
    });
    const render = (text: string, ord: number, side: 'question' | 'answer') => renderCardHtml(
        clozeType(),
        { id: 1, guid: 'g', noteTypeId: 3, mod: 0, usn: -1, tags: [], fields: [text], sfld: '', csum: 0, flags: 0 },
        0, side, { clozeOrd: ord },
    );

    it('marks the other deletions as cloze-inactive instead of dropping their markup', () => {
        const html = render('{{c1::bir}} ve {{c2::iki}}', 1, 'question');
        expect(html).toContain('<span class="cloze" data-cloze="bir" data-ordinal="1">[...]</span>');
        expect(html).toContain('<span class="cloze-inactive" data-ordinal="2">iki</span>');
    });

    it('shows a cloze hint in the brackets', () => {
        expect(render('{{c1::asetilkolin::ileti maddesi}}', 1, 'question'))
            .toContain('data-ordinal="1">[ileti maddesi]</span>');
    });

    it('supports multi-ordinal deletions', () => {
        expect(extractClozeNumbers('{{c1,3::x}} {{c2::y}}')).toEqual([1, 2, 3]);
        expect(render('{{c1,3::x}}', 3, 'answer')).toContain('<span class="cloze" data-ordinal="1,3">x</span>');
    });

    it('nests deletions the way Anki does', () => {
        const html = render('{{c1::dış {{c2::iç}}}}', 2, 'question');
        expect(html).toContain('<span class="cloze-inactive" data-ordinal="1">');
        expect(html).toContain('<span class="cloze" data-cloze="iç" data-ordinal="2">[...]</span>');
    });

    it('leaves an unclosed deletion as literal text', () => {
        const html = render('Yaş &lt; {{c1::60}} ve {{c1::yatmıyor}} olma<div>', 1, 'question');
        expect(html).toContain('data-ordinal="1">[...]</span>');
        expect(extractClozeNumbers('{{c1::kapanmamış')).toEqual([]);
        expect(render('{{c1::kapanmamış', 1, 'question')).toContain('{{c1::kapanmamış');
    });

    it('recovers the legacy editor typo that splits the cloze delimiter around an emphasis tag', () => {
        const html = render('{{c1:<b>:ağızdan ağıza solunum</b>}}', 1, 'answer');
        expect(html).toContain('<span class="cloze" data-ordinal="1"><b>ağızdan ağıza solunum</b></span>');
        expect(html).not.toContain('{{c1:');
    });

    it('generates one card for a cloze note that carries no deletion at all', () => {
        const note: Note = {
            id: 9, guid: 'g', noteTypeId: 3, mod: 0, usn: -1, tags: [],
            fields: ['deletion missing'], sfld: '', csum: 0, flags: 0,
        };
        expect(countCardsForNote(clozeType(), note)).toBe(1);
    });
});

const clozeNoteTypeFor = (qfmt: string): NoteType => ({
    id: 3, name: 'Cloze', kind: 'cloze',
    fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }],
    templates: [{ name: 'Cloze', ord: 0, qfmt, afmt: qfmt }],
    css: '', sortFieldIdx: 0, mod: 0,
});

describe('Anki template parity (rslib/src/template.rs)', () => {
    it('applies chained filters nearest-to-the-field first and skips unknown ones', () => {
        const rendered = renderTemplate('{{unknownAddon:text:Front}}', {
            fields: { Front: '<b>kalp</b> kası' },
        });
        expect(rendered).toBe('kalp kası');
    });

    it('provides Deck, Subdeck, Card, Type and CardFlag', () => {
        const rendered = renderTemplate('{{Deck}}|{{Subdeck}}|{{Card}}|{{Type}}|{{CardFlag}}', {
            fields: {}, deckName: 'BKA TUS::Dahiliye::Kardiyoloji', cardName: 'Kart 1',
            typeName: 'Cloze', cardFlag: 2,
        });
        expect(rendered).toBe('BKA TUS::Dahiliye::Kardiyoloji|Kardiyoloji|Kart 1|Cloze|flag2');
    });

    it('renders furigana, kana and kanji from Anki ruby syntax', () => {
        expect(renderTemplate('{{furigana:F}}', { fields: { F: '漢字[かんじ]' } }))
            .toBe('<ruby><rb>漢字</rb><rt>かんじ</rt></ruby>');
        expect(renderTemplate('{{kana:F}}', { fields: { F: '漢字[かんじ]' } })).toBe('かんじ');
        expect(renderTemplate('{{kanji:F}}', { fields: { F: '漢字[かんじ]' } })).toBe('漢字');
    });

    it('keeps a template <style> block, which is how shared decks hide their own chrome', () => {
        const nt = structuredClone(BUILTIN_NOTE_TYPES.find((n) => n.id === 1)!) as NoteType;
        nt.templates[0].qfmt = '<style>#widget{display:none;}</style><div id="widget">x</div>{{Front}}';
        const html = renderCardHtml(nt, {
            id: 4, guid: 'g', noteTypeId: nt.id, mod: 0, usn: -1, tags: [],
            fields: ['soru', 'cevap'], sfld: 'soru', csum: 0, flags: 0,
        }, 0, 'question');
        expect(html).toContain('#widget{display:none;}');
        expect(html).toContain('<div id="widget">x</div>');
    });

    it('does not let attribute-looking text inside an attribute value corrupt the tag', () => {
        // The active cloze's answer is parked in data-cloze, and shared decks routinely wrap it in
        // `<span style="…">`. A sanitizer that scans raw text rather than the attribute list used
        // to rewrite that inner `style=` and shred the surrounding tag.
        const nt = clozeNoteTypeFor('{{cloze:Text}}');
        const html = renderCardHtml(nt, {
            id: 6, guid: 'g', noteTypeId: nt.id, mod: 0, usn: -1, tags: [],
            fields: ['{{c1::<span style="color: var(--field-fg)">%70</span>}}'], sfld: '', csum: 0, flags: 0,
        }, 0, 'question', { clozeOrd: 1 });

        expect(html).toContain('<span class="cloze" data-cloze="&lt;span style=&quot;color: var(--field-fg)&quot;&gt;%70&lt;/span&gt;" data-ordinal="1">[...]</span>');
    });

    it('builds Anki document classes: platform on the outside, card cardN on the card', () => {
        const nt = BUILTIN_NOTE_TYPES.find((n) => n.id === 1)! as NoteType;
        const html = renderCardHtml(nt, {
            id: 5, guid: 'g', noteTypeId: nt.id, mod: 0, usn: -1, tags: [],
            fields: ['soru', 'cevap'], sfld: 'soru', csum: 0, flags: 0,
        }, 0, 'question', { platformClasses: 'mobile iphone js', nightMode: true });
        expect(html).toContain('<div class="mobile iphone js">');
        expect(html).toContain('<div class="card card1 side-question nightMode night_mode">');
        expect(html).toContain('<div id="qa" dir="auto">');
    });
});

describe('field sanitizer (attribute-aware rewrite)', () => {
    const basic = () => structuredClone(BUILTIN_NOTE_TYPES.find((n) => n.id === 1)!) as NoteType;
    const render = (front: string, nt: NoteType = basic()) => renderCardHtml(nt, {
        id: 1, guid: 'g', noteTypeId: nt.id, mod: 0, usn: -1, tags: [],
        fields: [front, 'back'], sfld: '', csum: 0, flags: 0,
    }, 0, 'question');

    it.each([
        ['event handler', '<img src="x.png" onerror="alert(1)">', 'onerror'],
        ['uppercase handler', '<img src="x.png" ONERROR="alert(1)">', 'onerror'],
        ['entity-encoded handler name', '<img src="x.png" o&#110;error="alert(1)">', 'onerror'],
        ['unquoted handler', '<img src=x.png onerror=alert(1)>', 'onerror'],
        ['srcdoc', '<div srcdoc="<script>alert(1)</script>">x</div>', 'srcdoc'],
        ['javascript href', '<a href="javascript:alert(1)">x</a>', 'javascript:'],
        ['unquoted javascript href', '<a href=javascript:alert(1)>x</a>', 'javascript:'],
        ['vbscript href', '<a href="vbscript:msgbox(1)">x</a>', 'vbscript:'],
        ['entity-split scheme', '<a href="java&#x73;cript&colon;alert(1)">x</a>', 'javascript:'],
        ['html data uri', '<img src="data:text/html;base64,AAAA">', 'data:text/html'],
        ['svg data uri', '<img src="data:image/svg+xml;base64,AAAA">', 'data:image/svg'],
        ['css expression', '<div style="width:expression(alert(1))">x</div>', 'expression('],
        ['css javascript url', '<div style="background:url(javascript:alert(1))">x</div>', 'javascript:'],
    ])('strips %s', (_label, payload, forbidden) => {
        expect(render(payload).toLowerCase()).not.toContain(forbidden);
    });

    it('keeps benign attributes and does not reflow tags it had no reason to touch', () => {
        const html = render('<img src="diagram.png" alt="şema" width=320> <b class=hl>kalın</b>');
        expect(html).toContain('<img src="diagram.png" alt="şema" width=320>');
        expect(html).toContain('<b class=hl>kalın</b>');
    });

    it('blocks silent remote media loads and srcset tracking while retaining explicit HTTPS links', () => {
        const html = render(
            '<img src="https://tracker.example/pixel" srcset="https://tracker.example/2x 2x">'
            + '<a href="https://example.com/reference">kaynak</a>',
        );
        expect(html).not.toContain('tracker.example');
        expect(html).not.toContain('srcset');
        expect(html).toContain('href="https://example.com/reference"');
    });

    it('blocks protocol-relative and CSS-escaped network URLs in imported styles', () => {
        const nt = basic();
        nt.css = '.a{background:url(//tracker.example/a.png)}'
            + '.b{background:u\\72l(https://tracker.example/b.png)}';
        const html = render('<div class="a b">x</div>', nt);
        expect(html).not.toContain('tracker.example');
        expect(html).toContain('background:none');
    });

    it('does not let a quoted attribute value swallow the rest of the tag', () => {
        // A ">" inside a quoted value is legal HTML; a naive /<[^>]*>/ tag scanner mis-splits here
        // and used to drop everything after it.
        const html = render('<span title="a > b" class="ok">metin</span>');
        expect(html).toContain('metin');
        expect(html).toContain('class="ok"');
    });

    it('leaves comments and text that merely looks like a tag alone', () => {
        const html = render('<!-- not a tag --> 5 < 7 ve 9 > 3');
        expect(html).toContain('<!-- not a tag -->');
        expect(html).toContain('5 < 7');
    });

    it('rewrites only the offending attribute, keeping its siblings', () => {
        const html = render('<a href="javascript:alert(1)" class="ref" title="kaynak">x</a>');
        expect(html).toContain('href="#"');
        expect(html).toContain('class="ref"');
        expect(html).toContain('title="kaynak"');
    });

    it('survives a template that renders an attribute-looking string outside any tag', () => {
        const nt = basic();
        nt.templates[0].qfmt = 'style="color:red" href="javascript:alert(1)" {{Front}}';
        const html = renderCardHtml(nt, {
            id: 2, guid: 'g', noteTypeId: nt.id, mod: 0, usn: -1, tags: [],
            fields: ['soru', 'cevap'], sfld: '', csum: 0, flags: 0,
        }, 0, 'question');
        // Plain text is not an attribute; it must stay visible and unmangled.
        expect(html).toContain('style="color:red"');
        expect(html).toContain('soru');
    });
});

describe('Anki cloze hint parity', () => {
    const nt = (): NoteType => ({
        id: 3, name: 'Cloze', kind: 'cloze',
        fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }],
        templates: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
        css: '', sortFieldIdx: 0, mod: 0,
    });
    const q = (text: string, ord = 1) => renderCardHtml(nt(), {
        id: 1, guid: 'g', noteTypeId: 3, mod: 0, usn: -1, tags: [], fields: [text],
        sfld: '', csum: 0, flags: 0,
    }, 0, 'question', { clozeOrd: ord });

    it('splits the hint on the first ::, not the last', () => {
        // rslib/src/cloze.rs uses split_once, so "b::c" is all hint and only "a" is hidden.
        expect(q('{{c1::a::b::c}}')).toContain('data-cloze="a" data-ordinal="1">[b::c]</span>');
    });

    it('takes the hint from the first text run, leaving later content in place', () => {
        const html = q('{{c1::a::h {{c2::n}}}}');
        expect(html).toContain('[h ]');
        expect(html).toContain('data-cloze="a');
    });

    it('sets no hint when the cloze has none', () => {
        expect(q('{{c1::tek}}')).toContain('data-ordinal="1">[...]</span>');
    });

    it('handles an empty content half', () => {
        expect(q('{{c1::::ipucu}}')).toContain('data-cloze="" data-ordinal="1">[ipucu]</span>');
    });
});

describe('renderTypeAnswerDiff', () => {
    it('marks an exact match fully good', () => {
        const html = renderTypeAnswerDiff('mitoz', 'mitoz');
        expect(html).toContain('typeGood');
        expect(html).not.toContain('typeBad');
        expect(html).not.toContain('typeMissed');
    });

    it('marks an empty answer as fully missed', () => {
        const html = renderTypeAnswerDiff('', 'mitoz');
        expect(html).toContain('typeMissed');
        expect(html).toContain('mitoz');
    });

    it('highlights the differing run without discarding the matching prefix/suffix', () => {
        const html = renderTypeAnswerDiff('mitoz', 'mayoz');
        expect(html).toContain('typeBad');
        expect(html).toContain('typeMissed');
        // "m" and "oz" are shared between "mitoz" and "mayoz" — should show up unmarked/good.
        expect(html).toContain('typeGood');
    });

    it('is case- and whitespace-sensitive but trims surrounding whitespace', () => {
        const html = renderTypeAnswerDiff('  mitoz  ', 'mitoz');
        expect(html).toContain('typeGood');
        expect(html).not.toContain('typeBad');
    });
});

describe('Anki reversed note types', () => {
    const reversedNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 2)!;
    const optionalReversedNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 7)!;

    it('has two templates: Front->Back and Back->Front', () => {
        expect(reversedNoteType.templates).toHaveLength(2);
        expect(reversedNoteType.templates[0].qfmt).toContain('{{Front}}');
        expect(reversedNoteType.templates[1].qfmt).toContain('{{Back}}');
    });

    it('generates both cards whenever Soru and Cevap are both filled', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 2, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Cevap metni'], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        expect(shouldGenerateCard(reversedNoteType, note, 0)).toBe(true);
        expect(shouldGenerateCard(reversedNoteType, note, 1)).toBe(true);
        expect(countCardsForNote(reversedNoteType, note)).toBe(2);
    });

    it('generates only card 2 when Front is empty but Back has content', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 2, mod: 0, usn: -1, tags: [],
            fields: ['', 'Cevap metni'], sfld: '', csum: 0, flags: 0,
        };
        expect(shouldGenerateCard(reversedNoteType, note, 0)).toBe(false);
        expect(shouldGenerateCard(reversedNoteType, note, 1)).toBe(true);
        expect(countCardsForNote(reversedNoteType, note)).toBe(1);
    });

    it('generates 0 cards when both fields are empty', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 2, mod: 0, usn: -1, tags: [],
            fields: ['', ''], sfld: '', csum: 0, flags: 0,
        };
        expect(countCardsForNote(reversedNoteType, note)).toBe(0);
    });

    it('card 2 answers with Front', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 2, mod: 0, usn: -1, tags: [],
            fields: ['Orijinal soru', 'Orijinal cevap'], sfld: '', csum: 0, flags: 0,
        };
        const answerHtml = renderCardHtml(reversedNoteType, note, 1, 'answer');
        expect(answerHtml).toContain('Orijinal soru');
    });

    it('generates optional Card 2 only when Add Reverse has content', () => {
        const blank: Note = {
            id: 1, guid: 'g', noteTypeId: 7, mod: 0, usn: -1, tags: [],
            fields: ['Front', 'Back', ''], sfld: '', csum: 0, flags: 0,
        };
        const enabled: Note = { ...blank, fields: ['Front', 'Back', '1'] };
        expect(countCardsForNote(optionalReversedNoteType, blank)).toBe(1);
        expect(countCardsForNote(optionalReversedNoteType, enabled)).toBe(2);
    });
});

describe('typeAnswerPlainText', () => {
    it('compares against the field text, never its markup', () => {
        expect(typeAnswerPlainText('bulbus---<div>a. vertebralis---</div><div>C1-3---</div>'))
            .toBe('bulbus---\na. vertebralis---\nC1-3---');
    });

    it('drops media and decodes entities', () => {
        expect(typeAnswerPlainText('[sound:x.mp3]<img src="y.png">A&nbsp;&amp;&nbsp;B')).toBe('A & B');
    });

    it('renders a type-in prompt without leaking tags into the answer', () => {
        const noteType: NoteType = {
            id: 900,
            name: 'Type',
            kind: 'standard',
            fields: [
                { name: 'Front', ord: 0, sticky: false, rtl: false },
                { name: 'Back', ord: 1, sticky: false, rtl: false },
            ],
            templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}{{type:Back}}', afmt: '{{FrontSide}}<hr id=answer>{{type:Back}}' }],
            css: '',
            sortFieldIdx: 0,
            mod: 0,
        };
        const note: Note = {
            id: 901, guid: 'g', noteTypeId: 900, mod: 0, usn: -1, tags: [],
            fields: ['Soru', 'bulbus---<div>a. vertebralis---</div>'], sfld: 'Soru', csum: 0, flags: 0,
        };

        const html = renderCardHtml(noteType, note, 0, 'answer', { typedAnswer: 'bulbus' });

        expect(html).not.toContain('&lt;div&gt;');
        expect(html).toContain('a. vertebralis');
    });
});
