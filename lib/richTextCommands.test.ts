// The formatting bridge runs inside the editor WebView, so it is exercised here against a fake
// DOM that records exactly which selection calls it makes. The point of these tests is the
// decision, not the rendering: WebKit throws away a pending typing style whenever the selection
// is reassigned, so "did the bridge leave the live caret alone?" is the behaviour that decides
// whether pressing Bold with nothing selected still bolds the next characters.

import { describe, expect, it } from 'vitest';
import {
    PENDING_STYLE_MARKER,
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
        blurDocument: () => { documentHasFocus = false; },
        currentOffset: () => currentRange?.startOffset ?? null,
    };
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
