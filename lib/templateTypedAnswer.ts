import { escapeHtml } from './templateEscaping';
const COMBINING_MARKS = /[\u0300-\u036f]/g;

// ---- Type-in-the-answer ----

/** Field name of the first {{type:Field}} prompt in a template's qfmt, if any. */
export function getTypeAnswerField(template: { qfmt: string } | undefined): string | null {
    const match = template?.qfmt.match(/\{\{type:([^{}]+?)\}\}/);
    if (!match) return null;
    const parts = match[1].split(':').map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || null;
}

/** A run of characters the typed answer and the expected answer share. */
interface SharedRun {
    typed: number;
    expected: number;
    length: number;
}

/**
 * The longest run two ranges share. On a tie the run starting earliest in the typed text wins,
 * then the one starting earliest in the expected text — the rule of the SequenceMatcher Anki
 * compares answers with.
 */
function longestSharedRun(
    typed: string[],
    expected: string[],
    typedStart: number,
    typedEnd: number,
    expectedStart: number,
    expectedEnd: number,
): SharedRun {
    let best: SharedRun = { typed: typedStart, expected: expectedStart, length: 0 };
    const width = expectedEnd - expectedStart;
    // previous[j + 1] is the length of the shared run ending at the previous typed character and
    // expected[expectedStart + j]; index 0 is a permanent zero border.
    let previous = new Uint32Array(width + 1);
    let current = new Uint32Array(width + 1);
    for (let i = typedStart; i < typedEnd; i++) {
        for (let j = 0; j < width; j++) {
            const length = typed[i] === expected[expectedStart + j] ? previous[j] + 1 : 0;
            current[j + 1] = length;
            if (length > best.length) {
                best = { typed: i - length + 1, expected: expectedStart + j - length + 1, length };
            }
        }
        [previous, current] = [current, previous];
    }
    return best;
}

/**
 * The runs two answers share, in order: the longest shared run first, then the same search on
 * either side of it. Taking whole runs, rather than the longest common subsequence, keeps a
 * matched word together instead of pairing stray letters across the answer.
 */
function sharedRuns(typed: string[], expected: string[]): SharedRun[] {
    const runs: SharedRun[] = [];
    const pending: Array<[number, number, number, number]> = [[0, typed.length, 0, expected.length]];
    while (pending.length > 0) {
        const [typedStart, typedEnd, expectedStart, expectedEnd] = pending.pop()!;
        const run = longestSharedRun(typed, expected, typedStart, typedEnd, expectedStart, expectedEnd);
        if (run.length === 0) continue;
        runs.push(run);
        if (typedStart < run.typed && expectedStart < run.expected) {
            pending.push([typedStart, run.typed, expectedStart, run.expected]);
        }
        if (run.typed + run.length < typedEnd && run.expected + run.length < expectedEnd) {
            pending.push([run.typed + run.length, typedEnd, run.expected + run.length, expectedEnd]);
        }
    }
    return runs.sort((a, b) => a.typed - b.typed);
}

/**
 * Drops shared runs that are only coincidence: a run shorter than the unmatched text on both
 * sides of it, such as a single letter the learner happened to share with a sentence they never
 * typed. Keeping it would split one mistake into several and scatter green through the answer.
 * A run next to a mistake no longer than itself is a real alignment — the `d` of "Tıroıd"
 * against "Tiroid" sits after a one-letter slip — and stays, as does a run that opens or closes
 * both answers, which has no unmatched text on that side at all.
 */
function withoutIncidentalRuns(runs: SharedRun[], typedLength: number, expectedLength: number): SharedRun[] {
    let kept = runs;
    for (let changed = true; changed;) {
        changed = false;
        for (let index = 0; index < kept.length; index++) {
            const run = kept[index];
            const before = kept[index - 1];
            const after = kept[index + 1];
            const gapBefore = Math.max(
                run.typed - (before ? before.typed + before.length : 0),
                run.expected - (before ? before.expected + before.length : 0),
            );
            const gapAfter = Math.max(
                (after ? after.typed : typedLength) - (run.typed + run.length),
                (after ? after.expected : expectedLength) - (run.expected + run.length),
            );
            if (run.length < gapBefore && run.length < gapAfter) {
                kept = kept.filter((_, position) => position !== index);
                changed = true;
                break;
            }
        }
    }
    return kept;
}

/** Longest row of `-` marking an omission in the typed line; a longer omission shows this many. */
const MAX_OMISSION_MARKS = 3;

/**
 * Plain-text projection of a field for the type-in-the-answer comparison. Block-level markup and
 * line breaks become one space, as Anki's `strip_expected` does; inline markup and media are
 * dropped, matching what Anki diffs against.
 */
export function typeAnswerPlainText(value: string): string {
    return value
        .replace(/\[sound:[^\]]*\]/gi, ' ')
        .replace(/<(?:img|audio|video|source)\b[^>]*>/gi, ' ')
        .replace(/<\/?(?:div|p|br|li|tr|h[1-6])\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
}

type TypeAnswerClass = 'typeGood' | 'typeBad' | 'typeMissed';

/** Collects a line of the comparison, merging neighbouring characters that share a class. */
class TypeAnswerLine {
    private html = '';
    private run = '';
    private runClass: TypeAnswerClass | null = null;

    push(text: string, className: TypeAnswerClass): void {
        if (!text) return;
        if (this.runClass !== className) this.flush();
        this.runClass = className;
        this.run += text;
    }

    toHtml(): string {
        this.flush();
        return this.html;
    }

    private flush(): void {
        if (this.run && this.runClass) this.html += `<span class="${this.runClass}">${escapeHtml(this.run)}</span>`;
        this.run = '';
        this.runClass = null;
    }
}

/** One combining mark (an accent, cedilla or dot) of the kind `{{type:nc:…}}` ignores. */
const COMBINING_MARK = /^[\u0300-\u036f]$/;

export interface TypeAnswerDiffOptions {
    /**
     * `{{type:nc:Field}}`: compare without combining marks, but show the expected answer with
     * them, as Anki's non-combining comparison does.
     */
    ignoreCombining?: boolean;
}

/**
 * The expected answer as display units and comparison keys of the same length. Normally both are
 * its code points. When combining marks are ignored, each unit is a base character with the marks
 * that follow it and its key is the base character alone, so a match found on the keys is shown
 * with the accents the answer was written with.
 */
function expectedAnswerUnits(expected: string, ignoreCombining: boolean): { units: string[]; keys: string[] } {
    if (!ignoreCombining) {
        const chars = Array.from(expected);
        return { units: chars, keys: chars };
    }
    const units: string[] = [];
    const keys: string[] = [];
    for (const char of Array.from(expected.normalize('NFKD'))) {
        if (!COMBINING_MARK.test(char)) {
            units.push(char);
            keys.push(char);
        } else if (units.length > 0) {
            units[units.length - 1] += char;
        }
    }
    return { units: units.map((unit) => unit.normalize('NFC')), keys };
}

/**
 * Anki's typed-answer comparison, in the markup its reviewer produces (rslib/src/typeanswer.rs):
 *
 * - nothing typed: the expected answer on its own, with no comparison marks;
 * - an exact match: the answer as one `typeGood` run;
 * - anything else: the typed line, a down arrow, then the expected line. Characters both share
 *   are `typeGood` on both lines. Typed characters the answer does not have are `typeBad`; answer
 *   characters the learner left out are `typeMissed` on the expected line, and where nothing was
 *   typed in their place the typed line marks the omission with `-`.
 *
 * Two local departures keep a long answer readable. Anki writes one `-` per omitted character,
 * which turns a half-typed list into rows of dashes; here an omission shows at most three. And a
 * shared letter stranded inside a longer mistake is not counted as a match (see
 * `withoutIncidentalRuns`). The `typed` and `correct` wrappers are local additions for styling;
 * Anki's own classes carry the meaning.
 * Both sides are prepared the way Anki prepares them: NFC, so a precomposed and a decomposed
 * letter compare equal, and a line break in the expected answer reads as one space, because
 * the single-line input cannot type one.
 * https://docs.ankiweb.net/templates/fields.html#checking-your-answer
 */
export function renderTypeAnswerDiff(typed: string, correct: string, options: TypeAnswerDiffOptions = {}): string {
    const ignoreCombining = options.ignoreCombining === true;
    const typedTrimmed = (ignoreCombining
        ? typed.normalize('NFKD').replace(COMBINING_MARKS, '')
        : typed.normalize('NFC')).trim();
    const correctTrimmed = correct.normalize('NFC').replace(/\s*\n\s*/g, ' ').trim();
    const expected = expectedAnswerUnits(correctTrimmed, ignoreCombining);
    const correctDisplay = expected.units.join('');

    if (typedTrimmed.length === 0) {
        return `<code id="typeans" class="typeanswer">${escapeHtml(correctDisplay)}</code>`;
    }
    if (typedTrimmed === expected.keys.join('')) {
        return `<code id="typeans" class="typeanswer"><span class="typeGood">${escapeHtml(correctDisplay)}</span></code>`;
    }

    // Code points, so a character outside the BMP is never split into two halves.
    const typedChars = Array.from(typedTrimmed);
    const correctChars = expected.keys;
    const typedLine = new TypeAnswerLine();
    const correctLine = new TypeAnswerLine();
    let typedIndex = 0;
    let correctIndex = 0;
    const closeGap = (typedEnd: number, correctEnd: number) => {
        const extra = typedChars.slice(typedIndex, typedEnd).join('');
        const missing = expected.units.slice(correctIndex, correctEnd);
        typedLine.push(extra, 'typeBad');
        // A pure omission leaves a visible hole in the typed line; a substitution already shows
        // what was typed instead.
        if (!extra && missing.length > 0) {
            typedLine.push('-'.repeat(Math.min(missing.length, MAX_OMISSION_MARKS)), 'typeMissed');
        }
        correctLine.push(missing.join(''), 'typeMissed');
    };
    const runs = withoutIncidentalRuns(sharedRuns(typedChars, correctChars), typedChars.length, correctChars.length);
    for (const run of runs) {
        closeGap(run.typed, run.expected);
        typedLine.push(typedChars.slice(run.typed, run.typed + run.length).join(''), 'typeGood');
        correctLine.push(expected.units.slice(run.expected, run.expected + run.length).join(''), 'typeGood');
        typedIndex = run.typed + run.length;
        correctIndex = run.expected + run.length;
    }
    closeGap(typedChars.length, correctChars.length);

    return `<code id="typeans" class="typeanswer"><span class="typed">${typedLine.toHtml()}</span>`
        + `<br><span id="typearrow">&darr;</span><br>`
        + `<span class="correct">${correctLine.toHtml()}</span></code>`;
}

