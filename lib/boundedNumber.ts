/**
 * Keeps numeric preference input data-only: normalize Unicode presentation forms,
 * discard everything except ASCII digits, and cap the amount of accepted text.
 */
export function sanitizeUnsignedIntegerDraft(input: string, maxDigits = 9): string {
    const safeMaxDigits = Math.max(1, Math.min(12, Math.trunc(maxDigits) || 1));
    return String(input)
        .normalize('NFKC')
        .replace(/[^0-9]/g, '')
        .slice(0, safeMaxDigits);
}

/**
 * Same as the unsigned sanitizer, but a single leading minus survives — for inputs whose range
 * genuinely goes below zero, such as Anki's custom study limit deltas.
 */
export function sanitizeSignedIntegerDraft(input: string, maxDigits = 9): string {
    const normalized = String(input).normalize('NFKC');
    const negative = normalized.trimStart().startsWith('-');
    const digits = sanitizeUnsignedIntegerDraft(normalized, maxDigits);
    return negative ? `-${digits}` : digits;
}

/**
 * Resolve an editable integer draft without allowing NaN, Infinity, or out-of-range values.
 * A leading minus is honoured, so a draft always resolves inside the range the caller declared.
 */
export function commitBoundedInteger(
    input: string,
    fallback: number,
    min: number,
    max: number,
): number {
    const lower = Math.ceil(Math.min(min, max));
    const upper = Math.floor(Math.max(min, max));
    const safeFallback = Number.isFinite(fallback)
        ? Math.max(lower, Math.min(upper, Math.round(fallback)))
        : lower;
    const draft = sanitizeSignedIntegerDraft(input, 12);
    const digits = draft.startsWith('-') ? draft.slice(1) : draft;
    if (!digits) return safeFallback;
    const parsed = Number.parseInt(draft.startsWith('-') ? `-${digits}` : digits, 10);
    if (!Number.isSafeInteger(parsed)) return safeFallback;
    return Math.max(lower, Math.min(upper, parsed));
}

/** Step from the value currently being edited, rather than from a stale persisted value. */
export function stepBoundedIntegerDraft(
    input: string,
    fallback: number,
    delta: number,
    min: number,
    max: number,
): number {
    const lower = Math.ceil(Math.min(min, max));
    const upper = Math.floor(Math.max(min, max));
    const current = commitBoundedInteger(input, fallback, lower, upper);
    const safeDelta = Number.isFinite(delta) ? Math.round(delta) : 0;
    return Math.max(lower, Math.min(upper, current + safeDelta));
}
