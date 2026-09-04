// The formatting bridge runs inside the editor WebView, so it is exercised here against a fake
// DOM that records exactly which selection calls it makes. The point of these tests is the
// decision, not the rendering: WebKit throws away a pending typing style whenever the selection
// is reassigned, so "did the bridge leave the live caret alone?" is the behaviour that decides
// whether pressing Bold with nothing selected still bolds the next characters.

import { describe, expect, it } from 'vitest';
import {
    EDITOR_SHORTCUTS,
    PENDING_STYLE_MARKER,
    resolveEditorShortcut,
    richTextBridgeScript,
    stripPendingStyleMarkers,
} from './richTextCommands';

type FakeNode = { parent?: FakeNode; length?: number };

interface FakeRange {
    startContainer: FakeNode;
    startOffset: number;
    endContainer: FakeNode;
    endOffset: number;
    commonAncestorContainer: FakeNode;
    collapsed: boolean;
    selectNodeContents(node: FakeNode): void;
    collapse(toStart: boolean): void;
    setStart(node: FakeNode, offset: number): void;
    cloneRange(): FakeRange;
}

/**
 * Builds the document the bridge talks to.
 *
 * `commandStates` decides what `queryCommandState` reports, and `execCommandApplies` whether
 * `execCommand` is allowed to change it — that pairing is what lets a test stage "WebKit accepted
 * the toggle" against "WebKit silently dropped it at a collapsed caret".
 */
function createFakeDom(options: { execCommandApplies?: boolean } = {}) {
    const applies = options.execCommandApplies !== false;
    const editor: FakeNode & { focus(): void; contains(node: FakeNode | null): boolean } = {
        focus: () => { dom.activeElement = editor; },
        contains: (node) => {
            for (let walk = node; walk; walk = walk.parent as FakeNode) {
                if (walk === editor) return true;
            }
            return false;
        },
    };
    const textNode: FakeNode = { parent: editor, length: 5 };
    const calls: string[] = [];
    const commandStates: Record<string, boolean> = {};
    const anchors = new Map<string, any>();

    const makeRange = (container: FakeNode, offset: number, endOffset = offset): FakeRange => {
        const range: FakeRange = {
            startContainer: container,
            startOffset: offset,
            endContainer: container,
            endOffset,
            commonAncestorContainer: container,
            get collapsed() { return range.startContainer === range.endContainer && range.startOffset === range.endOffset; },
            selectNodeContents(node) {
                range.startContainer = node;
                range.endContainer = node;
                range.commonAncestorContainer = node;
                range.startOffset = 0;
                range.endOffset = 1;
            },
            collapse(toStart) {
                if (toStart) range.endOffset = range.startOffset;
                else range.startOffset = range.endOffset;
            },
            setStart(node, start) {
                range.startContainer = node;
                range.commonAncestorContainer = node;
                range.startOffset = start;
                range.endContainer = node;
                range.endOffset = start;
            },
            cloneRange: () => makeRange(range.startContainer, range.startOffset, range.endOffset),
        } as FakeRange;
        return range;
    };

    let currentRange: FakeRange | null = makeRange(textNode, 2);
    const selection = {
        get rangeCount() { return currentRange ? 1 : 0; },
        getRangeAt: () => currentRange as FakeRange,
        removeAllRanges() { calls.push('removeAllRanges'); currentRange = null; },
        addRange(range: FakeRange) { calls.push('addRange'); currentRange = range; },
    };

    const dom = {
        activeElement: editor as FakeNode | null,
        hasFocus: () => documentHasFocus,
        getSelection: () => selection,
        createRange: () => makeRange(editor, 0),
        queryCommandState: (command: string) => Boolean(commandStates[command]),
        execCommand: (command: string, _showUi: boolean, value: string | null) => {
            calls.push(`exec:${command}`);
            calls.push(`exec:${command}:${value === null || value === undefined ? 'null' : value}`);
            if (command === 'insertHTML' && typeof value === 'string') {
                const id = /id="([^"]+)"/.exec(value)?.[1];
                if (id) {
                    const marker: FakeNode = { parent: editor, length: 1 };
                    anchors.set(id, { removeAttribute: () => undefined, firstChild: marker });
                }
                return true;
            }
            if (applies) commandStates[command] = !commandStates[command];
            return applies;
        },
        getElementById: (id: string) => anchors.get(id) ?? null,
    };

    let documentHasFocus = true;
    const bridge = new Function(`${richTextBridgeScript()}\nreturn createTusFormattingBridge;`)()(editor, dom);

    return {
        bridge,
        calls,
        commandStates,
        editor,
        textNode,
        selectCaretAt: (offset: number) => { currentRange = makeRange(textNode, offset); },
        selectRange: (start: number, end: number) => { currentRange = makeRange(textNode, start, end); },
        blurEditor: () => { dom.activeElement = null; },
        selectOutsideEditor: () => { currentRange = makeRange({ length: 1 }, 0); },
        blurDocument: () => { documentHasFocus = false; },
        currentOffset: () => currentRange?.startOffset ?? null,
    };
}

/**
 * A document whose caret sits inside one named block element, for the Enter-key normalization.
 * Only the ancestor walk and `execCommand` matter there, so the rest of the DOM stays absent.
 */
function createBlockDom(tagName: string, text: string) {
    const calls: string[] = [];
    const editor: any = {
        nodeType: 1,
        tagName: 'DIV',
        focus: () => undefined,
        contains: () => true,
    };
    const block: any = { nodeType: 1, tagName, textContent: text, parentElement: editor };
    const textNode: any = { nodeType: 3, nodeValue: text, parentElement: block, length: text.length };
    const range: any = {
        startContainer: textNode,
        startOffset: 0,
        endContainer: textNode,
        endOffset: 0,
        commonAncestorContainer: textNode,
        collapsed: true,
        cloneRange: () => range,
    };
    const dom: any = {
        activeElement: editor,
        hasFocus: () => true,
        getSelection: () => ({ rangeCount: 1, getRangeAt: () => range, removeAllRanges() {}, addRange() {} }),
        createRange: () => range,
        queryCommandState: () => false,
        execCommand: (command: string, _showUi: boolean, value: string | null) => {
            calls.push(`exec:${command}:${value === null || value === undefined ? 'null' : value}`);
            return true;
        },
        getElementById: () => null,
    };
    const bridge = new Function(`${richTextBridgeScript()}\nreturn createTusFormattingBridge;`)()(editor, dom);
    return { bridge, calls };
}

describe('rich text selection handling', () => {
    it('leaves a live caret untouched so the pending typing style survives', () => {
        const dom = createFakeDom();
        dom.bridge.saveSelection();
        dom.calls.length = 0;

        expect(dom.bridge.restoreSelection()).toBe('keep-live');
        // Reassigning the selection is what clears WebKit's typing style; it must not happen here.
        expect(dom.calls).not.toContain('removeAllRanges');
        expect(dom.calls).not.toContain('addRange');
    });

    it('puts the caret back when the editor lost focus', () => {
        const dom = createFakeDom();
        dom.bridge.saveSelection();
        dom.blurEditor();
        dom.calls.length = 0;

        expect(dom.bridge.restoreSelection()).toBe('restore-saved');
        expect(dom.calls).toEqual(['removeAllRanges', 'addRange']);
        expect(dom.currentOffset()).toBe(2);
    });

    it('treats an unfocused document as a lost caret even while activeElement still points at the editor', () => {
        const dom = createFakeDom();
        dom.bridge.saveSelection();
        dom.blurDocument();

        expect(dom.bridge.restoreSelection()).toBe('restore-saved');
    });

    it('collapses to the end of the content when there is nothing saved to restore', () => {
        const dom = createFakeDom();
        dom.blurEditor();

        expect(dom.bridge.restoreSelection()).toBe('collapse-to-end');
    });

    it('tracks the caret as it moves so a later restore uses the newest position', () => {
        const dom = createFakeDom();
        dom.bridge.saveSelection();
        dom.selectCaretAt(4);
        dom.bridge.restoreSelection();
        dom.blurEditor();
        dom.bridge.restoreSelection();

        expect(dom.currentOffset()).toBe(4);
    });
});

describe('rich text commands at a collapsed caret', () => {
    it('arms the next characters when execCommand silently does nothing', () => {
        const dom = createFakeDom({ execCommandApplies: false });

        const result = dom.bridge.runCommand('bold', null);

        // The toggle changed no state, so the caret is parked inside an empty <b> instead.
        expect(result.repair).toBe('anchor');
        expect(dom.calls.filter((call) => call === 'exec:insertHTML')).toHaveLength(1);
    });

    it('does not touch the document when execCommand already applied the format', () => {
        const dom = createFakeDom();

        const result = dom.bridge.runCommand('bold', null);

        expect(result).toMatchObject({ applied: true, repair: 'none', state: true });
        expect(dom.calls).not.toContain('exec:insertHTML');
    });

    it('reports the real state instead of faking a format the caret cannot step out of', () => {
        const dom = createFakeDom({ execCommandApplies: false });
        dom.commandStates.bold = true;

        // Turning bold off at a collapsed caret has no wrapper to leave, so there is nothing to
        // repair; the toolbar must show what the document actually holds.
        expect(dom.bridge.runCommand('bold', null)).toMatchObject({ repair: 'none', state: true });
    });

    it('chains two formats without ever reassigning the selection', () => {
        const dom = createFakeDom();
        dom.bridge.saveSelection();
        dom.calls.length = 0;

        dom.bridge.runCommand('bold', null);
        dom.bridge.runCommand('italic', null);

        // The reported regression: the second press used to throw away the first press's style.
        expect(dom.calls.filter((call) => call === 'removeAllRanges')).toHaveLength(0);
        expect(dom.commandStates).toMatchObject({ bold: true, italic: true });
    });

    it('leaves a real selection to execCommand alone', () => {
        const dom = createFakeDom({ execCommandApplies: false });
        dom.selectRange(1, 4);

        expect(dom.bridge.runCommand('bold', null)).toMatchObject({ repair: 'none' });
        expect(dom.calls).not.toContain('exec:insertHTML');
    });

    it('never tries to arm a command that has no typing style', () => {
        const dom = createFakeDom({ execCommandApplies: false });

        expect(dom.bridge.runCommand('insertUnorderedList', null)).toMatchObject({ repair: 'none' });
        expect(dom.calls).not.toContain('exec:insertHTML');
    });
});

describe('pending style markers', () => {
    it('strips the marker and the wrapper it left empty', () => {
        expect(stripPendingStyleMarkers(`<b>${PENDING_STYLE_MARKER}</b>`)).toBe('');
        expect(stripPendingStyleMarkers(`Soru <i><b>${PENDING_STYLE_MARKER}</b></i>`)).toBe('Soru ');
        expect(stripPendingStyleMarkers(`<b>${PENDING_STYLE_MARKER}kalın</b>`)).toBe('<b>kalın</b>');
    });

    it('returns markup that never carried a marker untouched', () => {
        // An imported note may legitimately hold an empty tag; only a marker justifies removing one.
        const untouched = '<b></b><span class="x"></span>Soru';
        expect(stripPendingStyleMarkers(untouched)).toBe(untouched);
    });
});

describe('keyboard shortcuts', () => {
    it('only answers to a Cmd or Ctrl press', () => {
        expect(resolveEditorShortcut({ key: 'b' })).toBeNull();
        expect(resolveEditorShortcut({ key: 'b', metaKey: true })).toEqual({ command: 'bold' });
        expect(resolveEditorShortcut({ key: 'B', ctrlKey: true })).toEqual({ command: 'bold' });
    });

    it('separates the shifted and alt-ed bindings from their base key', () => {
        expect(resolveEditorShortcut({ key: 'z', metaKey: true })).toEqual({ command: 'undo' });
        expect(resolveEditorShortcut({ key: 'z', metaKey: true, shiftKey: true })).toEqual({ command: 'redo' });
        expect(resolveEditorShortcut({ key: '=', metaKey: true })).toEqual({ command: 'subscript' });
        expect(resolveEditorShortcut({ key: '=', metaKey: true, shiftKey: true })).toEqual({ command: 'superscript' });
        expect(resolveEditorShortcut({ key: '2', metaKey: true, altKey: true })).toEqual({ command: 'formatBlock', value: '<h2>' });
        // Without Alt the digit is a plain keystroke, not a heading.
        expect(resolveEditorShortcut({ key: '2', metaKey: true })).toBeNull();
    });

    it('binds no key twice with the same modifiers', () => {
        const seen = EDITOR_SHORTCUTS.map((shortcut) => `${shortcut.key.toLowerCase()}|${!!shortcut.shift}|${!!shortcut.alt}`);
        expect(new Set(seen).size).toBe(seen.length);
    });

    it('resolves inside the bridge exactly as it does outside it', () => {
        const dom = createFakeDom();
        EDITOR_SHORTCUTS.forEach((shortcut) => {
            const event = { key: shortcut.key, metaKey: true, shiftKey: !!shortcut.shift, altKey: !!shortcut.alt };
            expect(dom.bridge.resolveShortcut(event)).toEqual(resolveEditorShortcut(event));
        });
        expect(dom.bridge.resolveShortcut({ key: 'q', metaKey: true })).toBeNull();
    });
});

describe('undo history accounting', () => {
    it('offers nothing to undo until the document has been edited', () => {
        const dom = createFakeDom();

        expect(dom.bridge.historyState()).toMatchObject({ canUndo: false, canRedo: false });
        // A press with nothing to undo must not pretend it moved the document.
        expect(dom.bridge.runCommand('undo', null)).toMatchObject({ applied: false });
        expect(dom.calls).not.toContain('exec:undo');
    });

    it('gives every toolbar press its own step and coalesces a typing run into one', () => {
        const dom = createFakeDom();

        dom.bridge.noteEdit('typing');
        dom.bridge.noteEdit('typing');
        expect(dom.bridge.historyState().depth).toBe(1);

        dom.bridge.runCommand('bold', null);
        dom.bridge.runCommand('italic', null);
        expect(dom.bridge.historyState().depth).toBe(3);
    });

    it('does not count a press that changed nothing', () => {
        const dom = createFakeDom({ execCommandApplies: false });

        // insertUnorderedList has no pending-style repair, so a refused press edits nothing.
        dom.bridge.runCommand('insertUnorderedList', null);
        expect(dom.bridge.historyState()).toMatchObject({ canUndo: false });
    });

    it('walks the counter back and forth over undo and redo', () => {
        const dom = createFakeDom();
        dom.bridge.runCommand('bold', null);

        expect(dom.bridge.runCommand('undo', null)).toMatchObject({ applied: true });
        expect(dom.bridge.historyState()).toMatchObject({ canUndo: false, canRedo: true });

        expect(dom.bridge.runCommand('redo', null)).toMatchObject({ applied: true });
        expect(dom.bridge.historyState()).toMatchObject({ canUndo: true, canRedo: false });

        // A new edit is a new branch: the redo that was on offer is gone.
        dom.bridge.runCommand('undo', null);
        dom.bridge.noteEdit('typing');
        expect(dom.bridge.historyState()).toMatchObject({ canRedo: false });
    });

    it('does not let the input event raised by its own edit count a second time', () => {
        const dom = createFakeDom();

        // editDocument mirrors what an inserted image or a custom toolbar button does: the
        // execCommand inside it raises `input`, which the document reports back as typing.
        dom.bridge.editDocument(() => { dom.bridge.noteEdit('typing'); return true; });

        expect(dom.bridge.historyState().depth).toBe(1);
    });
});

describe('caret state reporting', () => {
    it('reports the commands the caret sits in', () => {
        const dom = createFakeDom();
        dom.commandStates.bold = true;
        dom.commandStates.insertUnorderedList = true;

        const signals = dom.bridge.readSignals();
        expect(signals.inEditor).toBe(true);
        expect(signals.active).toContain('bold');
        expect(signals.active).toContain('insertUnorderedList');
        expect(signals.active).not.toContain('italic');
    });

    it('reports nothing active once the caret is outside the editor', () => {
        const dom = createFakeDom();
        dom.selectOutsideEditor();

        expect(dom.bridge.readSignals()).toMatchObject({ inEditor: false, active: [], block: null });
    });

    it('carries the history counters so the toolbar can grey out undo and redo', () => {
        const dom = createFakeDom();
        expect(dom.bridge.readSignals()).toMatchObject({ canUndo: false, canRedo: false });

        dom.bridge.runCommand('bold', null);
        expect(dom.bridge.readSignals()).toMatchObject({ canUndo: true, canRedo: false });
    });
});

describe('Enter inside a heading or a quote', () => {
    it('turns the empty block Enter created into a normal paragraph', () => {
        const dom = createBlockDom('H2', '');

        expect(dom.bridge.normalizeBlockAfterEnter()).toBe(true);
        expect(dom.calls).toContain('exec:formatBlock:<p>');
    });

    it('leaves a heading the user is still writing in alone', () => {
        const dom = createBlockDom('H2', 'Kalp yetmezliği');

        expect(dom.bridge.normalizeBlockAfterEnter()).toBe(false);
        expect(dom.calls).toEqual([]);
    });

    it('steps a quote out of its indent as well as renaming the block', () => {
        const dom = createBlockDom('BLOCKQUOTE', '');

        expect(dom.bridge.normalizeBlockAfterEnter()).toBe(true);
        expect(dom.calls).toContain('exec:outdent:null');
    });

    it('leaves a list item to the browser, which already handles Enter there', () => {
        const dom = createBlockDom('LI', '');

        expect(dom.bridge.normalizeBlockAfterEnter()).toBe(false);
    });
});
