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
    refitDrawingAnnotations,
    drawingObjectAt,
    drawingToolHasSizes,
    moveDrawingObject,
    drawingImageBox,
    keepDrawingObjectOnPage,
    shouldAddDrawingPoint,
} from './drawingPad';
import type { PhotoImage, PhotoShape, PhotoStroke, PhotoText } from './photoEditor';

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
        expect(drawingInks('image', '#ffffff')).toEqual([]);
        expect(drawingInks('text', '#1b2a24')).toBe(DARK_PAGE_INKS);
        expect(drawingInks('arrow', '#ffffff')).toBe(LIGHT_PAGE_INKS);
    });

    it('letters in its own sizes and leaves the cover-up unsized', () => {
        expect(drawingToolWidth('text', 0)).toBe(18);
        expect(drawingToolWidth('rect', 2)).toBe(drawingToolWidth('pen', 2));
        expect(drawingToolHasSizes('cover')).toBe(false);
        expect(drawingToolHasSizes('image')).toBe(true);
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
        const [moved] = refitDrawingAnnotations(
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
        expect(refitDrawingAnnotations(strokes, { width: 1600, height: 1200 }, { width: 800, height: 600 })).toBe(strokes);
    });
});

const label = (id: string, point: { x: number; y: number }): PhotoText => ({
    id, type: 'text', text: 'Ab', point, fontSize: 26, bgStyle: 'plain', color: '#111827', width: 1, opacity: 1,
});
const picture = (id: string, point: { x: number; y: number }): PhotoImage => ({
    id, type: 'image', uri: 'file:///p.png', point, width: 120, height: 80, color: '#ffffff', opacity: 1,
});

describe('drawing pad objects', () => {
    const canvas = { width: 400, height: 300 };

    it('finds a label before a picture it overlaps, and nothing on empty paper', () => {
        const annotations = [picture('p', { x: 0.5, y: 0.5 }), label('t', { x: 0.5, y: 0.5 })];
        expect(drawingObjectAt(annotations, { x: 0.5, y: 0.5 }, canvas)?.id).toBe('t');
        expect(drawingObjectAt(annotations, { x: 0.5 + 50 / 400, y: 0.5 + 30 / 300 }, canvas)?.id).toBe('p');
        expect(drawingObjectAt(annotations, { x: 0.05, y: 0.05 }, canvas)).toBeNull();
    });

    it('moves an object by the drag and keeps its anchor on the page', () => {
        const moved = moveDrawingObject(label('t', { x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
        expect(moved.point.x).toBeCloseTo(0.6);
        expect(moved.point.y).toBeCloseTo(0.4);
        expect(moveDrawingObject(label('t', { x: 0.9, y: 0.5 }), { x: 0, y: 0 }, { x: 0.5, y: 0 }).point.x).toBe(1);
    });

    it('keeps a dragged or grown object wholly on the page', () => {
        const nearEdge = keepDrawingObjectOnPage(picture('p', { x: 0.05, y: 0.5 }), canvas);
        expect(nearEdge.point.x * canvas.width - 60).toBeCloseTo(0);
        const inside = picture('p', { x: 0.5, y: 0.5 });
        expect(keepDrawingObjectOnPage(inside, canvas)).toBe(inside);
        const huge = { ...picture('p', { x: 0.1, y: 0.1 }), width: 800, height: 600 };
        expect(keepDrawingObjectOnPage(huge, canvas).point).toEqual({ x: 0.5, y: 0.5 });
    });

    it('sizes a picture at its own aspect, larger at each step', () => {
        const small = drawingImageBox({ width: 400, height: 200 }, canvas, 0);
        const large = drawingImageBox({ width: 400, height: 200 }, canvas, 2);
        expect(small.width / small.height).toBeCloseTo(2);
        expect(large.width).toBeGreaterThan(small.width);
    });

    it('refits labels, pictures and shapes along with strokes', () => {
        const shape: PhotoShape = { id: 's', type: 'rect', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, color: '#111827', width: 4, opacity: 1 };
        const [text, image, rect] = refitDrawingAnnotations(
            [label('t', { x: 0.5, y: 0 }), picture('p', { x: 0.5, y: 1 }), shape],
            { width: 1600, height: 1200 },
            { width: 1200, height: 1600 },
        ) as [PhotoText, PhotoImage, PhotoShape];
        expect(text.point.y).toBeCloseTo(350 / 1600);
        expect(image.point.y).toBeCloseTo(1250 / 1600);
        expect(rect.end.y).toBeCloseTo(1250 / 1600);
    });
});
