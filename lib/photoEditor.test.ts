import { describe, expect, it } from 'vitest';
import {
    applyPhotoEraserSweep,
    clampPhotoImageScale,
    isAnnotationHitBySweep,
    isPointInPhotoImage,
    PHOTO_IMAGE_MIN_EDGE,
    photoImageBounds,
    photoImagePlacement,
    resizePhotoImage,
    type PhotoImage,
    erasePhotoStrokeBySweep,
    normalizePhotoRotation,
    calculatePhotoTextBounds,
    clampCropRect,
    clampPhotoPoint,
    isPhotoShapeDragCommittable,
    isPointInPhotoText,
    normalizedRect,
    photoTextColors,
    resolvePhotoTextAlign,
    toPhotoTextLocalPixels,
    type PhotoAnnotation,
    type PhotoPoint,
    type PhotoStroke,
    type PhotoText,
    photoArrowHead,
    photoExportSurface,
    scalePhotoAnnotation,
} from './photoEditor';

describe('photo editor geometry', () => {
    it('clamps pointer coordinates into the image', () => {
        expect(clampPhotoPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
    });

    it('normalizes a rectangle drawn in any direction', () => {
        expect(normalizedRect({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
            x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.6,
        });
    });

    it('clamps crop rectangles within unit bounds', () => {
        expect(clampCropRect({ x: -0.1, y: -0.2, width: 1.5, height: 1.5 })).toEqual({
            x: 0, y: 0, width: 1, height: 1,
        });
        expect(clampCropRect({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 })).toEqual({
            x: 0.5, y: 0.5, width: 0.5, height: 0.5,
        });
        expect(clampCropRect({ x: 0.2, y: 0.2, width: 0.01, height: 0.01 }, 0.1)).toEqual({
            x: 0.2, y: 0.2, width: 0.1, height: 0.1,
        });
    });

    it('calculates text bounds and padding correctly for badge styles', () => {
        const textClassic: PhotoText = {
            id: 't1',
            type: 'text',
            point: { x: 0.5, y: 0.5 },
            text: 'Sol Ventrikül',
            fontSize: 24,
            bgStyle: 'classic',
            color: '#ffffff',
            width: 1,
            opacity: 1,
        };
        const boundsClassic = calculatePhotoTextBounds(textClassic, 400, 400);
        expect(boundsClassic.width).toBeGreaterThan(50);
        expect(boundsClassic.height).toBeGreaterThan(20);
        expect(boundsClassic.lines).toEqual(['Sol Ventrikül']);

        const textBadge: PhotoText = {
            id: 't2',
            type: 'text',
            point: { x: 0.5, y: 0.5 },
            text: 'Aort\nKapağı',
            fontSize: 24,
            bgStyle: 'badge',
            textAlign: 'center',
            color: '#ffffff',
            bgColor: '#ef4444',
            width: 1,
            opacity: 1,
        };
        const boundsBadge = calculatePhotoTextBounds(textBadge, 400, 400);
        expect(boundsBadge.lines).toEqual(['Aort', 'Kapağı']);
        expect(boundsBadge.height).toBeGreaterThan(boundsClassic.height);
        expect(boundsBadge.paddingX).toBeGreaterThanOrEqual(12);
    });

    // A tap is a sweep that starts and ends on the same point; the eraser asks the same question.
    const hitByTap = (annotation: PhotoAnnotation, point: PhotoPoint, width: number, height: number, tolerance = 24) =>
        isAnnotationHitBySweep(annotation, point, point, width, height, tolerance);

    it('hits a stroke and a label only where they are drawn', () => {
        const stroke: PhotoAnnotation = {
            id: 'stroke', type: 'stroke', points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }],
            color: '#000', width: 4, opacity: 1,
        };
        const text: PhotoAnnotation = {
            id: 'text', type: 'text', point: { x: 0.45, y: 0.52 }, text: 'Kalp', fontSize: 20,
            color: '#f00', width: 1, opacity: 1,
        };
        expect(hitByTap(text, { x: 0.48, y: 0.5 }, 400, 300)).toBe(true);
        expect(hitByTap(stroke, { x: 0.2, y: 0.5 }, 400, 300)).toBe(true);
        expect(hitByTap(text, { x: 0.2, y: 0.5 }, 400, 300)).toBe(false);
        expect(hitByTap(stroke, { x: 0.1, y: 0.1 }, 400, 300)).toBe(false);
    });

    it('hits a solid cover anywhere inside its filled interior', () => {
        const cover: PhotoAnnotation = {
            id: 'cov1', type: 'cover', start: { x: 0.2, y: 0.2 }, end: { x: 0.6, y: 0.6 },
            color: '#111827', width: 1, opacity: 1,
        };
        expect(hitByTap(cover, { x: 0.4, y: 0.4 }, 500, 500, 20)).toBe(true);
        expect(hitByTap(cover, { x: 0.8, y: 0.8 }, 500, 500, 20)).toBe(false);
    });

    it('catches what a fast eraser drag passes over between two samples', () => {
        const verticalStroke: PhotoAnnotation = {
            id: 'v-stroke', type: 'stroke', points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }],
            color: '#00ff00', width: 4, opacity: 1,
        };
        const arrow: PhotoAnnotation = {
            id: 'arrow1', type: 'arrow', start: { x: 0.2, y: 0.2 }, end: { x: 0.8, y: 0.2 },
            color: '#ff0000', width: 4, opacity: 1,
        };
        // A horizontal sweep crosses the vertical stroke only.
        expect(isAnnotationHitBySweep(verticalStroke, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 400, 400, 16)).toBe(true);
        expect(isAnnotationHitBySweep(arrow, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 400, 400, 16)).toBe(false);
        // A diagonal sweep crosses both.
        expect(isAnnotationHitBySweep(verticalStroke, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, 400, 400, 24)).toBe(true);
        expect(isAnnotationHitBySweep(arrow, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, 400, 400, 24)).toBe(true);
    });

    it('hits an arrow at its head', () => {
        const arrow: PhotoAnnotation = {
            id: 'arr', type: 'arrow', start: { x: 0.1, y: 0.5 }, end: { x: 0.8, y: 0.5 },
            color: '#3b82f6', width: 6, opacity: 1,
        };
        expect(hitByTap(arrow, { x: 0.8, y: 0.5 }, 500, 500, 16)).toBe(true);
    });

    it('finds nothing in a stroke with no points instead of throwing', () => {
        const emptyStroke = { id: 'empty-stroke', type: 'stroke', points: [] as any, color: '#000', width: 2, opacity: 1 } as PhotoAnnotation;
        const nullPointsStroke = { id: 'null-stroke', type: 'stroke', points: null as any, color: '#000', width: 2, opacity: 1 } as PhotoAnnotation;
        for (const stroke of [emptyStroke, nullPointsStroke]) {
            expect(hitByTap(stroke, { x: 0.5, y: 0.5 }, 400, 400)).toBe(false);
            expect(isAnnotationHitBySweep(stroke, { x: 0, y: 0 }, { x: 1, y: 1 }, 400, 400)).toBe(false);
        }
    });

    it('hit-tests a badge label inside the bounds it is drawn with', () => {
        const textAnnotation: PhotoText = {
            id: 'txt-1', type: 'text', point: { x: 0.5, y: 0.5 }, text: 'Anatomi Notu', fontSize: 24,
            bgStyle: 'badge', textAlign: 'center', color: '#ffffff', width: 1, opacity: 1,
        };
        const bounds = calculatePhotoTextBounds(textAnnotation, 400, 400);
        expect(bounds.width).toBeGreaterThan(50);
        expect(bounds.height).toBeGreaterThan(20);
        expect(bounds.x).toBeLessThan(200); // centred at 200
        expect(bounds.x + bounds.width).toBeGreaterThan(200);

        expect(isPointInPhotoText(textAnnotation, { x: 0.5, y: 0.5 }, 400, 400)).toBe(true);
        expect(hitByTap(textAnnotation, { x: 0.5, y: 0.5 }, 400, 400)).toBe(true);
        expect(isPointInPhotoText(textAnnotation, { x: 0.05, y: 0.05 }, 400, 400)).toBe(false);
        expect(hitByTap(textAnnotation, { x: 0.05, y: 0.05 }, 400, 400)).toBe(false);
    });

    it('sets a plain label as ink on paper: no plate padding, glyphs in the ink itself', () => {
        const plain: PhotoText = {
            id: 't3',
            type: 'text',
            point: { x: 0.5, y: 0.5 },
            text: 'Mitral',
            fontSize: 26,
            bgStyle: 'plain',
            color: '#2563eb',
            width: 1,
            opacity: 1,
        };
        expect(calculatePhotoTextBounds(plain, 400, 400).paddingX).toBe(6);
        expect(photoTextColors(plain).text).toBe('#2563eb');
    });

});

describe('photo editor eraser', () => {
    const line = (): PhotoStroke => ({
        id: 'ink',
        type: 'stroke',
        points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }],
        color: '#ef4444',
        width: 4,
        opacity: 1,
    });

    it('cuts a hole in a stroke instead of deleting the whole line', () => {
        const pieces = erasePhotoStrokeBySweep(line(), { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.6 }, 400, 400, 20);

        expect(pieces).toHaveLength(2);
        // The left piece keeps the start of the line, the right piece keeps its end.
        expect(pieces[0].points[0].x).toBeCloseTo(0.1, 2);
        expect(pieces[0].points[pieces[0].points.length - 1].x).toBeLessThan(0.45);
        expect(pieces[1].points[0].x).toBeGreaterThan(0.55);
        expect(pieces[1].points[pieces[1].points.length - 1].x).toBeCloseTo(0.9, 2);
        // Split pieces need distinct ids so React keys and later erases stay stable.
        expect(new Set(pieces.map((piece) => piece.id)).size).toBe(2);
    });

    it('erases only the swept end when the eraser crosses a stroke tip', () => {
        const pieces = erasePhotoStrokeBySweep(line(), { x: 0.88, y: 0.4 }, { x: 0.88, y: 0.6 }, 400, 400, 24);

        expect(pieces).toHaveLength(1);
        expect(pieces[0].points[0].x).toBeCloseTo(0.1, 2);
        expect(pieces[0].points[pieces[0].points.length - 1].x).toBeLessThan(0.86);
    });

    it('keeps the far end of a stroke that outruns the densifier budget', () => {
        // A fast, long scribble records more points than one erase pass will densify. The pass
        // must still carry the untouched tail through instead of truncating the stroke there.
        const points = Array.from({ length: 4000 }, (_unused, index) => ({
            x: 0.05 + (index / 3999) * 0.9,
            y: 0.5,
        }));
        const scribble: PhotoStroke = { ...line(), points };

        const pieces = erasePhotoStrokeBySweep(scribble, { x: 0.1, y: 0.4 }, { x: 0.1, y: 0.6 }, 400, 400, 20);

        expect(pieces.length).toBeGreaterThan(0);
        const survivingEnd = pieces[pieces.length - 1].points.at(-1);
        expect(survivingEnd?.x).toBeCloseTo(0.95, 2);
    });

    it('leaves an untouched stroke exactly as it was', () => {
        const stroke = line();
        expect(erasePhotoStrokeBySweep(stroke, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, 400, 400, 20)[0]).toBe(stroke);
    });

    it('keeps the annotation list identical when the sweep hits nothing', () => {
        const annotations: PhotoAnnotation[] = [line()];
        const result = applyPhotoEraserSweep(annotations, { x: 0.1, y: 0.05 }, { x: 0.2, y: 0.05 }, 400, 400, 18);

        expect(result.changed).toBe(false);
        expect(result.annotations).toBe(annotations);
    });

    it('removes shapes and labels whole, but splits ink, in partial mode', () => {
        const annotations: PhotoAnnotation[] = [
            line(),
            { id: 'box', type: 'rect', start: { x: 0.4, y: 0.4 }, end: { x: 0.6, y: 0.6 }, color: '#000', width: 3, opacity: 1 },
        ];
        const result = applyPhotoEraserSweep(annotations, { x: 0.5, y: 0.38 }, { x: 0.5, y: 0.62 }, 400, 400, 20, 'partial');

        expect(result.changed).toBe(true);
        expect(result.annotations.some((annotation) => annotation.type === 'rect')).toBe(false);
        expect(result.annotations.filter((annotation) => annotation.type === 'stroke')).toHaveLength(2);
    });

    it('wipes the entire stroke in object mode', () => {
        const result = applyPhotoEraserSweep([line()], { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.6 }, 400, 400, 20, 'object');

        expect(result.changed).toBe(true);
        expect(result.annotations).toHaveLength(0);
    });
});

describe('photo editor text rotation', () => {
    const label = (rotation: number): PhotoText => ({
        id: 'txt',
        type: 'text',
        point: { x: 0.5, y: 0.5 },
        text: 'Kalp kapakları',
        fontSize: 24,
        bgStyle: 'badge',
        textAlign: 'center',
        rotation,
        color: '#ffffff',
        width: 1,
        opacity: 1,
    });

    it('wraps rotation angles into a single turn', () => {
        expect(normalizePhotoRotation(-90)).toBe(270);
        expect(normalizePhotoRotation(450)).toBe(90);
        expect(normalizePhotoRotation(Number.NaN)).toBe(0);
    });

    it('maps canvas pixels back into the label frame', () => {
        // A quarter turn sends a point above the anchor to a point left of it.
        const local = toPhotoTextLocalPixels(200, 100, label(90), 400, 400);
        expect(local.x).toBeCloseTo(100, 5);
        expect(local.y).toBeCloseTo(200, 5);
    });

    it('hit-tests a rotated label along its own axis', () => {
        const upright = label(0);
        const turned = label(90);
        // A point well to the right of the anchor sits inside the upright badge...
        expect(isPointInPhotoText(upright, { x: 0.66, y: 0.5 }, 400, 400, 0)).toBe(true);
        // ...but once the badge is turned a quarter turn that spot is outside it.
        expect(isPointInPhotoText(turned, { x: 0.66, y: 0.5 }, 400, 400, 0)).toBe(false);
        // The same offset below the anchor now hits, because the badge runs vertically.
        expect(isPointInPhotoText(turned, { x: 0.5, y: 0.66 }, 400, 400, 0)).toBe(true);
    });

});

describe('photo editor label colours', () => {
    const label = (overrides: Partial<PhotoText> = {}): PhotoText => ({
        id: 'label',
        type: 'text',
        point: { x: 0.5, y: 0.5 },
        text: 'Aorta',
        fontSize: 20,
        color: '#ffffff',
        width: 2,
        opacity: 1,
        ...overrides,
    });

    it('keeps a plain label painted in its own ink', () => {
        const colors = photoTextColors(label({ color: '#ef4444' }));
        expect(colors.text).toBe('#ef4444');
    });

    it('reverses a badge out of its own ink colour', () => {
        // A light ink becomes the plate, so the glyphs have to turn dark to stay readable.
        expect(photoTextColors(label({ bgStyle: 'badge', color: '#f59e0b' })).background).toBe('#f59e0b');
        expect(photoTextColors(label({ bgStyle: 'badge', color: '#f59e0b' })).text).toBe('#111827');
        // White is the exception: it keeps a dark plate rather than becoming one.
        expect(photoTextColors(label({ bgStyle: 'badge', color: '#ffffff' })).background).toBe('#111827');
        expect(photoTextColors(label({ bgStyle: 'badge', color: '#ffffff' })).text).toBe('#ffffff');
        // A dark ink makes a dark plate, so the glyphs reverse out in white.
        expect(photoTextColors(label({ bgStyle: 'badge', color: '#1d4ed8' })).text).toBe('#ffffff');
    });

    it('contrasts a frosted plate against the ink it sits behind', () => {
        expect(photoTextColors(label({ bgStyle: 'frosted', color: '#ffffff' })).background).toBe('rgba(0,0,0,0.68)');
        expect(photoTextColors(label({ bgStyle: 'frosted', color: '#ffffff' })).text).toBe('#ffffff');
        expect(photoTextColors(label({ bgStyle: 'frosted', color: '#1d4ed8' })).background).toBe('rgba(255,255,255,0.85)');
        expect(photoTextColors(label({ bgStyle: 'frosted', color: '#1d4ed8' })).text).toBe('#111827');
    });

    it('lets an explicitly chosen plate colour win', () => {
        expect(photoTextColors(label({ bgStyle: 'badge', bgColor: '#0f766e' })).background).toBe('#0f766e');
    });

    it('leans a label away from the edge it was dropped near', () => {
        expect(resolvePhotoTextAlign(label({ point: { x: 0.9, y: 0.5 } }))).toBe('right');
        expect(resolvePhotoTextAlign(label({ point: { x: 0.1, y: 0.5 } }))).toBe('left');
        expect(resolvePhotoTextAlign(label({ point: { x: 0.5, y: 0.5 } }))).toBe('center');
        // An explicit choice is never second-guessed by the anchor position.
        expect(resolvePhotoTextAlign(label({ point: { x: 0.9, y: 0.5 }, textAlign: 'left' }))).toBe('left');
    });
});

describe('export surface', () => {
    // A phone-sized canvas: what the drawing was actually made on.
    const canvas = { width: 350, height: 262 };

    it('renders a drawn page at the resolution the page claims, not the screen\'s', () => {
        const surface = photoExportSurface({
            source: { width: 1600, height: 1200 },
            canvas,
            pixelRatio: 3,
        });
        // 533 points at a 3x pixel ratio is the 1600px page the sheet was created as, give or
        // take the point the size is rounded to.
        expect(Math.abs(surface.width * 3 - 1600)).toBeLessThanOrEqual(3);
        expect(surface.width / surface.height).toBeCloseTo(1600 / 1200, 2);
        // Photographing the canvas instead would have given barely two thirds of that.
        expect(surface.width).toBeGreaterThan(canvas.width);
        expect(surface.scale).toBeCloseTo(surface.width / canvas.width, 6);
    });

    it('keeps a large photo\'s detail up to the export cap', () => {
        const surface = photoExportSurface({
            source: { width: 4032, height: 3024 },
            canvas,
            pixelRatio: 3,
            maxDimension: 2000,
        });
        expect(Math.abs(surface.width * 3 - 2000)).toBeLessThanOrEqual(3);
        expect(surface.width / surface.height).toBeCloseTo(4032 / 3024, 2);
    });

    it('never renders smaller than photographing the canvas would have', () => {
        const surface = photoExportSurface({
            source: { width: 320, height: 240 },
            canvas,
            pixelRatio: 3,
        });
        expect(surface.width).toBe(canvas.width);
        expect(surface.scale).toBe(1);
    });

    it('measures the web surface in pixels, since a canvas element has no points', () => {
        const surface = photoExportSurface({
            source: { width: 4032, height: 3024 },
            canvas,
            pixelRatio: 1,
            maxDimension: 2000,
        });
        expect(surface.width).toBe(2000);
    });

    it('falls back to the canvas shape when the source size is unusable', () => {
        const surface = photoExportSurface({
            source: { width: 0, height: 0 },
            canvas,
            pixelRatio: 3,
        });
        expect(surface.width).toBe(canvas.width);
        expect(surface.width / surface.height).toBeCloseTo(canvas.width / canvas.height, 2);
    });
});

describe('annotations measured for a larger surface', () => {
    const stroke: PhotoStroke = {
        id: 'a',
        type: 'stroke',
        color: '#ef4444',
        width: 6,
        opacity: 1,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }],
    };

    it('keeps a stroke the same thickness relative to the drawing', () => {
        const canvasWidth = 350;
        const surface = photoExportSurface({
            source: { width: 1600, height: 1200 },
            canvas: { width: canvasWidth, height: 262 },
            pixelRatio: 3,
        });
        const exported = scalePhotoAnnotation(stroke, surface.scale);
        expect(exported.width / surface.width).toBeCloseTo(stroke.width / canvasWidth, 6);
        // Position is normalised, so it is already right at any size.
        expect(exported.points).toEqual(stroke.points);
    });

    it('takes a label\'s font size up with the surface', () => {
        const text: PhotoText = {
            id: 'b',
            type: 'text',
            color: '#ffffff',
            width: 0,
            opacity: 1,
            text: 'aort',
            fontSize: 24,
            point: { x: 0.5, y: 0.5 },
        };
        expect(scalePhotoAnnotation(text, 2).fontSize).toBe(48);
    });

    it('leaves the annotation alone when there is nothing to scale', () => {
        expect(scalePhotoAnnotation(stroke, 1)).toBe(stroke);
        expect(scalePhotoAnnotation(stroke, 0)).toBe(stroke);
        expect(scalePhotoAnnotation(stroke, Number.NaN)).toBe(stroke);
    });
});

describe('photo editor shape drags', () => {
    const CANVAS_W = 360;
    const CANVAS_H = 480;

    it('pins the arrow drag: a release must carry the point the finger travelled to', () => {
        // The regression this guards: the shape tools updated only the live preview while the
        // finger moved and never wrote the moving end into the gesture record the release commits
        // from, so letting go stored `start` as both ends. The drag has to survive as an actual
        // segment, which is what this length check stands for.
        const start: PhotoPoint = { x: 0.2, y: 0.3 };
        const end: PhotoPoint = { x: 0.7, y: 0.6 };
        expect(isPhotoShapeDragCommittable(start, end, CANVAS_W, CANVAS_H)).toBe(true);
        expect(isPhotoShapeDragCommittable(start, start, CANVAS_W, CANVAS_H)).toBe(false);
    });

    it('draws a collapsed arrow as a head sitting on its own start, so it must never be committed', () => {
        // Why the check above exists, in geometry: with both ends on one spot the shaft has no
        // length — a round line cap, drawn as a dot — and the head points at a default angle
        // right beside it. That triangle-and-dot mark is what the user saw on every release.
        const spot: PhotoPoint = { x: 0.5, y: 0.5 };
        const head = photoArrowHead(spot, spot, CANVAS_W, CANVAS_H, 20);
        expect(head[0]).toEqual({ x: 0.5 * CANVAS_W, y: 0.5 * CANVAS_H });
        // Both wings fold back along one axis: the head has an orientation the drag never gave it.
        expect(head[1].y).toBeCloseTo(CANVAS_H * 0.5 + 10, 6);
        expect(head[2].y).toBeCloseTo(CANVAS_H * 0.5 - 10, 6);
        expect(head[1].x).toBeCloseTo(head[2].x, 6);
    });

    it('keeps the tap threshold measured in pixels, not in normalized units', () => {
        // The same normalized nudge is a longer stroke on a taller canvas, so the threshold has
        // to be read through the canvas or a small drag would commit on one page shape and be
        // discarded on another.
        const start: PhotoPoint = { x: 0.5, y: 0.5 };
        const nudged: PhotoPoint = { x: 0.5, y: 0.53 };
        expect(isPhotoShapeDragCommittable(start, nudged, 100, 100, 6)).toBe(false);
        expect(isPhotoShapeDragCommittable(start, nudged, 100, 1000, 6)).toBe(true);
    });

    it('refuses a release whose coordinates are not finite', () => {
        const start: PhotoPoint = { x: 0.5, y: 0.5 };
        expect(isPhotoShapeDragCommittable(start, { x: Number.NaN, y: 0.5 }, CANVAS_W, CANVAS_H)).toBe(false);
        expect(isPhotoShapeDragCommittable(start, { x: 0.5, y: Number.POSITIVE_INFINITY }, CANVAS_W, CANVAS_H)).toBe(false);
    });
});

describe('pictures placed on a page', () => {
    const CANVAS = { width: 360, height: 480 };

    function picture(overrides: Partial<PhotoImage> = {}): PhotoImage {
        return {
            id: 'pic',
            type: 'image',
            uri: 'file:///tmp/kalp.png',
            point: { x: 0.5, y: 0.5 },
            width: 200,
            height: 150,
            color: '#ffffff',
            opacity: 1,
            ...overrides,
        };
    }

    it('drops a new picture in at its own aspect, with the page still visible around it', () => {
        const wide = photoImagePlacement({ source: { width: 4000, height: 2000 }, canvas: CANVAS });
        expect(wide.width).toBeCloseTo(360 * 0.62, 6);
        expect(wide.width / wide.height).toBeCloseTo(2, 6);
        expect(wide.width).toBeLessThan(CANVAS.width);

        // A tall picture runs out of page height first, so that edge is what caps it.
        const tall = photoImagePlacement({ source: { width: 1000, height: 4000 }, canvas: CANVAS });
        expect(tall.height).toBeCloseTo(480 * 0.62, 6);
        expect(tall.width / tall.height).toBeCloseTo(0.25, 6);
    });

    it('falls back to a square when the picker reports no size at all', () => {
        const box = photoImagePlacement({ source: { width: null, height: undefined }, canvas: CANVAS });
        expect(box.width).toBeCloseTo(box.height, 6);
        expect(box.width).toBeGreaterThanOrEqual(PHOTO_IMAGE_MIN_EDGE);
    });

    it('centres the box on the point the picture is positioned by', () => {
        expect(photoImageBounds(picture({ point: { x: 0.5, y: 0.25 } }), 400, 400)).toEqual({
            x: 100, y: 25, width: 200, height: 150,
        });
    });

    it('hit-tests a turned picture in its own frame, not its upright one', () => {
        const turned = picture({ width: 200, height: 40, rotation: 90 });
        // Above the centre: outside the upright box, inside the one the user can see.
        expect(isPointInPhotoImage(turned, { x: 0.5, y: 0.3 }, 400, 400)).toBe(true);
        // Beside the centre: inside the upright box, outside the turned one.
        expect(isPointInPhotoImage(turned, { x: 0.3, y: 0.5 }, 400, 400)).toBe(false);
    });

    it('keeps a resize inside its limits and exactly on its aspect ratio', () => {
        const source = picture({ width: 400, height: 300 });
        const grown = resizePhotoImage(source, 10, CANVAS);
        // The ceiling is the page times the coverage limit, reached on the tighter edge first.
        expect(grown.width).toBeCloseTo(400 * 2.7, 6);
        expect(grown.width / grown.height).toBeCloseTo(4 / 3, 6);

        const shrunk = resizePhotoImage(source, 0.001, CANVAS);
        expect(Math.min(shrunk.width, shrunk.height)).toBeCloseTo(PHOTO_IMAGE_MIN_EDGE, 6);
        expect(shrunk.width / shrunk.height).toBeCloseTo(4 / 3, 6);

        // A factor that changes nothing hands the same object back, so no re-render is queued.
        expect(resizePhotoImage(source, 1, CANVAS)).toBe(source);
        expect(clampPhotoImageScale(source, Number.NaN, CANVAS)).toBe(1);
    });

    it('still lets an oversized picture be shrunk once it is past the ceiling', () => {
        const huge = picture({ width: 4000, height: 3000 });
        expect(clampPhotoImageScale(huge, 2, CANVAS)).toBe(1);
        expect(clampPhotoImageScale(huge, 0.5, CANVAS)).toBeCloseTo(0.5, 6);
    });

    it('leaves pictures to the eraser and takes them with the page', () => {
        const placed = picture();
        // The eraser is for ink: a sweep straight across the picture must not remove it, or
        // rubbing out a stroke drawn on top would take the picture with it.
        expect(isAnnotationHitBySweep(placed, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 400, 400)).toBe(false);
        const sweep = applyPhotoEraserSweep(
            [placed], { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 400, 400, 24, 'object',
        );
        expect(sweep.changed).toBe(false);
        expect(sweep.annotations).toEqual([placed]);
    });

    it('takes both sides of the box up to an export surface', () => {
        const exported = scalePhotoAnnotation(picture(), 4);
        expect(exported.width).toBe(800);
        expect(exported.height).toBe(600);
        expect(exported.uri).toBe('file:///tmp/kalp.png');
    });
});

