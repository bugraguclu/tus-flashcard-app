import type { FieldNameSyntaxError, NoteTypeProblem } from '../../lib/noteTypeValidation';

type L = (turkish: string, english: string) => string;

export function fieldNameSyntaxMessage(reason: FieldNameSyntaxError, l: L): string {
    return reason === 'reservedPrefix'
        ? l('Alan adı #, ^ veya / ile başlayamaz.', 'A field name cannot start with #, ^ or /.')
        : l('Alan adı :, {, } veya " içeremez.', 'A field name cannot contain :, {, } or ".');
}

/** One line per problem, for the save refusal. */
export function noteTypeProblemMessage(problem: NoteTypeProblem, l: L): string {
    const side = 'side' in problem
        ? (problem.side === 'front' ? l('ön yüzünde', 'front') : l('arka yüzünde', 'back'))
        : '';
    switch (problem.kind) {
        case 'duplicateField':
            return l(`“${problem.field}” adı birden fazla alanda kullanılıyor.`, `More than one field is named “${problem.field}”.`);
        case 'invalidFieldName':
            return `“${problem.field}”: ${fieldNameSyntaxMessage(problem.reason, l)}`;
        case 'unknownField':
            return l(
                `“${problem.template}” şablonunun ${side} “${problem.field}” adında bir alan yok.`,
                `The ${side} of “${problem.template}” uses “${problem.field}”, but there is no field with that name.`,
            );
        case 'unclosedSection':
            return l(
                `“${problem.template}” şablonunun ${side} {{#${problem.field}}} veya {{^${problem.field}}} kapatılmamış.`,
                `The ${side} of “${problem.template}” opens {{#${problem.field}}} or {{^${problem.field}}} without closing it.`,
            );
        case 'unexpectedClose':
            return l(
                `“${problem.template}” şablonunun ${side} açılmamış bir {{/${problem.field}}} var.`,
                `The ${side} of “${problem.template}” has {{/${problem.field}}} without a matching opening.`,
            );
        case 'noFrontField':
            return l(
                `“${problem.template}” şablonunun ön yüzü hiçbir alan kullanmıyor; bu şablondan kart üretilemez.`,
                `The front of “${problem.template}” uses no field, so it can never produce a card.`,
            );
        case 'missingCloze':
            return l(
                `“${problem.template}” şablonunun ön yüzünde {{cloze:...}} yok.`,
                `The front of “${problem.template}” has no {{cloze:...}} field.`,
            );
    }
}
