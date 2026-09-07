/**
 * What the note editor's toolbar knows about the caret.
 *
 * The WebView bridge (`lib/richTextCommands.ts`) reads raw signals out of the document — which
 * `queryCommandState` commands answer true, which of them cover the selection only partly, the
 * block element the caret sits in, how deep the lists and quotes around it nest, and whether its
 * own edit counter has anything to undo. Turning those signals into "is this button lit" and
 * "is this button greyed out" is ordinary logic, so it lives here where it can be tested without
 * a DOM, and `app/editor.tsx` renders nothing the toolbar has not been told.
 */

import {
    EDITOR_FONT_FAMILIES,
    EDITOR_FONT_SIZES,
    EDITOR_LINE_SPACINGS,
    isFontSizeAtLimit,
    type EditorBlockStyleKey,
    type EditorFontFamilyKey,
    type EditorFontSize,
    type EditorLineSpacing,
    type EditorToolKey,
} from './editorToolbar';

/** Raw reading posted by the bridge. Every field is untrusted until `parseEditorFormatSignals`. */
export interface EditorFormatSignals {
    /** The caret is inside the editor's own content. */
    inEditor: boolean;
    collapsed: boolean;
    /** `queryCommandState` commands that answered true and cover the whole selection. */
    active: string[];
    /** Inline commands that cover the selection only partly. */
    partial: string[];
    /** Lowercase tag name of the block element around the caret, when there is one. */
    block: string | null;
    listDepth: number;
    quoteDepth: number;
    canUndo: boolean;
    canRedo: boolean;
    /** Inline `font-size` declared on the caret's nearest styled ancestor, or '' for none. */
    fontSize: string;
    /** Inline `font-family` declared on the caret's nearest styled ancestor, or '' for none. */
    fontFamily: string;
    /** Inline `line-height` declared on the caret's nearest styled ancestor, or '' for none. */
    lineHeight: string;
    /** The selected text, for Change Case. Empty at a collapsed caret, and capped in length. */
    selectionText: string;
    /** The selection's true length, which exceeds `selectionText` when the reading was capped. */
    selectionLength: number;
}

export interface EditorFormatState {
    inEditor: boolean;
    collapsed: boolean;
    active: ReadonlySet<string>;
    partial: ReadonlySet<string>;
    /** The Styles-tab entry the caret sits in, or null when no button should light up. */
    block: EditorBlockStyleKey | null;
    listDepth: number;
    quoteDepth: number;
    canUndo: boolean;
    canRedo: boolean;
    canIndent: boolean;
    canOutdent: boolean;
    /** The size keyword the grow/shrink buttons step from. */
    fontSize: EditorFontSize;
    /** The family entry the font control shows as chosen. */
    fontFamily: EditorFontFamilyKey;
    /** The spacing the line-spacing control shows as chosen. */
    lineSpacing: EditorLineSpacing;
    selectionText: string;
}

/**
 * Deeper than this and a list item is too narrow to read on a phone; Word stops offering the
 * indent at its own limit rather than silently ignoring the press, and so does this toolbar.
 */
export const MAX_LIST_NESTING = 6;

export const EMPTY_EDITOR_FORMAT_STATE: EditorFormatState = {
    inEditor: false,
    collapsed: true,
    active: new Set<string>(),
    partial: new Set<string>(),
    block: null,
    listDepth: 0,
    quoteDepth: 0,
    canUndo: false,
    canRedo: false,
    canIndent: true,
    canOutdent: false,
    fontSize: 'medium',
    fontFamily: 'default',
    lineSpacing: 1,
    selectionText: '',
};

/** Toolbar keys whose lit state is a `queryCommandState` command under a different name. */
const TOOL_STATE_COMMANDS: Partial<Record<EditorToolKey, string>> = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'strikeThrough',
    subscript: 'subscript',
    superscript: 'superscript',
    listBullet: 'insertUnorderedList',
    listNumber: 'insertOrderedList',
    justifyLeft: 'justifyLeft',
    justifyCenter: 'justifyCenter',
    justifyRight: 'justifyRight',
    justifyFull: 'justifyFull',
};

/** Toolbar keys that are a block format rather than a command state. */
const TOOL_BLOCK_KEYS: Partial<Record<EditorToolKey, EditorBlockStyleKey>> = {
    p: 'p',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    blockquote: 'blockquote',
    pre: 'pre',
};

/**
 * The Styles entry a block tag belongs to.
 *
 * `div` is what a contenteditable document produces for an unstyled paragraph, so it reads as
 * normal text. A list item and a heading level the toolbar does not offer light nothing up rather
 * than pointing at a style the user did not choose.
 */
export function normalizeBlockTag(tag: unknown): EditorBlockStyleKey | null {
    if (typeof tag !== 'string') return null;
    const clean = tag.trim().toLowerCase().replace(/^<|>$/g, '');
    if (clean === 'p' || clean === 'div' || clean === 'body') return 'p';
    if (clean === 'h1' || clean === 'h2' || clean === 'h3') return clean;
    if (clean === 'blockquote' || clean === 'pre') return clean;
    return null;
}

function stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string');
}

/** A non-negative count with no upper clamp, unlike `depth`, which bounds nesting. */
function count(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

function depth(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.min(64, Math.max(0, Math.floor(value)));
}

/** Reads a bridge message into signals, treating anything malformed as "nothing is active". */
export function parseEditorFormatSignals(raw: unknown): EditorFormatSignals {
    const message = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        inEditor: message.inEditor === true,
        collapsed: message.collapsed !== false,
        active: stringList(message.active),
        partial: stringList(message.partial),
        block: typeof message.block === 'string' ? message.block : null,
        listDepth: depth(message.listDepth),
        quoteDepth: depth(message.quoteDepth),
        canUndo: message.canUndo === true,
        canRedo: message.canRedo === true,
        fontSize: typeof message.fontSize === 'string' ? message.fontSize : '',
        fontFamily: typeof message.fontFamily === 'string' ? message.fontFamily : '',
        lineHeight: typeof message.lineHeight === 'string' ? message.lineHeight : '',
        selectionText: typeof message.selectionText === 'string' ? message.selectionText : '',
        selectionLength: count(message.selectionLength),
    };
}

/** The size keyword a declaration names, or `medium` for anything the ladder does not offer. */
function readFontSize(declared: string): EditorFontSize {
    const clean = declared.trim().toLowerCase();
    return (EDITOR_FONT_SIZES as readonly string[]).includes(clean) ? (clean as EditorFontSize) : 'medium';
}

/**
 * The family entry a declaration names.
 *
 * The stacks are compared on their first face rather than character by character, because the
 * document round-trips a declaration through the DOM, which re-spaces and re-quotes it. Matching
 * the head of the stack is what keeps the control lit after a save and reload.
 */
function readFontFamily(declared: string): EditorFontFamilyKey {
    const head = (value: string) => value.split(',')[0]!.trim().toLowerCase().replace(/^["']|["']$/g, '');
    const first = head(declared);
    if (!first) return 'default';
    const match = EDITOR_FONT_FAMILIES.find((entry) => entry.css !== null && head(entry.css) === first);
    return match?.key ?? 'default';
}

/** The spacing a declaration names, or 1 for anything the menu does not offer. */
function readLineSpacing(declared: string): EditorLineSpacing {
    const parsed = Number.parseFloat(declared);
    return EDITOR_LINE_SPACINGS.find((entry) => Math.abs(entry - parsed) < 0.001) ?? 1;
}

export function deriveEditorFormatState(signals: EditorFormatSignals): EditorFormatState {
    return {
        inEditor: signals.inEditor,
        collapsed: signals.collapsed,
        active: new Set(signals.active),
        partial: new Set(signals.partial),
        block: normalizeBlockTag(signals.block),
        listDepth: signals.listDepth,
        quoteDepth: signals.quoteDepth,
        canUndo: signals.canUndo,
        canRedo: signals.canRedo,
        canIndent: signals.listDepth < MAX_LIST_NESTING,
        // Outdent only has somewhere to go from inside a list or a quote; anywhere else the press
        // would be swallowed, which is exactly the silent no-op the button must not offer.
        canOutdent: signals.listDepth > 0 || signals.quoteDepth > 0,
        fontSize: readFontSize(signals.fontSize),
        fontFamily: readFontFamily(signals.fontFamily),
        lineSpacing: readLineSpacing(signals.lineHeight),
        // A capped reading is reported as no selection at all: Change Case would otherwise write
        // the truncated text back over the whole run and destroy the rest of it.
        selectionText: signals.selectionLength > signals.selectionText.length ? '' : signals.selectionText,
    };
}

/** Convenience for the message handler: raw bridge payload straight to toolbar state. */
export function readEditorFormatState(raw: unknown): EditorFormatState {
    return deriveEditorFormatState(parseEditorFormatSignals(raw));
}

/** Whether the toolbar button for `key` should be drawn as on. */
export function isEditorToolActive(key: EditorToolKey, state: EditorFormatState): boolean {
    const command = TOOL_STATE_COMMANDS[key];
    if (command) return state.active.has(command);
    const block = TOOL_BLOCK_KEYS[key];
    if (block) return state.inEditor && state.block === block;
    return false;
}

/** Whether the toolbar button for `key` cannot do anything and must be drawn as disabled. */
export function isEditorToolDisabled(key: EditorToolKey, state: EditorFormatState): boolean {
    if (key === 'undo') return !state.canUndo;
    if (key === 'redo') return !state.canRedo;
    if (key === 'indent') return !state.canIndent;
    if (key === 'outdent') return !state.canOutdent;
    // Word greys out grow/shrink at the ends of its size ladder rather than swallowing the press.
    if (key === 'growFont') return isFontSizeAtLimit(state.fontSize, 1);
    if (key === 'shrinkFont') return isFontSizeAtLimit(state.fontSize, -1);
    // Change Case acts on a run of text; at a collapsed caret there is nothing to recase.
    if (key === 'changeCase') return !state.selectionText;
    return false;
}
