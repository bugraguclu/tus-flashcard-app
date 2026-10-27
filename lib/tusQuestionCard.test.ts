import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ getDB: () => ({ getFirstSync: () => null, getAllSync: () => [] }) }));

import type { Note } from './models';
import { parsePastExamPack, pastExamNoteFields, pastExamTags, type PastExamQuestion } from './pastExamPack';
import { renderCardHtml, shouldGenerateCard } from './templates';
import {
    TUS_QUESTION_FIELDS,
    TUS_QUESTION_NOTE_TYPE_ID,
    buildTusQuestionNoteType,
    isTusQuestionNoteType,
    tusQuestionAnswer,
    tusQuestionVerdict,
    withTusQuestionChoice,
} from './tusQuestionCard';

const QUESTION: PastExamQuestion = {
    id: 13995,
    year: 2026,
    exam: 1,
    number: 14,
    course: 'Patoloji',
    unit: 'Hücre Hasarı',
    stem: 'Omentumda tebeşirimsi odaklar görülüyor.<br><br>En olası mekanizma <u>hangisidir</u>?',
    options: ['Protein denatürasyonu', 'Kaspaz aktivasyonu', 'Ubikuitin yolağı', 'Enzimatik reaksiyon', 'İmmünolojik reaksiyon'],
    answer: 'D',
};

function note(question: PastExamQuestion = QUESTION): Note {
    const fields = pastExamNoteFields(question);
    return { id: 1, guid: 'g', noteTypeId: TUS_QUESTION_NOTE_TYPE_ID, mod: 0, usn: -1, tags: [], fields, sfld: fields[0], csum: 0, flags: 0 };
}

describe('TUS Sorusu note type', () => {
    const noteType = buildTusQuestionNoteType();

    it('lays a question out over its fields and makes one card', () => {
        expect(noteType.fields.map((field) => field.name)).toEqual([...TUS_QUESTION_FIELDS]);
        expect(pastExamNoteFields(QUESTION)).toHaveLength(TUS_QUESTION_FIELDS.length);
        expect(shouldGenerateCard(noteType, note(), 0)).toBe(true);
        expect(isTusQuestionNoteType(noteType)).toBe(true);
        expect(isTusQuestionNoteType({ templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] })).toBe(false);
        expect(tusQuestionAnswer(noteType, note())).toBe('D');
        expect(tusQuestionAnswer(noteType, { fields: ['', '', '', '', '', '', ' <b>c</b> '] })).toBe('C');
        expect(tusQuestionAnswer(noteType, { fields: ['', '', '', '', '', '', 'F'] })).toBeNull();
    });

    it('shows five tappable options on the question side and no key', () => {
        const html = renderCardHtml(noteType, note(), 0, 'question');
        expect(html.match(/class="tusq-option" data-letter="[A-E]" role="button"/g)).toHaveLength(5);
        expect(html).toContain('2026-1 TUS · Soru 14');
        expect(html).toContain('<u>hangisidir</u>');
        expect(html).not.toContain('Doğru cevap');
    });

    it('marks the learner’s choice and the key on the answer side', () => {
        const html = renderCardHtml(noteType, note(), 0, 'answer');
        expect(html).toContain('class="tusq tusq-revealed" data-answer="D" data-chosen=""');
        expect(withTusQuestionChoice(html, 'B')).toContain('data-answer="D" data-chosen="B"');
        expect(withTusQuestionChoice(html, '-')).toContain('data-chosen="-"');
        // Anything but a letter or a skip leaves the answer side as rendered.
        expect(withTusQuestionChoice(html, 'x" onload="alert(1)' as never)).toBe(html);
        expect(html).toContain('Patoloji · Hücre Hasarı');
        expect(html).not.toContain('<div class="tusq-explanation">');
        const explained = renderCardHtml(noteType, note({ ...QUESTION, explanation: '<b>Yağ nekrozu</b>' }), 0, 'answer');
        expect(explained).toContain('<div class="tusq-explanation"><div class="tusq-explanation-title">Açıklama</div><b>Yağ nekrozu</b></div>');
    });

    it('turns a choice into a verdict', () => {
        expect(tusQuestionVerdict('D', 'D')).toBe('correct');
        expect(tusQuestionVerdict('A', 'D')).toBe('wrong');
        expect(tusQuestionVerdict('-', 'D')).toBe('skipped');
        expect(tusQuestionVerdict(null, 'D')).toBe('skipped');
    });

    it('tags a question by exam, course group, course and unit', () => {
        expect(pastExamTags({ year: 2014, exam: 2, course: 'Kadın Doğum', unit: 'Jinekolojik Onkoloji' })).toEqual([
            'Çıkmış_TUS::2014_2', 'Klinik_Bilimler', 'Ders::Kadın_Doğum', 'Konu::Kadın_Doğum::Jinekolojik_Onkoloji',
        ]);
    });
});

describe('parsePastExamPack', () => {
    const valid = { format: 1, questions: [QUESTION] };

    it('accepts a well-formed pack', () => {
        expect(parsePastExamPack(valid).questions[0]).toEqual(QUESTION);
    });

    it.each([
        ['a missing option', { ...QUESTION, options: QUESTION.options.slice(0, 4) }],
        ['an empty option', { ...QUESTION, options: [...QUESTION.options.slice(0, 4), '  '] }],
        ['a key outside A–E', { ...QUESTION, answer: 'F' }],
        ['an empty stem', { ...QUESTION, stem: '' }],
        ['an impossible year', { ...QUESTION, year: 1890 }],
    ])('rejects the whole pack for %s', (_label, broken) => {
        expect(() => parsePastExamPack({ format: 1, questions: [QUESTION, { ...broken, id: 2, number: 15 }] })).toThrow(/2\. soru geçersiz/);
    });

    it('rejects repeated ids, repeated question numbers and unknown formats', () => {
        expect(() => parsePastExamPack({ format: 1, questions: [QUESTION, { ...QUESTION, number: 15 }] })).toThrow(/tekrar ediyor/);
        expect(() => parsePastExamPack({ format: 1, questions: [QUESTION, { ...QUESTION, id: 2 }] })).toThrow(/tekrar ediyor/);
        expect(() => parsePastExamPack({ format: 2, questions: [QUESTION] })).toThrow(/sürümü/);
        expect(() => parsePastExamPack({ format: 1, questions: [] })).toThrow(/soru yok/);
    });
});
