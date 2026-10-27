/**
 * "TUS Sorusu": the note type of a five-option exam question, answered by tapping an option.
 *
 * It is an ordinary note type — fields, two templates and CSS — so its cards study, edit, export
 * and import like any other: Anki shows the question with its options and, on the answer side,
 * marks the key. What Anki cannot do is take the tap. The reviewer recognizes these cards by the
 * template's `tusq` markup (lib/tusQuestionBridge.ts binds the options), records the option the
 * learner chose, and renders the answer side with it so the card shows right or wrong.
 */

import type { Note, NoteType } from './models';
import { OPTION_LETTERS, isOptionLetter, type OptionLetter } from './pastExamPack';

/** Fixed so a reinstalled pack, a backup and an exported package all agree on the type. */
export const TUS_QUESTION_NOTE_TYPE_ID = 1_761_400_000_001;
export const TUS_QUESTION_NOTE_TYPE_NAME = 'TUS Sorusu';

export const TUS_QUESTION_FIELDS = ['Soru', 'A', 'B', 'C', 'D', 'E', 'Cevap', 'Açıklama', 'Ders', 'Konu', 'Sınav'] as const;
export type TusQuestionField = typeof TUS_QUESTION_FIELDS[number];

/** Answer side shown without a choice: the learner skipped the question. */
export const TUS_QUESTION_SKIPPED = '-';
export type TusQuestionChoice = OptionLetter | typeof TUS_QUESTION_SKIPPED;

/** The verdict the reviewer turns into a suggested grade. */
export type TusQuestionVerdict = 'correct' | 'wrong' | 'skipped';

const MARKER = 'class="tusq"';

function optionsMarkup(): string {
    return OPTION_LETTERS.map((letter) => (
        `{{#${letter}}}<div class="tusq-option" data-letter="${letter}" role="button">`
        + `<span class="tusq-letter">${letter}</span><div class="tusq-text">{{${letter}}}</div></div>{{/${letter}}}`
    )).join('\n');
}

const HEAD = '<div class="tusq-head"><span class="tusq-source">{{Sınav}}</span>'
    + '{{#Ders}}<span class="tusq-course">{{Ders}}</span>{{/Ders}}</div>';

const QUESTION_TEMPLATE = `<div ${MARKER} data-answer="{{Cevap}}">
${HEAD}
<div class="tusq-stem">{{Soru}}</div>
<div class="tusq-options">
${optionsMarkup()}
</div>
<div class="tusq-help"><b>Seçenek eleme:</b> Elemek istediğiniz seçeneğe çift dokunun veya basılı tutun; geri almak için tekrarlayın.</div>
</div>`;

// The answer side repeats the question instead of using {{FrontSide}}: the revealed options need
// their own class, and the reviewer fills `data-chosen` with the option the learner tapped.
// There is deliberately no id=answer: the reviewer would scroll the options out of view.
const ANSWER_TEMPLATE = `<div class="tusq tusq-revealed" data-answer="{{Cevap}}" data-chosen="">
${HEAD}
<div class="tusq-stem">{{Soru}}</div>
<div class="tusq-options">
${optionsMarkup()}
</div>
<div class="tusq-result"><span class="tusq-verdict"></span><span class="tusq-key">Doğru cevap: <b>{{Cevap}}</b></span></div>
{{#Açıklama}}<div class="tusq-explanation"><div class="tusq-explanation-title">Açıklama</div>{{Açıklama}}</div>{{/Açıklama}}
{{#Konu}}<div class="tusq-topic">{{Ders}} · {{Konu}}</div>{{/Konu}}
</div>`;

function perLetter(rule: (letter: OptionLetter) => string): string {
    return OPTION_LETTERS.map(rule).join('\n');
}

/**
 * Close to the app's own palette (its greens and the grade colours), on the reviewer's tinted
 * card. Colours are translucent where they can be, so the same sheet reads in both themes; night
 * mode only lifts the accents.
 */
export const TUS_QUESTION_CSS = `.card {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 17px;
    line-height: 1.55;
    text-align: left;
}
.tusq { max-width: 760px; margin: 0 auto; --tusq-accent: #3a9e78; --tusq-good: #27864e; --tusq-bad: #c0392b; --tusq-gold: #8a7a43; }
.nightMode .tusq { --tusq-accent: #4db88a; --tusq-good: #3aad60; --tusq-bad: #e05545; --tusq-gold: #c9b77a; }
.tusq-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; color: var(--tusq-gold); }
.tusq-course { flex: 0 0 auto; padding: 2px 9px; border-radius: 999px; color: var(--tusq-accent); background: rgba(58, 158, 120, 0.12); }
.tusq-stem { margin-bottom: 16px; }
.tusq-options { display: flex; flex-direction: column; gap: 9px; }
.tusq-option {
    display: flex; align-items: flex-start; gap: 11px;
    padding: 10px 12px; border-radius: 12px;
    border: 1px solid rgba(70, 110, 95, 0.26);
    background: rgba(255, 255, 255, 0.6);
    cursor: pointer; touch-action: manipulation;
    -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
    transition: opacity 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.nightMode .tusq-option { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.16); }
.tusq-letter {
    flex: 0 0 auto; width: 26px; height: 26px; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%; border: 1.5px solid rgba(70, 110, 95, 0.4);
    font-size: 14px; font-weight: 700; line-height: 1;
}
.nightMode .tusq-letter { border-color: rgba(255, 255, 255, 0.3); }
.tusq-text { flex: 1; min-width: 0; padding-top: 1px; }
.tusq-text img { display: block; margin-top: 6px; }
.tusq-option.tusq-eliminated { opacity: 0.38; }
.tusq-option.tusq-eliminated .tusq-text { text-decoration: line-through; }
.tusq-option.tusq-picked { border-color: var(--tusq-accent); background: rgba(58, 158, 120, 0.14); }
.tusq-help { margin-top: 16px; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.45; color: inherit; opacity: 0.8; background: rgba(239, 138, 29, 0.1); }
.tusq-help b { color: #d27a16; }
.tusq-revealed .tusq-option { cursor: default; }
${perLetter((letter) => `.tusq-revealed[data-chosen="${letter}"] .tusq-option[data-letter="${letter}"] { border-color: var(--tusq-bad); background: rgba(192, 57, 43, 0.12); }
.tusq-revealed[data-chosen="${letter}"] .tusq-option[data-letter="${letter}"] .tusq-letter { border-color: var(--tusq-bad); background: var(--tusq-bad); color: #fff; }`)}
${perLetter((letter) => `.tusq-revealed[data-answer="${letter}"] .tusq-option[data-letter="${letter}"] { border-color: var(--tusq-good); background: rgba(39, 134, 78, 0.14); }
.tusq-revealed[data-answer="${letter}"] .tusq-option[data-letter="${letter}"] .tusq-letter { border-color: var(--tusq-good); background: var(--tusq-good); color: #fff; }`)}
.tusq-result { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-top: 16px; font-size: 15px; }
.tusq-verdict::before { font-weight: 800; }
.tusq-revealed[data-chosen="-"] .tusq-verdict::before { content: "Boş bıraktınız"; opacity: 0.75; }
.tusq-revealed[data-chosen="A"] .tusq-verdict::before, .tusq-revealed[data-chosen="B"] .tusq-verdict::before,
.tusq-revealed[data-chosen="C"] .tusq-verdict::before, .tusq-revealed[data-chosen="D"] .tusq-verdict::before,
.tusq-revealed[data-chosen="E"] .tusq-verdict::before { content: "Yanlış"; color: var(--tusq-bad); }
${perLetter((letter) => `.tusq-revealed[data-chosen="${letter}"][data-answer="${letter}"] .tusq-verdict::before { content: "Doğru"; color: var(--tusq-good); }`)}
.tusq-key { opacity: 0.85; }
.tusq-explanation { margin-top: 18px; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.55); font-size: 15.5px; }
.nightMode .tusq-explanation { background: rgba(255, 255, 255, 0.05); }
.tusq-explanation-title { margin-bottom: 6px; font-weight: 800; font-size: 16px; }
.tusq-explanation table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 13.5px; margin: 10px 0; }
.tusq-explanation th, .tusq-explanation td { border: 1px solid rgba(70, 110, 95, 0.3); padding: 5px 7px; vertical-align: top; }
.tusq-explanation hr { margin: 10px 0; }
.tusq-topic { margin-top: 14px; font-size: 12.5px; font-weight: 600; opacity: 0.7; }`;

export function buildTusQuestionNoteType(): NoteType {
    return {
        id: TUS_QUESTION_NOTE_TYPE_ID,
        name: TUS_QUESTION_NOTE_TYPE_NAME,
        kind: 'standard',
        fields: TUS_QUESTION_FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: false })),
        templates: [{ name: 'Soru', ord: 0, qfmt: QUESTION_TEMPLATE, afmt: ANSWER_TEMPLATE }],
        css: TUS_QUESTION_CSS,
        sortFieldIdx: 0,
        mod: 0,
    };
}

/**
 * A card is answered by tapping when its question template carries the `tusq` markup. Keying on
 * the markup rather than the id keeps a copied or re-imported note type working.
 */
export function isTusQuestionNoteType(noteType: Pick<NoteType, 'templates'> | null | undefined): boolean {
    return Boolean(noteType?.templates.some((template) => template.qfmt.includes(MARKER)));
}

/** The note's key, read from its "Cevap" field. */
export function tusQuestionAnswer(noteType: Pick<NoteType, 'fields'>, note: Pick<Note, 'fields'>): OptionLetter | null {
    const index = noteType.fields.findIndex((field) => field.name === 'Cevap');
    if (index < 0) return null;
    const value = (note.fields[index] ?? '').replace(/<[^>]*>/g, '').trim().toUpperCase();
    return isOptionLetter(value) ? value : null;
}

export function tusQuestionVerdict(choice: TusQuestionChoice | null | undefined, answer: OptionLetter | null): TusQuestionVerdict {
    if (!choice || choice === TUS_QUESTION_SKIPPED) return 'skipped';
    return choice === answer ? 'correct' : 'wrong';
}

/** Put the learner's choice on the rendered answer side, where the stylesheet marks it. */
export function withTusQuestionChoice(html: string, choice: TusQuestionChoice | null | undefined): string {
    if (choice !== TUS_QUESTION_SKIPPED && !isOptionLetter(choice)) return html;
    return html.replace(/(<div class="tusq tusq-revealed"[^>]*?) data-chosen=""/, `$1 data-chosen="${choice}"`);
}
