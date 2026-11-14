import { describe, expect, it } from 'vitest';
import { remapFieldPositions, remapFieldValues, sameFieldLayout } from './editorFieldLayout';

describe('sameFieldLayout', () => {
    it('compares names in order, ignoring case', () => {
        expect(sameFieldLayout(['Front', 'Back'], ['front', 'BACK'])).toBe(true);
        expect(sameFieldLayout(['Front', 'Back'], ['Back', 'Front'])).toBe(false);
        expect(sameFieldLayout(['Front', 'Back'], ['Front', 'Back', 'Extra'])).toBe(false);
    });
});

describe('remapFieldValues', () => {
    it('moves an edited note with its fields instead of saving them swapped', () => {
        // Front ↓ in the note type screen while editing: the stored note was migrated already.
        const values = remapFieldValues(['Front', 'Back'], ['Back', 'Front'], ['F', 'B'], ['F', 'B'], ['B', 'F']);
        expect(values).toEqual(['B', 'F']);
    });

    it('never writes a removed field\'s text over the field after it', () => {
        const values = remapFieldValues(['Front', 'Back', 'Extra'], ['Front', 'Extra'], ['F', 'B', 'E'], ['F', 'B', 'E'], ['F', 'E']);
        expect(values).toEqual(['F', 'E']);
    });

    it('keeps an edit made in the editor before the note type changed', () => {
        const values = remapFieldValues(['Front', 'Back', 'Extra'], ['Extra', 'Front', 'Back'], ['F2', 'B', 'E'], ['F', 'B', 'E'], ['E', 'F', 'B']);
        expect(values).toEqual(['E', 'F2', 'B']);
    });

    it('gives a renamed field its stored text when editing a saved note', () => {
        const values = remapFieldValues(['Front', 'Back'], ['Back', 'Soru'], ['F', 'B'], ['F', 'B'], ['B', 'F']);
        expect(values).toEqual(['B', 'F']);
    });

    it('follows names in the Add screen, where nothing is stored yet', () => {
        expect(remapFieldValues(['Front', 'Back'], ['Back', 'Front', 'Extra'], ['F', 'B'], null, null)).toEqual(['B', 'F', '']);
        expect(remapFieldValues(['Front', 'Back', 'Extra'], ['Front', 'Extra'], ['F', 'B', 'E'], null, null)).toEqual(['F', 'E']);
    });
});

describe('remapFieldPositions', () => {
    it('moves a pin with its field and drops a removed one', () => {
        expect([...remapFieldPositions(['Front', 'Back', 'Extra'], ['Extra', 'Front'], new Set([0, 1]))]).toEqual([1]);
        expect([...remapFieldPositions(['Front', 'Back'], ['Back', 'Front'], new Set([1]))]).toEqual([0]);
    });
});
