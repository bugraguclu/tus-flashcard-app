const STEP_PATTERN = /^(\d+(?:[.,]\d+)?)([smhd]?)$/i;

const MINUTES_BY_UNIT: Record<string, number> = {
    s: 1 / 60,
    m: 1,
    h: 60,
    d: 1440,
};

/**
 * Parse Anki-style learning delays. Bare values are minutes; s/m/h/d suffixes are accepted.
 * `null` means invalid input, while an empty array is the intentional "skip relearning" value.
 */
export function parseAnkiStepText(text: string, allowEmpty: boolean = false): number[] | null {
    const trimmed = text.trim();
    if (!trimmed) return allowEmpty ? [] : null;

    const values: number[] = [];
    for (const token of trimmed.split(/\s+/)) {
        const match = STEP_PATTERN.exec(token);
        if (!match) return null;
        const numeric = Number(match[1].replace(',', '.'));
        const multiplier = MINUTES_BY_UNIT[match[2].toLowerCase() || 'm'];
        const minutes = numeric * multiplier;
        if (!Number.isFinite(minutes) || minutes <= 0) return null;
        values.push(minutes);
    }
    return values;
}

function compactNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** Present stored minute values in the same compact notation accepted by Anki's options field. */
export function formatAnkiStepText(steps: number[]): string {
    return steps.map((minutes) => {
        if (Number.isInteger(minutes / 1440)) return `${compactNumber(minutes / 1440)}d`;
        if (Number.isInteger(minutes / 60)) return `${compactNumber(minutes / 60)}h`;
        if (minutes < 1 && Number.isInteger(minutes * 60)) return `${compactNumber(minutes * 60)}s`;
        return `${compactNumber(minutes)}m`;
    }).join(' ');
}

export type NumericDraftIssue = 'required' | 'integer' | 'number' | 'range';

export interface NumericDraftResult {
    value: number | undefined;
    issue: NumericDraftIssue | null;
}

/**
 * Parse a user-authored integer without silently falling back to a previous setting.
 * Empty text is only accepted for optional per-deck/today overrides.
 */
export function parseBoundedIntegerDraft(
    text: string,
    min: number,
    max: number,
    allowEmpty: boolean = false,
): NumericDraftResult {
    const trimmed = text.trim();
    if (!trimmed) return allowEmpty
        ? { value: undefined, issue: null }
        : { value: undefined, issue: 'required' };
    if (!/^\d+$/.test(trimmed)) return { value: undefined, issue: 'integer' };
    const value = Number(trimmed);
    if (!Number.isSafeInteger(value)) return { value: undefined, issue: 'integer' };
    if (value < min || value > max) return { value: undefined, issue: 'range' };
    return { value, issue: null };
}

/** Accept Turkish decimal commas while keeping the persisted value unambiguous. */
export function parseBoundedDecimalDraft(
    text: string,
    min: number,
    max: number,
): NumericDraftResult {
    const trimmed = text.trim();
    if (!trimmed) return { value: undefined, issue: 'required' };
    if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) return { value: undefined, issue: 'number' };
    const value = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(value)) return { value: undefined, issue: 'number' };
    if (value < min || value > max) return { value: undefined, issue: 'range' };
    return { value, issue: null };
}

/** Keep number fields writable while filtering characters they can never save. */
export function sanitizeNumericDraft(text: string, decimal: boolean = false): string {
    if (!decimal) return text.replace(/\D/g, '');
    const cleaned = text.replace(/[^\d.,]/g, '');
    const separatorIndex = cleaned.search(/[.,]/);
    if (separatorIndex < 0) return cleaned;
    return `${cleaned.slice(0, separatorIndex)}${cleaned[separatorIndex]}${cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '')}`;
}
