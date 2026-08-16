import { describe, expect, it } from 'vitest';
import { editorDraftKey, hasEditorDraftChanged, type EditorDraftState } from './editorDraft';

const initialDraft: EditorDraftState = {
    question: 'Soru',
    answer: 'Cevap',
    reverseAnswer: '',
    cardTypeId: 1,
    deckId: 10,
    tags: ['python', 'temel'],
};

describe('editor draft changes', () => {
    it('does not report an untouched existing card as changed', () => {
        expect(hasEditorDraftChanged(editorDraftKey(initialDraft), { ...initialDraft })).toBe(false);
    });

    it('detects persisted field and metadata changes', () => {
        const initialKey = editorDraftKey(initialDraft);

        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, question: 'Yeni soru' })).toBe(true);
        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, deckId: 11 })).toBe(true);
        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, cardTypeId: 2 })).toBe(true);
        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, tags: ['python'] })).toBe(true);
    });

    it('does not treat save-time normalization or tag ordering as a change', () => {
        const initialKey = editorDraftKey(initialDraft);
        const equivalentDraft = {
            ...initialDraft,
            question: '  Soru\r\n',
            answer: 'Cevap  ',
            tags: ['temel', 'python', 'python'],
        };

        expect(hasEditorDraftChanged(initialKey, equivalentDraft)).toBe(false);
    });

    it('compares the optional reverse field only for its supporting note type', () => {
        const basicKey = editorDraftKey(initialDraft);
        expect(hasEditorDraftChanged(basicKey, { ...initialDraft, reverseAnswer: 'Gizli değer' })).toBe(false);

        const reverseDraft = { ...initialDraft, cardTypeId: 7, reverseAnswer: 'Ters cevap' };
        expect(hasEditorDraftChanged(editorDraftKey(reverseDraft), { ...reverseDraft, reverseAnswer: 'Değişti' })).toBe(true);
    });
});
