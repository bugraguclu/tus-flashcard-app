import { describe, expect, it } from 'vitest';

import {
    DEFAULT_BLANK_CANVAS_SETUP,
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

});
