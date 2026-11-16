/**
 * Web only: where a field's focus ring is drawn when the field is a row.
 *
 * A browser rings the focused `<input>`. A field drawn as a row (a magnifier and a query, a typed
 * name and its Seç button, a number and its unit) keeps its input inside the box the learner sees,
 * so that ring would be a second, square frame inside the field. The row is marked instead (the
 * `fieldRowProps` of `components/ui/fieldRow.ts`): its input gives the ring up and the row wears
 * the same ring a plain `TextField` gets, around its own corners.
 */
export const FIELD_ROW_DATA_KEY = 'fieldRow';

const ROW = '[data-field-row]';
const INPUTS = ['input', 'textarea'];

/** Served in the page head (`app/+html.tsx`). `Highlight` is the ring where the WebKit name is unknown. */
export const FIELD_ROW_FOCUS_CSS = [
    `${INPUTS.map((input) => `${ROW} ${input}`).join(',')}{outline:none}`,
    `${ROW}:has(${INPUTS.map((input) => `${input}:focus-visible`).join(',')}){outline:Highlight auto 1px;outline:-webkit-focus-ring-color auto 1px}`,
].join('');
