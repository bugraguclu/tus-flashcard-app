import { PASTED_HTML_FILTER_SCRIPT } from './pastedHtmlScript';

/*
 * The paste filter as typed functions. The filter itself is script text (`pastedHtmlScript.ts`),
 * because it has to run inside the field's document, in the paste event; this module evaluates
 * that same text, so the tests exercise exactly what the field runs. The app does not import it.
 */
interface PasteFilter {
    sanitize: (html: string) => string;
    textAsHtml: (text: string) => string;
    fieldHtml: (html: string, plainText: string) => string;
}

const filter = new Function(`${PASTED_HTML_FILTER_SCRIPT}\nreturn createTusPasteFilter();`)() as PasteFilter;

/**
 * The HTML a paste puts into a field. Text is never dropped: whatever tag goes, what it held stays,
 * except scripts, styles and embedded widgets, which hold no text of the learner's.
 */
export const sanitizePastedHtml = filter.sanitize;

/** Plain text as field HTML, for a paste whose markup held nothing after filtering. */
export const pastedTextAsHtml = filter.textAsHtml;

/** What to insert for a paste that carried HTML (and usually the same text as plain text). */
export const pastedFieldHtml = filter.fieldHtml;
