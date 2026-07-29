import { describe, expect, it } from 'vitest';
import type { Note, NoteType } from './models';
import { BUILTIN_NOTE_TYPES } from './models';
import {
    clozeFieldIndex,
    countCardsForNote,
    getTypeAnswerField,
    renderCardHtml,
    renderTemplate,
    renderTypeAnswerDiff,
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
});

describe('typed-answer (type:Field)', () => {
    const typeAnswerNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 5)!;

    it('getTypeAnswerField finds the field name from a template qfmt', () => {
        expect(getTypeAnswerField(typeAnswerNoteType.templates[0])).toBe('Cevap');
        expect(getTypeAnswerField(BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!.templates[0])).toBeNull();
        expect(getTypeAnswerField(undefined)).toBeNull();
    });

    it('renders no live input on the question side (WebView JS is disabled, so it would be inert)', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 5, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Doğru cevap', ''], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const html = renderCardHtml(typeAnswerNoteType, note, 0, 'question');
        expect(html).not.toContain('<input');
        expect(html).not.toContain('Doğru cevap');
    });

    it('renders the plain correct answer on the answer side when nothing was typed yet', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 5, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Doğru cevap', ''], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        const html = renderCardHtml(typeAnswerNoteType, note, 0, 'answer');
        expect(html).toContain('Doğru cevap');
        expect(html).not.toContain('class="typeGood"');
    });

    it('diffs a typed answer against the real one on the answer side', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 5, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'mitoz', ''], sfld: 'Soru metni', csum: 0, flags: 0,
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
    const tusNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 4)!;
    const note: Note = {
        id: 1, guid: 'g', noteTypeId: 4, mod: 0, usn: -1, tags: [],
        fields: ['Soru metni', 'Cevap metni', 'Konu Adı'], sfld: 'Soru metni', csum: 0, flags: 0,
    };

    it('renders the answer without the question or the hr separator', () => {
        const html = renderCardHtml(tusNoteType, note, 0, 'answer', { omitFrontSide: true });
        expect(html).toContain('Cevap metni');
        expect(html).not.toContain('Soru metni');
        expect(html).not.toContain('<hr');
    });

    it('keeps the full Anki back (FrontSide + answer) without the option', () => {
        const html = renderCardHtml(tusNoteType, note, 0, 'answer');
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
        expect(html).toContain('<span class="cloze">mitokondri</span>');
        expect(html).not.toContain('[...]');
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

describe('reversed note type (id 6)', () => {
    const reversedNoteType = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 6)!;

    it('has two templates: Soru->Cevap and Cevap->Soru', () => {
        expect(reversedNoteType.templates).toHaveLength(2);
        expect(reversedNoteType.templates[0].qfmt).toContain('{{Soru}}');
        expect(reversedNoteType.templates[1].qfmt).toContain('{{Cevap}}');
    });

    it('generates both cards whenever Soru and Cevap are both filled', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 6, mod: 0, usn: -1, tags: [],
            fields: ['Soru metni', 'Cevap metni', 'Konu', ''], sfld: 'Soru metni', csum: 0, flags: 0,
        };
        expect(shouldGenerateCard(reversedNoteType, note, 0)).toBe(true);
        expect(shouldGenerateCard(reversedNoteType, note, 1)).toBe(true);
        expect(countCardsForNote(reversedNoteType, note)).toBe(2);
    });

    it("card 2 answers with Soru when TersCevap is blank (plain swap, matching Anki's reversed card)", () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 6, mod: 0, usn: -1, tags: [],
            fields: ['Orijinal soru', 'Orijinal cevap', 'Konu', ''], sfld: '', csum: 0, flags: 0,
        };
        const answerHtml = renderCardHtml(reversedNoteType, note, 1, 'answer');
        expect(answerHtml).toContain('Orijinal soru');
    });

    it('card 2 answers with the custom TersCevap override when provided', () => {
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 6, mod: 0, usn: -1, tags: [],
            fields: ['Orijinal soru', 'Orijinal cevap', 'Konu', 'Özel ters cevap'], sfld: '', csum: 0, flags: 0,
        };
        const answerHtml = renderCardHtml(reversedNoteType, note, 1, 'answer');
        expect(answerHtml).toContain('Özel ters cevap');
        expect(answerHtml).not.toContain('Orijinal soru');
    });
});
