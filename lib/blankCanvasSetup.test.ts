import { describe, expect, it } from 'vitest';

import { BLANK_CANVAS_SHAPES, blankCanvasPaperSpacing } from './blankCanvas';
import {
    DEFAULT_BLANK_CANVAS_SETUP,
    blankCanvasPageFromSetup,
    parseBlankCanvasSetup,
    serializeBlankCanvasSetup,
} from './blankCanvasSetup';

describe('remembered page setup', () => {
    it('falls back to the defaults for missing, blank or unparsable rows', () => {
        expect(parseBlankCanvasSetup(undefined)).toEqual(DEFAULT_BLANK_CANVAS_SETUP);
        expect(parseBlankCanvasSetup('')).toEqual(DEFAULT_BLANK_CANVAS_SETUP);
        expect(parseBlankCanvasSetup('{oops')).toEqual(DEFAULT_BLANK_CANVAS_SETUP);
        expect(parseBlankCanvasSetup('null')).toEqual(DEFAULT_BLANK_CANVAS_SETUP);
        expect(parseBlankCanvasSetup('[]')).toEqual(DEFAULT_BLANK_CANVAS_SETUP);
    });

    it('round-trips a full setup', () => {
        const setup = { paper: 'grid', background: '#1b2a24', shape: 'portrait' } as const;
        expect(parseBlankCanvasSetup(serializeBlankCanvasSetup(setup))).toEqual(setup);
    });

    it('keeps the fields it recognises and defaults the rest', () => {
        const restored = parseBlankCanvasSetup(JSON.stringify({
            paper: 'dotted',
            background: '#00ff00',
            shape: 'octagon',
        }));
        expect(restored.paper).toBe('dotted');
        // A colour or shape the sheet no longer offers cannot be selected, so it is not restored.
        expect(restored.background).toBe(DEFAULT_BLANK_CANVAS_SETUP.background);
        expect(restored.shape).toBe(DEFAULT_BLANK_CANVAS_SETUP.shape);
    });

    it('builds the page the setup describes, ruled for its size', () => {
        const page = blankCanvasPageFromSetup({ paper: 'lined', background: '#fbf5e6', shape: 'portrait' });
        const portrait = BLANK_CANVAS_SHAPES.find((shape) => shape.id === 'portrait')!;
        expect(page).toEqual({
            background: '#fbf5e6',
            paper: 'lined',
            width: portrait.width,
            height: portrait.height,
            ruling: {
                spacing: blankCanvasPaperSpacing(portrait.width, portrait.height),
                offsetX: 0,
                offsetY: 0,
                orientation: 'horizontal',
            },
        });
    });
});
