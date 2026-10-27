import { describe, expect, it } from 'vitest';

import {
    DARK_PAGE_INKS,
    HIGHLIGHTER_INKS,
    LIGHT_PAGE_INKS,
    drawingInkForPage,
    drawingInks,
    drawingPointFromPage,
    drawingToolWidth,
    fitDrawingPage,
    refitDrawingStrokes,
    shouldAddDrawingPoint,
} from './drawingPad';
import type { PhotoStroke } from './photoEditor';

const stroke = (points: { x: number; y: number }[]): PhotoStroke => ({
    id: 's',
    type: 'stroke',
    color: '#111827',
    width: 4,
    opacity: 1,
    points,
});

describe('drawing pad touch mapping', () => {
    it('places a touch relative to the origin the gesture started on', () => {
        const point = drawingPointFromPage({ x: 320, y: 320 }, { x: 138, y: 70 }, { width: 748, height: 561 });
        expect(point.x).toBeCloseTo(182 / 748);
        expect(point.y).toBeCloseTo(250 / 561);
    });

    it('keeps a finger that slides off the page on its edge', () => {
        expect(drawingPointFromPage({ x: -50, y: 900 }, { x: 0, y: 0 }, { width: 400, height: 300 }))
            .toEqual({ x: 0, y: 1 });
    });

    it('skips samples too close to the last one to change the curve', () => {
        const canvas = { width: 400, height: 300 };
        expect(shouldAddDrawingPoint(undefined, { x: 0.5, y: 0.5 }, canvas)).toBe(true);
        expect(shouldAddDrawingPoint({ x: 0.5, y: 0.5 }, { x: 0.5 + 1 / 400, y: 0.5 }, canvas)).toBe(false);
        expect(shouldAddDrawingPoint({ x: 0.5, y: 0.5 }, { x: 0.5 + 2 / 400, y: 0.5 }, canvas)).toBe(true);
    });
});

describe('drawing pad page fit', () => {
    it('fits a landscape page into a tall stage by its width', () => {
        expect(fitDrawingPage({ width: 375, height: 600 }, { width: 1600, height: 1200 }, 12))
            .toEqual({ width: 351, height: 263 });
    });

    it('fits a portrait page into a wide stage by its height', () => {
        expect(fitDrawingPage({ width: 1000, height: 600 }, { width: 1200, height: 1600 }, 0))
            .toEqual({ width: 450, height: 600 });
    });
});

describe('drawing pad tools', () => {
    it('offers the pen inks that read on the page', () => {
        expect(drawingInks('pen', '#ffffff')).toBe(LIGHT_PAGE_INKS);
        expect(drawingInks('pen', '#1b2a24')).toBe(DARK_PAGE_INKS);
        expect(drawingInks('highlighter', '#1b2a24')).toBe(HIGHLIGHTER_INKS);
        expect(drawingInks('eraser', '#ffffff')).toEqual([]);
    });

    it('sizes each tool on its own scale', () => {
        expect(drawingToolWidth('pen', 0)).toBeLessThan(drawingToolWidth('pen', 2));
        expect(drawingToolWidth('highlighter', 0)).toBeGreaterThan(drawingToolWidth('pen', 2));
        expect(drawingToolWidth('eraser', 1)).toBe(20);
    });

    it('swaps a palette ink for its twin when the page changes colour', () => {
        expect(drawingInkForPage('#111827', '#ffffff', '#1b2a24')).toBe('#ffffff');
        expect(drawingInkForPage('#60a5fa', '#1b2a24', '#fbf5e6')).toBe('#2563eb');
        expect(drawingInkForPage('#123456', '#ffffff', '#1b2a24')).toBe('#123456');
    });
});

describe('drawing pad shape change', () => {
    it('keeps a drawing in proportion when the page turns from landscape to portrait', () => {
        const [moved] = refitDrawingStrokes(
            [stroke([{ x: 0, y: 0 }, { x: 1, y: 1 }])],
            { width: 1600, height: 1200 },
            { width: 1200, height: 1600 },
        );
        // The old page is 1200 x 900 inside the new one, centred vertically.
        expect(moved.points[0].x).toBeCloseTo(0);
        expect(moved.points[0].y).toBeCloseTo(350 / 1600);
        expect(moved.points[1].x).toBeCloseTo(1);
        expect(moved.points[1].y).toBeCloseTo(1250 / 1600);
    });

    it('leaves the drawing alone when the aspect does not change', () => {
        const strokes = [stroke([{ x: 0.2, y: 0.3 }])];
        expect(refitDrawingStrokes(strokes, { width: 1600, height: 1200 }, { width: 800, height: 600 })).toBe(strokes);
    });
});
