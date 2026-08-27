import { describe, expect, it } from 'vitest';
import {
    EMPTY_WHITEBOARD_HISTORY,
    strokeHitByEraser,
    toSmoothWhiteboardPath,
    whiteboardHistoryReducer,
    type WhiteboardStroke,
} from './whiteboardGeometry';

const stroke = (points: Array<[number, number]>): WhiteboardStroke => ({
    points: points.map(([x, y]) => ({ x, y })),
    color: '#000',
    width: 5,
});

describe('whiteboard eraser geometry', () => {
    it('detects a crossing between sparse line segments', () => {
        expect(strokeHitByEraser(
            stroke([[0, 50], [100, 50]]),
            [{ x: 50, y: 0 }, { x: 50, y: 100 }],
            4,
        )).toBe(true);
    });

    it('detects a nearby parallel trail and ignores a distant one', () => {
        const ink = stroke([[0, 10], [100, 10]]);
        expect(strokeHitByEraser(ink, [{ x: 0, y: 15 }, { x: 100, y: 15 }], 6)).toBe(true);
        expect(strokeHitByEraser(ink, [{ x: 0, y: 30 }, { x: 100, y: 30 }], 6)).toBe(false);
    });

    it('handles taps as one-point ink and eraser trails', () => {
        expect(strokeHitByEraser(stroke([[10, 10]]), [{ x: 0, y: 10 }, { x: 20, y: 10 }], 2)).toBe(true);
        expect(strokeHitByEraser(stroke([[0, 0], [20, 0]]), [{ x: 10, y: 1 }], 2)).toBe(true);
    });
});

describe('whiteboard path smoothing', () => {
    it('produces a visible path for a tap and a smooth path for a trail', () => {
        expect(toSmoothWhiteboardPath([{ x: 2, y: 3 }])).toContain('L2.0');
        expect(toSmoothWhiteboardPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }])).toContain('Q10.0,10.0');
    });
});

describe('whiteboard history', () => {
    it('undoes and redoes pen and eraser commits', () => {
        const first = stroke([[0, 0], [10, 10]]);
        const second = stroke([[20, 20], [30, 30]]);
        const afterPen = whiteboardHistoryReducer(EMPTY_WHITEBOARD_HISTORY, { type: 'commit', strokes: [first, second] });
        const afterEraser = whiteboardHistoryReducer(afterPen, { type: 'commit', strokes: [second] });

        const undone = whiteboardHistoryReducer(afterEraser, { type: 'undo' });
        expect(undone.strokes).toEqual([first, second]);
        expect(whiteboardHistoryReducer(undone, { type: 'redo' }).strokes).toEqual([second]);
    });

    it('can restore a confirmed clear but fully resets history for a new card', () => {
        const ink = stroke([[0, 0], [10, 10]]);
        const drawn = whiteboardHistoryReducer(EMPTY_WHITEBOARD_HISTORY, { type: 'commit', strokes: [ink] });
        const cleared = whiteboardHistoryReducer(drawn, { type: 'commit', strokes: [] });
        expect(whiteboardHistoryReducer(cleared, { type: 'undo' }).strokes).toEqual([ink]);
        expect(whiteboardHistoryReducer(cleared, { type: 'reset' })).toEqual(EMPTY_WHITEBOARD_HISTORY);
    });
});
