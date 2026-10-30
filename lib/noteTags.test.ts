import { describe, expect, it } from 'vitest';
import { canonifyTags, isStatusTag, sameTagSet } from './noteTags';

describe('isStatusTag', () => {
    it('knows Anki’s marked and leech tags in any case, and nothing else', () => {
        expect(isStatusTag('marked')).toBe(true);
        expect(isStatusTag('Marked')).toBe(true);
        expect(isStatusTag('LEECH')).toBe(true);
        expect(isStatusTag('kardiyoloji')).toBe(false);
        expect(isStatusTag('marked::alt')).toBe(false);
    });
});

describe('sameTagSet', () => {
    it('treats a re-saved tag list as unchanged whatever its order or case', () => {
        // The reviewer's Edit Tags field starts from the stored order, which Mark Note can leave
        // unsorted; saving it untouched must not count as an edit.
        expect(sameTagSet(['etiket', 'Yeni::Alt', 'marked'], canonifyTags('etiket Yeni::Alt marked'))).toBe(true);
        expect(sameTagSet(['EKG'], ['ekg'])).toBe(true);
        expect(sameTagSet(['böbrek'], ['böbrek'])).toBe(true);
    });

    it('sees an added or removed tag', () => {
        expect(sameTagSet(['etiket'], ['etiket', 'yeni'])).toBe(false);
        expect(sameTagSet(['etiket', 'yeni'], ['etiket'])).toBe(false);
        expect(sameTagSet([], [])).toBe(true);
    });
});

describe('canonifyTags', () => {
    it('splits on any run of whitespace', () => {
        expect(canonifyTags('  kardiyoloji   ekg\tacil ')).toEqual(['acil', 'ekg', 'kardiyoloji']);
    });

    it('keeps a repeated tag once, in the spelling it was first typed in', () => {
        expect(canonifyTags('EKG ekg Ekg')).toEqual(['EKG']);
    });

    it('sorts the result so the same tags always store identically', () => {
        expect(canonifyTags('zor kolay orta')).toEqual(canonifyTags('orta zor kolay'));
    });

    it('returns nothing for blank input', () => {
        expect(canonifyTags('   ')).toEqual([]);
        expect(canonifyTags([])).toEqual([]);
    });

    it('accepts an existing tag list as well as typed text', () => {
        expect(canonifyTags(['marked', '', ' leech '])).toEqual(['leech', 'marked']);
    });

    it('normalizes composed and decomposed spellings to one tag', () => {
        // An "ö" typed as o + combining diaeresis has to land on the same tag as the precomposed
        // one, or the same Turkish tag would silently split in two depending on the keyboard.
        expect(canonifyTags(['b\u00f6brek', 'bo\u0308brek'])).toEqual(['b\u00f6brek']);
    });

    it('preserves Anki hierarchy separators', () => {
        expect(canonifyTags('TUS::Dahiliye::Hematoloji')).toEqual(['TUS::Dahiliye::Hematoloji']);
    });
});
