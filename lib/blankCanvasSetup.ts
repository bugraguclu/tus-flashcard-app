// The page setup the drawing sheet opens with, remembered between drawings.
//
// Neither Anki nor AnkiDroid has a blank drawing page — AnkiDroid's whiteboard is a reviewer
// overlay, not an attachment surface — so there is no upstream contract to follow here. What is
// borrowed is the habit every one of those clients keeps: a tool opens the way the learner last
// left it. Somebody who writes on dark squared paper should not have to rebuild that page for
// every card.
//
// The row is local, like the reviewer's board state in `lib/whiteboardSession.ts`: it describes
// the device in the learner's hand, not the collection, and stays out of the exported package.

import {
    BLANK_CANVAS_BACKGROUNDS,
    BLANK_CANVAS_PAPERS,
    BLANK_CANVAS_SHAPES,
    DEFAULT_BLANK_CANVAS_PAGE,
    defaultBlankCanvasRuling,
    type BlankCanvasPage,
    type BlankCanvasPaper,
    type BlankCanvasShape,
} from './blankCanvas';
import { getDbSetting, setDbSetting } from './storage';

export interface BlankCanvasSetup {
    paper: BlankCanvasPaper;
    /** One of the offered page colours, as a hex string. */
    background: string;
    shape: BlankCanvasShape;
}

export const DEFAULT_BLANK_CANVAS_SETUP: BlankCanvasSetup = {
    paper: DEFAULT_BLANK_CANVAS_PAGE.paper,
    background: DEFAULT_BLANK_CANVAS_PAGE.background,
    shape: BLANK_CANVAS_SHAPES[0].id,
};

const SETTING_KEY = 'blankCanvasSetup';

/**
 * Read a stored setup, taking only choices the sheet still offers.
 *
 * Every field falls back on its own, so a row written by a build with a different set of papers
 * or colours restores what it can rather than throwing the whole setup away.
 */
export function parseBlankCanvasSetup(raw: unknown): BlankCanvasSetup {
    if (typeof raw !== 'string' || raw.trim() === '') return { ...DEFAULT_BLANK_CANVAS_SETUP };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ...DEFAULT_BLANK_CANVAS_SETUP };
    }
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_BLANK_CANVAS_SETUP };
    const record = parsed as Record<string, unknown>;

    const paper = BLANK_CANVAS_PAPERS.find((option) => option === record.paper);
    const background = BLANK_CANVAS_BACKGROUNDS
        .find((option) => option.color === record.background)?.color;
    const shape = BLANK_CANVAS_SHAPES.find((option) => option.id === record.shape)?.id;

    return {
        paper: paper ?? DEFAULT_BLANK_CANVAS_SETUP.paper,
        background: background ?? DEFAULT_BLANK_CANVAS_SETUP.background,
        shape: shape ?? DEFAULT_BLANK_CANVAS_SETUP.shape,
    };
}

export function serializeBlankCanvasSetup(setup: BlankCanvasSetup): string {
    return JSON.stringify({
        paper: setup.paper,
        background: setup.background,
        shape: setup.shape,
    });
}

/** The page this setup describes, ruled and sized for export. */
export function blankCanvasPageFromSetup(setup: BlankCanvasSetup): BlankCanvasPage {
    const shape = BLANK_CANVAS_SHAPES.find((option) => option.id === setup.shape) ?? BLANK_CANVAS_SHAPES[0];
    return {
        background: setup.background,
        paper: setup.paper,
        width: shape.width,
        height: shape.height,
        ruling: defaultBlankCanvasRuling(shape.width, shape.height),
    };
}

export function loadBlankCanvasSetup(): BlankCanvasSetup {
    return parseBlankCanvasSetup(getDbSetting(SETTING_KEY));
}

export function saveBlankCanvasSetup(setup: BlankCanvasSetup): void {
    setDbSetting(SETTING_KEY, serializeBlankCanvasSetup(setup));
}
