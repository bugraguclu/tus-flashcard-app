/**
 * Per-install marking of the paid catalog, so a leaked copy can be traced back to the account
 * it came from.
 *
 * This is not a lock and does not pretend to be one. Everything else in the catalog protection
 * tries to stop content leaving; this accepts that a determined buyer with a computer eventually
 * gets a copy, and makes that copy carry the buyer's fingerprint. It costs a learner nothing —
 * the mark is invisible, unsearchable and unprintable — and it changes the economics of sharing:
 * a deck posted to a study group can be traced to whoever posted it.
 *
 * ## Why the mark lives in the field text
 *
 * The realistic leak is not the SQLite file — that is useless to a friend — but the cards pulled
 * out of it into something shareable: an `.apkg`, a CSV, a pasted wall of text. A marker stored
 * beside the content in a metadata column would not survive that. Zero-width characters inside
 * the field text survive every one of those conversions, and survive being copied and pasted.
 *
 * ## Why it is safe to put there
 *
 * Three rules keep the mark from changing what the app does with the note:
 *
 * 1. It is appended to the **end of an already non-empty field**. Anki generates a card when a
 *    template's required field is non-empty, so writing into an empty field would conjure cards
 *    that should not exist. Appending to a field that already has content cannot.
 * 2. The characters are zero-width: they render as nothing, they carry no width in a layout, and
 *    the FTS tokenizer (`unicode61`) treats them as separators, so a mark at the end of a field
 *    cannot split or alter a search token.
 * 3. Only catalog notes are ever marked. A learner's own cards are never touched.
 *
 * ## What the mark says
 *
 * A short digest of the store account that installed the catalog — not the account id itself, so
 * a leaked deck does not publish somebody's identity. Recovering the account means holding the
 * customer list already (the seller does) and looking for the id whose digest matches; that is
 * what `scripts/trace-catalog-leak.mjs` does.
 *
 * Marking installs that carry a purchase means telling buyers it happens. Forensic marking of
 * paid content is ordinary, but it is still an identifier tied to a person's purchase living on
 * their device, and it belongs in the terms and the privacy policy.
 */

/** Zero for the encoded bitstring: U+200B ZERO WIDTH SPACE. */
const BIT_ZERO = '​';
/** One for the encoded bitstring: U+200C ZERO WIDTH NON-JOINER. */
const BIT_ONE = '‌';
/**
 * Frames the payload: U+2060 WORD JOINER. Distinct from the bit characters so a mark can be
 * located inside an arbitrary blob of text without knowing where a field began or ended.
 */
const MARK_FENCE = '⁠';

/** Every character this module writes, for stripping and for detection. */
const MARK_CHARS = `${BIT_ZERO}${BIT_ONE}${MARK_FENCE}`;
const MARK_CHAR_RE = new RegExp(`[${MARK_CHARS}]`, 'g');
const MARK_RE = new RegExp(`${MARK_FENCE}([${BIT_ZERO}${BIT_ONE}]+)${MARK_FENCE}`, 'g');

/** Digest length in hex characters. 48 bits: collision-free across any realistic customer list. */
export const INSTALL_MARK_LENGTH = 12;

/** A mark is a lowercase hex digest of exactly `INSTALL_MARK_LENGTH` characters. */
const MARK_VALUE_RE = /^[0-9a-f]+$/;

/**
 * Share of catalog notes that carry the mark.
 *
 * Every note does not need one. Marking roughly one note in twenty puts several marks in any
 * leak worth having while keeping the invisible characters — and the bytes they cost in the
 * collection, in every backup and in every export — down to a rounding error. Sampling is
 * deterministic so a reinstall of the same package for the same account marks the same notes.
 */
export const MARK_EVERY_NTH_NOTE = 20;

/**
 * A stable, non-reversible digest of the account that installed the catalog.
 *
 * FNV-1a run twice over the input with different offsets. It is not a cryptographic hash and is
 * not asked to be one: it only has to be stable across builds and platforms, and to be
 * impossible to read an account id back out of, which any digest of this length manages simply
 * by throwing most of the input away.
 */
export function installMarkFromAccountId(accountId: string): string {
    const input = typeof accountId === 'string' ? accountId.trim() : '';
    if (!input) return '';

    let high = 0x811c9dc5;
    let low = 0x01000193;
    for (let index = 0; index < input.length; index++) {
        const code = input.charCodeAt(index);
        high = Math.imul(high ^ code, 0x01000193) >>> 0;
        low = Math.imul(low ^ (code + index), 0x85ebca6b) >>> 0;
    }
    // Two 24-bit halves rather than one 32-bit value, so the whole digest depends on both passes.
    const first = (high >>> 8).toString(16).padStart(6, '0');
    const second = (low >>> 8).toString(16).padStart(6, '0');
    return `${first}${second}`.slice(0, INSTALL_MARK_LENGTH);
}

/** Whether a string is shaped like a mark this module would have written. */
export function isInstallMark(value: unknown): value is string {
    return typeof value === 'string'
        && value.length === INSTALL_MARK_LENGTH
        && MARK_VALUE_RE.test(value);
}

/** The invisible representation of a mark, fenced so it can be found again in any text. */
export function encodeInstallMark(mark: string): string {
    if (!isInstallMark(mark)) return '';
    let bits = '';
    for (const character of mark) {
        const nibble = parseInt(character, 16);
        for (let shift = 3; shift >= 0; shift--) {
            bits += (nibble >> shift) & 1 ? BIT_ONE : BIT_ZERO;
        }
    }
    return `${MARK_FENCE}${bits}${MARK_FENCE}`;
}

/**
 * Every mark found in a blob of text, in the order they appear, without duplicates.
 *
 * The input is whatever a leak turned out to be — a SQLite dump, an exported package, a pasted
 * wall of cards — so this reads defensively and simply ignores anything that does not decode.
 */
export function decodeInstallMarks(text: unknown): string[] {
    if (typeof text !== 'string' || !text) return [];
    const found: string[] = [];
    const seen = new Set<string>();
    MARK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MARK_RE.exec(text)) !== null) {
        const bits = match[1];
        if (bits.length !== INSTALL_MARK_LENGTH * 4) continue;
        let mark = '';
        for (let index = 0; index < bits.length; index += 4) {
            let nibble = 0;
            for (let offset = 0; offset < 4; offset++) {
                nibble = (nibble << 1) | (bits[index + offset] === BIT_ONE ? 1 : 0);
            }
            mark += nibble.toString(16);
        }
        if (!isInstallMark(mark) || seen.has(mark)) continue;
        seen.add(mark);
        found.push(mark);
    }
    return found;
}

/** Remove every character this module writes. Used to compare marked and unmarked content. */
export function stripInstallMarks(text: unknown): string {
    return typeof text === 'string' ? text.replace(MARK_CHAR_RE, '') : '';
}

/** Whether the note at this position in the catalog carries a mark. */
export function shouldMarkNoteAt(index: number, everyNth = MARK_EVERY_NTH_NOTE): boolean {
    if (!Number.isInteger(index) || index < 0) return false;
    const step = Number.isInteger(everyNth) && everyNth > 0 ? everyNth : MARK_EVERY_NTH_NOTE;
    return index % step === 0;
}

/**
 * The field a note's mark goes on: the first one that already has content.
 *
 * Returns -1 when every field is empty, which is the signal to leave the note alone entirely —
 * writing into an empty field is the one thing that would change how many cards a note makes.
 */
export function markableFieldIndex(fields: readonly string[]): number {
    if (!Array.isArray(fields)) return -1;
    for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        if (typeof field === 'string' && stripInstallMarks(field).trim() !== '') return index;
    }
    return -1;
}

/**
 * A copy of these fields carrying the mark, or the same fields untouched when there is nowhere
 * safe to put it. Any mark already present is replaced, so a reinstall does not accumulate them.
 */
export function markNoteFields(fields: readonly string[], mark: string): string[] {
    const copy = Array.isArray(fields) ? [...fields] : [];
    if (!isInstallMark(mark)) return copy;
    const target = markableFieldIndex(copy);
    if (target < 0) return copy;
    copy[target] = `${stripInstallMarks(copy[target])}${encodeInstallMark(mark)}`;
    return copy;
}

/**
 * Mark a catalog's notes in place of the unmarked ones, sampled by position.
 *
 * Notes are returned as new objects rather than mutated: the caller's snapshot is also what the
 * post-install integrity check counts, and a shared reference that changed under it would be a
 * hard bug to find.
 */
export function markCatalogNotes<T extends { fields: string[] }>(
    notes: readonly T[],
    mark: string,
    everyNth = MARK_EVERY_NTH_NOTE,
): T[] {
    const source = Array.isArray(notes) ? notes : [];
    if (!isInstallMark(mark)) return [...source];
    return source.map((note, index) => (
        shouldMarkNoteAt(index, everyNth)
            ? { ...note, fields: markNoteFields(note.fields, mark) }
            : note
    ));
}

/**
 * Which of these candidate account ids produced the marks found in a leak.
 *
 * The seller holds the customer list; the leak holds a digest. Matching is a scan of one against
 * the other, which is the whole point of storing a digest rather than the id itself.
 */
export function matchInstallMarks(
    marks: readonly string[],
    candidateAccountIds: readonly string[],
): { mark: string; accountId: string }[] {
    const byMark = new Map<string, string>();
    for (const accountId of candidateAccountIds) {
        const mark = installMarkFromAccountId(accountId);
        if (mark && !byMark.has(mark)) byMark.set(mark, accountId);
    }
    const matches: { mark: string; accountId: string }[] = [];
    for (const mark of marks) {
        const accountId = byMark.get(mark);
        if (accountId) matches.push({ mark, accountId });
    }
    return matches;
}
