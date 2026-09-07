// The toolbar draws exactly what these functions say, so the cases below are the toolbar's
// contract: a button lights up because the caret is in that format, and a button greys out only
// when pressing it could not do anything.

import { describe, expect, it } from 'vitest';
import {
    deriveEditorFormatState,
    EMPTY_EDITOR_FORMAT_STATE,
    isEditorToolActive,
    isEditorToolDisabled,
    MAX_LIST_NESTING,
    normalizeBlockTag,
    parseEditorFormatSignals,
    readEditorFormatState,
    type EditorFormatSignals,
} from './editorFormatState';
import { EDITOR_TOOL_KEYS } from './editorToolbar';

function signals(patch: Partial<EditorFormatSignals> = {}): EditorFormatSignals {
    return {
        inEditor: true,
        collapsed: true,
        active: [],
        partial: [],
        block: 'p',
        listDepth: 0,
        quoteDepth: 0,
        canUndo: false,
        canRedo: false,
        fontSize: '',
        fontFamily: '',
        lineHeight: '',
        selectionText: '',
        selectionLength: 0,
        ...patch,
    };
}

describe('block tag naming', () => {
    it('reads the tag a contenteditable document actually produces', () => {
        expect(normalizeBlockTag('P')).toBe('p');
        // WebKit wraps an unstyled paragraph in a div; the user chose "normal text" either way.
        expect(normalizeBlockTag('div')).toBe('p');
        expect(normalizeBlockTag('<h2>')).toBe('h2');
        expect(normalizeBlockTag(' BLOCKQUOTE ')).toBe('blockquote');
    });

    it('lights nothing up for a block the Styles tab does not offer', () => {
        // A list item and an h5 are real blocks, but pointing at "Heading 1" would be a lie.
        expect(normalizeBlockTag('li')).toBeNull();
        expect(normalizeBlockTag('h5')).toBeNull();
        expect(normalizeBlockTag(undefined)).toBeNull();
        expect(normalizeBlockTag(42)).toBeNull();
    });
});

describe('reading a bridge message', () => {
    it('treats a malformed payload as an idle caret rather than trusting it', () => {
        const state = readEditorFormatState({ active: 'bold', listDepth: 'lots', canUndo: 'yes' });

        expect(state.active.size).toBe(0);
        expect(state.listDepth).toBe(0);
        expect(state.canUndo).toBe(false);
        expect(state.inEditor).toBe(false);
    });

    it('keeps only the string entries of a mixed array', () => {
        expect(parseEditorFormatSignals({ active: ['bold', 7, null, 'italic'] }).active).toEqual(['bold', 'italic']);
    });

    it('survives a payload that is not an object at all', () => {
        expect(readEditorFormatState(null)).toMatchObject({ inEditor: false, block: null });
        expect(readEditorFormatState('bold')).toMatchObject({ inEditor: false });
    });
});

describe('lit toolbar buttons', () => {
    it('lights the inline toggle whose command the caret sits in', () => {
        const state = deriveEditorFormatState(signals({ active: ['bold', 'strikeThrough'] }));

        expect(isEditorToolActive('bold', state)).toBe(true);
        expect(isEditorToolActive('strikethrough', state)).toBe(true);
        expect(isEditorToolActive('italic', state)).toBe(false);
    });

    it('lights the list and the alignment the caret is in', () => {
        const state = deriveEditorFormatState(signals({ active: ['insertOrderedList', 'justifyCenter'], listDepth: 1 }));

        expect(isEditorToolActive('listNumber', state)).toBe(true);
        expect(isEditorToolActive('listBullet', state)).toBe(false);
        expect(isEditorToolActive('justifyCenter', state)).toBe(true);
        expect(isEditorToolActive('justifyLeft', state)).toBe(false);
    });

    it('lights exactly one paragraph style', () => {
        const state = deriveEditorFormatState(signals({ block: 'h2' }));

        expect(isEditorToolActive('h2', state)).toBe(true);
        expect(isEditorToolActive('h1', state)).toBe(false);
        expect(isEditorToolActive('p', state)).toBe(false);
    });

    it('leaves a partly formatted selection unlit, the way Word does', () => {
        // The document reports bold for the selection start; the bridge saw that only half of the
        // selection is bold, so the button stays unlit and the next press bolds all of it.
        const state = deriveEditorFormatState(signals({ collapsed: false, active: [], partial: ['bold'] }));

        expect(isEditorToolActive('bold', state)).toBe(false);
    });

    it('lights nothing while no field owns the toolbar', () => {
        EDITOR_TOOL_KEYS.forEach((key) => {
            expect(isEditorToolActive(key, EMPTY_EDITOR_FORMAT_STATE)).toBe(false);
        });
    });
});

describe('greyed out toolbar buttons', () => {
    it('offers undo and redo only when there is something to move to', () => {
        const idle = deriveEditorFormatState(signals());
        expect(isEditorToolDisabled('undo', idle)).toBe(true);
        expect(isEditorToolDisabled('redo', idle)).toBe(true);

        const edited = deriveEditorFormatState(signals({ canUndo: true }));
        expect(isEditorToolDisabled('undo', edited)).toBe(false);
        expect(isEditorToolDisabled('redo', edited)).toBe(true);
    });

    it('greys out outdent where the press would be swallowed', () => {
        expect(isEditorToolDisabled('outdent', deriveEditorFormatState(signals()))).toBe(true);
        expect(isEditorToolDisabled('outdent', deriveEditorFormatState(signals({ listDepth: 1 })))).toBe(false);
        expect(isEditorToolDisabled('outdent', deriveEditorFormatState(signals({ quoteDepth: 1 })))).toBe(false);
    });

    it('stops offering the indent once the nesting is as deep as it goes', () => {
        expect(isEditorToolDisabled('indent', deriveEditorFormatState(signals({ listDepth: 0 })))).toBe(false);
        expect(isEditorToolDisabled('indent', deriveEditorFormatState(signals({ listDepth: MAX_LIST_NESTING - 1 })))).toBe(false);
        expect(isEditorToolDisabled('indent', deriveEditorFormatState(signals({ listDepth: MAX_LIST_NESTING })))).toBe(true);
    });

    it('never greys out a formatting tool, which always has something to apply', () => {
        const state = deriveEditorFormatState(signals());
        const conditional = ['undo', 'redo', 'indent', 'outdent', 'growFont', 'shrinkFont', 'changeCase'];
        const alwaysEnabled = EDITOR_TOOL_KEYS.filter((key) => !conditional.includes(key));

        alwaysEnabled.forEach((key) => {
            expect(isEditorToolDisabled(key, state)).toBe(false);
        });
    });

    it('stops offering grow and shrink at the ends of the size ladder', () => {
        const middle = deriveEditorFormatState(signals({ fontSize: 'medium' }));
        expect(isEditorToolDisabled('growFont', middle)).toBe(false);
        expect(isEditorToolDisabled('shrinkFont', middle)).toBe(false);

        const largest = deriveEditorFormatState(signals({ fontSize: 'xx-large' }));
        expect(isEditorToolDisabled('growFont', largest)).toBe(true);
        expect(isEditorToolDisabled('shrinkFont', largest)).toBe(false);

        const smallest = deriveEditorFormatState(signals({ fontSize: 'xx-small' }));
        expect(isEditorToolDisabled('growFont', smallest)).toBe(false);
        expect(isEditorToolDisabled('shrinkFont', smallest)).toBe(true);
    });

    it('greys out change case at a caret, which has no run of text to recase', () => {
        expect(isEditorToolDisabled('changeCase', deriveEditorFormatState(signals()))).toBe(true);
        expect(isEditorToolDisabled(
            'changeCase',
            deriveEditorFormatState(signals({ collapsed: false, selectionText: 'istanbul', selectionLength: 8 })),
        )).toBe(false);
    });

    it('greys out change case when the reading was capped, rather than losing the rest', () => {
        // The bridge caps the text it posts. Recasing the capped run and writing it back would
        // replace the whole selection with the shortened text, so the control must go dark.
        const capped = deriveEditorFormatState(signals({
            collapsed: false,
            selectionText: 'a'.repeat(20000),
            selectionLength: 44000,
        }));
        expect(capped.selectionText).toBe('');
        expect(isEditorToolDisabled('changeCase', capped)).toBe(true);

        // A long-but-whole reading is still offered; the length is not itself a limit.
        const whole = deriveEditorFormatState(signals({
            collapsed: false,
            selectionText: 'a'.repeat(5000),
            selectionLength: 5000,
        }));
        expect(isEditorToolDisabled('changeCase', whole)).toBe(false);
    });
});

describe('font, family and spacing readings', () => {
    it('reads a size the ladder offers and falls back to medium for anything else', () => {
        expect(deriveEditorFormatState(signals({ fontSize: 'x-large' })).fontSize).toBe('x-large');
        expect(deriveEditorFormatState(signals({ fontSize: '  LARGE ' })).fontSize).toBe('large');
        expect(deriveEditorFormatState(signals({ fontSize: '14pt' })).fontSize).toBe('medium');
        expect(deriveEditorFormatState(signals({ fontSize: '' })).fontSize).toBe('medium');
    });

    it('matches a family on the head of its stack, as the DOM hands it back re-quoted', () => {
        expect(deriveEditorFormatState(signals({ fontFamily: 'Georgia, "Times New Roman", serif' })).fontFamily)
            .toBe('serif');
        // WebKit re-spaces and re-quotes a declaration on the way out; the head still matches.
        expect(deriveEditorFormatState(signals({ fontFamily: '"Georgia", Times New Roman, serif' })).fontFamily)
            .toBe('serif');
        expect(deriveEditorFormatState(signals({ fontFamily: 'Menlo, monospace' })).fontFamily).toBe('mono');
        expect(deriveEditorFormatState(signals({ fontFamily: 'Papyrus' })).fontFamily).toBe('default');
        expect(deriveEditorFormatState(signals({ fontFamily: '' })).fontFamily).toBe('default');
    });

    it('reads a spacing the menu offers and falls back to single spacing', () => {
        expect(deriveEditorFormatState(signals({ lineHeight: '1.5' })).lineSpacing).toBe(1.5);
        expect(deriveEditorFormatState(signals({ lineHeight: '1.15' })).lineSpacing).toBe(1.15);
        expect(deriveEditorFormatState(signals({ lineHeight: '2' })).lineSpacing).toBe(2);
        expect(deriveEditorFormatState(signals({ lineHeight: '1.7' })).lineSpacing).toBe(1);
        expect(deriveEditorFormatState(signals({ lineHeight: '' })).lineSpacing).toBe(1);
    });
});
