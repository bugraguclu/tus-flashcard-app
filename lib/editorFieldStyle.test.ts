import { describe, expect, it } from 'vitest';
import { editorFieldFontFamily, editorFieldFontSize } from './editorFieldStyle';

describe('editorFieldFontSize', () => {
    it('uses the field size a note type actually specifies', () => {
        expect(editorFieldFontSize(20, 16)).toBe(20);
        expect(editorFieldFontSize(8, 16)).toBe(8);
        expect(editorFieldFontSize(64, 16)).toBe(64);
    });

    it('falls back when the note type leaves the size unset', () => {
        expect(editorFieldFontSize(undefined, 16)).toBe(16);
        // Anki writes 0 for "unset"; honouring it renders the field's text at no height at all.
        expect(editorFieldFontSize(0, 18)).toBe(18);
    });

    it('falls back for a size no phone should render', () => {
        expect(editorFieldFontSize(-12, 16)).toBe(16);
        expect(editorFieldFontSize(400, 16)).toBe(16);
        expect(editorFieldFontSize(Number.NaN, 16)).toBe(16);
        expect(editorFieldFontSize(Number.POSITIVE_INFINITY, 16)).toBe(16);
    });

    it('rounds a fractional size to a whole pixel', () => {
        expect(editorFieldFontSize(17.6, 16)).toBe(18);
    });
});

describe('editorFieldFontFamily', () => {
    it('quotes the named face and keeps the system stack behind it', () => {
        expect(editorFieldFontFamily('Helvetica Neue'))
            .toBe('"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    });

    it('leaves the system stack alone when the note type names no face', () => {
        expect(editorFieldFontFamily(undefined)).toBeNull();
        expect(editorFieldFontFamily('')).toBeNull();
        expect(editorFieldFontFamily('   ')).toBeNull();
        // A name made only of characters a family cannot contain leaves nothing to render with.
        expect(editorFieldFontFamily('};')).toBeNull();
    });

    it('cannot close its own declaration and open another', () => {
        // The name arrives from a collection built elsewhere and is written into a stylesheet.
        const injected = editorFieldFontFamily('Arial"; } body { display: none } #editor { color: red');
        // The words survive as part of a (nonsense) family name; the punctuation that would have
        // made them a rule of their own does not.
        expect(injected).not.toContain('{');
        expect(injected).not.toContain('}');
        expect(injected).not.toContain(';');
        expect(injected).toBe('"Arial body display none editor color red", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    });

    it('bounds a name long enough to be a payload rather than a face', () => {
        const family = editorFieldFontFamily('A'.repeat(500));
        expect(family).toBe(`"${'A'.repeat(64)}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`);
    });
});
