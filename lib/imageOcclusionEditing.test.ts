// Turning, colouring and reshaping Image Occlusion shapes (lib/imageOcclusion.ts) and the mask
// editor's handles for them (components/image-occlusion/occlusionEditorModel.ts). Anki turns a box
// about its top-left corner and stores the turn in ten-thousandths; lib/imageOcclusion.oracle.test.ts
// checks Anki 26.09.3 loads shapes edited this way unchanged.
import { describe, expect, it } from 'vitest';
import {
    occlusionGeometry,
    parseOcclusionField,
    rotateOcclusionShape,
    serializeOcclusionShape,
    setOcclusionFill,
    setOcclusionPolygonPoints,
    type OcclusionShape,
} from './imageOcclusion';
import {
    movePolygonCorner,
    polygonHandles,
    removePolygonCorner,
    resizeHandle,
    resizedBox,
    rotateHandle,
    shapeCentre,
    snappedTurn,
    turnShape,
} from '../components/image-occlusion/occlusionEditorModel';

const shape = (deletion: string): OcclusionShape => parseOcclusionField(deletion)[0];
const written = (value: OcclusionShape) => serializeOcclusionShape(value);

describe('turning a shape about its centre', () => {
    const wide = { width: 400, height: 200 };
    const rect = shape('{{c1::image-occlusion:rect:left=.1:top=.2:width=.25:height=.5:oi=1}}');

    it('moves a box’s corner and writes the turn in ten-thousandths before oi', () => {
        // A 100×100 px square at (40,40) turned a quarter keeps its centre at (90,90).
        const turned = rotateOcclusionShape(rect, 90, wide);
        expect(written(turned)).toBe('{{c1::image-occlusion:rect:left=.35:top=.2:width=.25:height=.5:angle=2500:oi=1}}');
        // Turned back, the angle goes and the text is the original's.
        expect(written(rotateOcclusionShape(turned, -90, wide))).toBe(rect.source);
        // A full turn changes nothing; a turn to the left is stored as the turn to the right that matches it.
        expect(rotateOcclusionShape(rect, 360, wide)).toBe(rect);
        expect(occlusionGeometry(rotateOcclusionShape(rect, -30, wide))).toMatchObject({ angle: (9167 / 10000) * 360 });
    });

    it('keeps the centre of a box, an ellipse and a label in image pixels', () => {
        const shapes = [
            rect,
            shape('{{c2::image-occlusion:ellipse:left=.5:top=.3:rx=.1:ry=.2:angle=1000}}'),
            shape('{{c0::image-occlusion:text:left=.2:top=.6:text=Aort\nkökü:scale=1.5:fs=.08}}'),
        ];
        for (const original of shapes) {
            const before = shapeCentre(original, wide, wide)!;
            const after = shapeCentre(turnShape(original, 37, wide), wide, wide)!;
            expect(after.x).toBeCloseTo(before.x, 0);
            expect(after.y).toBeCloseTo(before.y, 0);
        }
    });

    it('turns a polygon’s points instead of giving it an angle', () => {
        const polygon = shape('{{c2::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .3,.2}}');
        expect(written(rotateOcclusionShape(polygon, 90, { width: 100, height: 100 })))
            .toBe('{{c2::image-occlusion:polygon:left=.15:top=.05:points=.25,.05 .25,.25 .15,.25}}');
    });

    it('lands a handle turn on a multiple of 15° when it comes close', () => {
        expect(snappedTurn(rect, 13)).toBe(15);
        expect(snappedTurn(rect, 10)).toBe(10);
        expect(snappedTurn(rect, 350)).toBe(-10);
        const tilted = shape('{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1:angle=833}}');
        expect(snappedTurn(tilted, 14)).toBeCloseTo(45 - (833 / 10000) * 360, 6);
    });
});

describe('colouring a shape', () => {
    it('writes fill before oi and removes it for Anki’s default', () => {
        const mask = shape('{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1:oi=1}}');
        const blue = setOcclusionFill(mask, '#8ecbff');
        expect(written(blue)).toBe('{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1:fill=#8ecbff:oi=1}}');
        expect(setOcclusionFill(blue, '#8ecbff')).toBe(blue);
        expect(written(setOcclusionFill(blue, null))).toBe(mask.source);
        // A shape that already has a fill keeps it where it was.
        const own = shape('{{c1::image-occlusion:rect:fill=#000000:left=.1:oi=1}}');
        expect(written(setOcclusionFill(own, '#ffffff'))).toBe('{{c1::image-occlusion:rect:fill=#ffffff:left=.1:oi=1}}');
    });
});

describe('reshaping a polygon corner by corner', () => {
    const triangle = shape('{{c3::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .2,.3:oi=1}}');

    it('moves, adds and removes corners, keeping left and top on the points', () => {
        expect(written(movePolygonCorner(triangle, 2, { x: 0.2, y: 0.4 })))
            .toBe('{{c3::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .2,.4:oi=1}}');
        const square = movePolygonCorner(triangle, 1, { x: 0.2, y: 0.05 }, true);
        expect(written(square)).toBe('{{c3::image-occlusion:polygon:left=.1:top=.05:points=.1,.1 .2,.05 .3,.1 .2,.3:oi=1}}');
        expect(written(removePolygonCorner(square, 1))).toBe('{{c3::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .2,.3:oi=1}}');
        // A polygon keeps three corners.
        expect(removePolygonCorner(triangle, 0)).toBe(triangle);
        expect(setOcclusionPolygonPoints(triangle, [[0, 0], [1, 1]])).toBe(triangle);
    });

    it('edits the points where Anki draws them when left and top are off them', () => {
        // Anki moves the points so their corner is left/top: here 0.1 right and down.
        const offset = shape('{{c1::image-occlusion:polygon:left=.2:top=.2:points=.1,.1 .3,.1 .2,.3}}');
        expect(written(movePolygonCorner(offset, 0, { x: 0.15, y: 0.25 })))
            .toBe('{{c1::image-occlusion:polygon:left=.15:top=.2:points=.15,.25 .4,.2 .3,.4}}');
    });

    it('puts a handle on each corner and halfway along each edge', () => {
        const handles = polygonHandles(triangle, { width: 100, height: 100 })!;
        expect(handles.corners.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual([[10, 10], [30, 10], [20, 30]]);
        expect(handles.midpoints.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual([[20, 10], [25, 20], [15, 20]]);
        expect(polygonHandles(shape('{{c1::image-occlusion:rect:left=.1}}'), { width: 100, height: 100 })).toBeNull();
    });
});

describe('the editor’s handles on a turned shape', () => {
    const square = { width: 100, height: 100 };
    const turned = shape('{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.1:angle=2500}}');

    it('resizes along the turn, holding the corner Anki turns about', () => {
        expect(resizeHandle(turned, square, square)).toEqual({ x: expect.closeTo(0, 6), y: expect.closeTo(30, 6) });
        const box = resizedBox(turned, { x: 0, y: 0.5 }, square)!;
        expect(box.left).toBe(0.1);
        expect(box.top).toBe(0.1);
        expect(box.width).toBeCloseTo(0.4, 6);
        expect(box.height).toBeCloseTo(0.1, 6);
    });

    it('puts the turn handle above the shape, or below it at the picture’s top edge', () => {
        const top = shape('{{c1::image-occlusion:rect:left=.1:top=0:width=.2:height=.2}}');
        expect(rotateHandle(top, square, square)).toEqual({ x: 20, y: 50 });
        const lower = shape('{{c1::image-occlusion:rect:left=.1:top=.5:width=.2:height=.2}}');
        expect(rotateHandle(lower, square, square)).toEqual({ x: 20, y: 20 });
    });
});
