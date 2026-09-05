import { describe, expect, it } from 'vitest';
import {
    editorDraftKey,
    hasEditorDraftChanged,
    isDraftContentBlank,
    isFieldContentBlank,
    type EditorDraftState,
} from './editorDraft';

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
        expect(hasEditorDraftChanged(editorDraftKey(initialDraft, true), { ...initialDraft }, true)).toBe(false);
    });

    it('detects persisted field and metadata changes', () => {
        const initialKey = editorDraftKey(initialDraft, true);

        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, question: 'Yeni soru' }, true)).toBe(true);
        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, deckId: 11 }, true)).toBe(true);
        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, cardTypeId: 2 }, true)).toBe(true);
        expect(hasEditorDraftChanged(initialKey, { ...initialDraft, tags: ['python'] }, true)).toBe(true);
    });

    it('does not treat save-time normalization or tag ordering as a change', () => {
        const initialKey = editorDraftKey(initialDraft, true);
        const equivalentDraft = {
            ...initialDraft,
            question: '  Soru\r\n',
            answer: 'Cevap  ',
            tags: ['temel', 'python', 'python'],
        };

        expect(hasEditorDraftChanged(initialKey, equivalentDraft, true)).toBe(false);
    });

    it('compares the optional reverse field only for its supporting note type', () => {
        const basicKey = editorDraftKey(initialDraft, true);
        expect(hasEditorDraftChanged(basicKey, { ...initialDraft, reverseAnswer: 'Gizli değer' }, true)).toBe(false);

        const reverseDraft = { ...initialDraft, cardTypeId: 7, reverseAnswer: 'Ters cevap' };
        expect(hasEditorDraftChanged(editorDraftKey(reverseDraft, true), { ...reverseDraft, reverseAnswer: 'Değişti' }, true)).toBe(true);
    });

    it('does not report an untouched blank card as changed', () => {
        const blankDraft: EditorDraftState = {
            question: '',
            answer: '',
            reverseAnswer: '',
            cardTypeId: 1,
            deckId: 1,
            tags: [],
        };
        const blankKey = editorDraftKey(blankDraft, false);
        expect(hasEditorDraftChanged(blankKey, blankDraft, false)).toBe(false);
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, question: '   ' }, false)).toBe(false);
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, question: '<p><br></p>' }, false)).toBe(false);
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, question: '<br>' }, false)).toBe(false);
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, question: '<div><br></div>' }, false)).toBe(false);
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, answer: '<p>&nbsp;</p>' }, false)).toBe(false);
        // Selecting another deck in add mode must never report changed:
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, deckId: 2 }, false)).toBe(false);
        // Changing note type when content is empty must never report changed:
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, cardTypeId: 2 }, false)).toBe(false);
        // Typing actual content reports changed:
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, question: 'Soru' }, false)).toBe(true);
        expect(hasEditorDraftChanged(blankKey, { ...blankDraft, answer: 'Cevap' }, false)).toBe(true);
    });

    it('does not treat selecting a deck in add mode as a change even if fields have sticky text', () => {
        const stickyDraft: EditorDraftState = {
            question: '',
            answer: 'Sabit cevap',
            reverseAnswer: '',
            cardTypeId: 1,
            deckId: 1,
            tags: [],
        };
        const stickyKey = editorDraftKey(stickyDraft, false);
        // Selecting another deck in add mode does not mark draft dirty:
        expect(hasEditorDraftChanged(stickyKey, { ...stickyDraft, deckId: 5 }, false)).toBe(false);
        // Modifying the actual text DOES mark draft dirty:
        expect(hasEditorDraftChanged(stickyKey, { ...stickyDraft, answer: 'Farklı cevap' }, false)).toBe(true);
    });

    it('treats media tags as non-blank content', () => {
        expect(isFieldContentBlank('<img src="test.png">')).toBe(false);
        expect(isFieldContentBlank('[sound:audio.mp3]')).toBe(false);
        expect(isFieldContentBlank('<video src="clip.mp4"></video>')).toBe(false);
        expect(isFieldContentBlank('<p><br></p>')).toBe(true);
        expect(isFieldContentBlank('&nbsp;')).toBe(true);
        expect(isFieldContentBlank('')).toBe(true);
        expect(isFieldContentBlank('   \n  ')).toBe(true);
    });

    it('returns false when initial draft key is null', () => {
        expect(hasEditorDraftChanged(null, initialDraft, false)).toBe(false);
        expect(hasEditorDraftChanged(null, initialDraft, true)).toBe(false);
    });

    it('correctly evaluates isDraftContentBlank', () => {
        expect(isDraftContentBlank({
            question: '<p><br></p>',
            answer: '',
            reverseAnswer: '',
            cardTypeId: 1,
            deckId: 1,
            tags: [],
        })).toBe(true);

        expect(isDraftContentBlank({
            question: 'Soru metni',
            answer: '',
            reverseAnswer: '',
            cardTypeId: 1,
            deckId: 1,
            tags: [],
        })).toBe(false);
    });

    it('handles dynamic multi-field draft states', () => {
        const multiDraft: EditorDraftState = {
            fields: ['Kelime', 'Anlam', 'Örnek Cümle', 'Notlar'],
            cardTypeId: 50,
            deckId: 2,
            tags: ['ingilizce'],
        };
        const key = editorDraftKey(multiDraft, true);

        expect(hasEditorDraftChanged(key, multiDraft, true)).toBe(false);
        expect(hasEditorDraftChanged(key, { ...multiDraft, fields: ['Kelime', 'Anlam', 'Farklı Cümle', 'Notlar'] }, true)).toBe(true);

        const blankMulti: EditorDraftState = {
            fields: ['', '<p><br></p>', '   ', '&nbsp;'],
            cardTypeId: 50,
            deckId: 2,
            tags: [],
        };
        expect(isDraftContentBlank(blankMulti)).toBe(true);
        expect(hasEditorDraftChanged(editorDraftKey(blankMulti, false), blankMulti, false)).toBe(false);
    });
});
