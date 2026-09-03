import { describe, expect, it } from 'vitest';
import {
    applyAspectRatioToCropRect,
    applyPhotoEraserSweep,
    erasePhotoStrokeBySweep,
    normalizePhotoRotation,
    calculatePhotoTextBounds,
    calculateSourceCropPixels,
    clampCropRect,
    clampPhotoPoint,
    cropPhotoAnnotation,
    cropPhotoPoint,
    findPhotoAnnotationAtPoint,
    findPhotoAnnotationsInSweep,
    isPointInPhotoText,
    isPointInPhotoTrashZone,
    normalizedRect,
    photoTextColors,
    photoTrashPillRect,
    photoTrashZoneRect,
    resolvePhotoTextAlign,
    resolvePhotoTextDragRelease,
    rotatePhotoAnnotationClockwise,
    rotatePhotoPointClockwise,
    toPhotoTextLocalPixels,
    type PhotoAnnotation,
    type PhotoPoint,
    type PhotoStroke,
    type PhotoText,
} from './photoEditor';

describe('photo editor geometry', () => {
    it('clamps pointer coordinates into the image', () => {
        expect(clampPhotoPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
    });

    it('rotates normalized points and annotations clockwise', () => {
        const rotatedPoint = rotatePhotoPointClockwise({ x: 0.25, y: 0.8 });
        expect(rotatedPoint.x).toBeCloseTo(0.2);
        expect(rotatedPoint.y).toBeCloseTo(0.25);
        const annotation: PhotoAnnotation = {
            id: 'a', type: 'arrow', start: { x: 0, y: 0 }, end: { x: 1, y: 0.5 },
            color: '#fff', width: 4, opacity: 1,
        };
        expect(rotatePhotoAnnotationClockwise(annotation)).toMatchObject({
            start: { x: 1, y: 0 },
            end: { x: 0.5, y: 1 },
        });
    });

    it('normalizes a rectangle drawn in any direction', () => {
        expect(normalizedRect({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
            x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.6,
        });
    });

    it('erases the top-most annotation hit by a tap', () => {
        const annotations: PhotoAnnotation[] = [
            {
                id: 'stroke', type: 'stroke', points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }],
                color: '#000', width: 4, opacity: 1,
            },
            {
                id: 'text', type: 'text', point: { x: 0.45, y: 0.52 }, text: 'Kalp', fontSize: 20,
                color: '#f00', width: 1, opacity: 1,
            },
        ];
        expect(findPhotoAnnotationAtPoint(annotations, { x: 0.48, y: 0.5 }, 400, 300)).toBe(1);
        expect(findPhotoAnnotationAtPoint(annotations, { x: 0.2, y: 0.5 }, 400, 300)).toBe(0);
        expect(findPhotoAnnotationAtPoint(annotations, { x: 0.1, y: 0.1 }, 400, 300)).toBe(-1);
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

    it('calculates source image pixel crop accurately', () => {
        const pixels = calculateSourceCropPixels(
            { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
            1000,
            800,
        );
        expect(pixels).toEqual({
            originX: 250,
            originY: 80,
            width: 500,
            height: 640,
        });
    });

    it('transforms normalized points and annotations into cropped image coordinates', () => {
        const cropBox = { x: 0.2, y: 0.2, width: 0.6, height: 0.4 };
        expect(cropPhotoPoint({ x: 0.5, y: 0.4 }, cropBox)).toEqual({
            x: 0.5, // (0.5 - 0.2) / 0.6 = 0.3 / 0.6 = 0.5
            y: 0.5, // (0.4 - 0.2) / 0.4 = 0.2 / 0.4 = 0.5
        });

        const stroke: PhotoAnnotation = {
            id: 's1',
            type: 'stroke',
            points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.6 }],
            color: '#ff0000',
            width: 3,
            opacity: 1,
        };
        const croppedStroke = cropPhotoAnnotation(stroke, cropBox);
        expect(croppedStroke).toMatchObject({
            type: 'stroke',
            points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        });
    });

    it('applies fixed aspect ratios to crop rectangle', () => {
        // Image is 1000x500 (aspect 2:1). Setting target aspect 1:1 (square)
        const squareCrop = applyAspectRatioToCropRect(
            { x: 0, y: 0, width: 1, height: 1 },
            1.0,
            1000,
            500,
        );
        // Desired norm aspect = 1.0 / 2.0 = 0.5 (widthNorm / heightNorm = 0.5).
        // Since height is 1, width should be 0.5, centered at x = 0.25.
        expect(squareCrop.height).toBeCloseTo(1);
        expect(squareCrop.width).toBeCloseTo(0.5);
        expect(squareCrop.x).toBeCloseTo(0.25);
        expect(squareCrop.y).toBeCloseTo(0);
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

    it('erases solid cover annotations when tapping inside the filled interior', () => {
        const cover: PhotoAnnotation = {
            id: 'cov1',
            type: 'cover',
            start: { x: 0.2, y: 0.2 },
            end: { x: 0.6, y: 0.6 },
            color: '#111827',
            width: 1,
            opacity: 1,
        };
        // Dead center of the cover
        expect(findPhotoAnnotationAtPoint([cover], { x: 0.4, y: 0.4 }, 500, 500, 20)).toBe(0);
        // Outside the cover
        expect(findPhotoAnnotationAtPoint([cover], { x: 0.8, y: 0.8 }, 500, 500, 20)).toBe(-1);
    });

    it('detects continuous sweep collisions during fast eraser dragging', () => {
        const verticalStroke: PhotoAnnotation = {
            id: 'v-stroke',
            type: 'stroke',
            points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }],
            color: '#00ff00',
            width: 4,
            opacity: 1,
        };
        const arrow: PhotoAnnotation = {
            id: 'arrow1',
            type: 'arrow',
            start: { x: 0.2, y: 0.2 },
            end: { x: 0.8, y: 0.2 },
            color: '#ff0000',
            width: 4,
            opacity: 1,
        };
        const annotations = [verticalStroke, arrow];

        // Horizontal sweep from x=0.1, y=0.5 to x=0.9, y=0.5 intersects the vertical stroke
        const hits = findPhotoAnnotationsInSweep(
            annotations,
            { x: 0.1, y: 0.5 },
            { x: 0.9, y: 0.5 },
            400,
            400,
            16,
        );
        expect(hits).toEqual([0]);

        // Diagonal sweep crossing both vertical stroke and arrow
        const doubleHits = findPhotoAnnotationsInSweep(
            annotations,
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.9 },
            400,
            400,
            24,
        );
        expect(doubleHits.sort()).toEqual([0, 1]);
    });

    it('erases arrowheads accurately on hit', () => {
        const arrow: PhotoAnnotation = {
            id: 'arr',
            type: 'arrow',
            start: { x: 0.1, y: 0.5 },
            end: { x: 0.8, y: 0.5 },
            color: '#3b82f6',
            width: 6,
            opacity: 1,
        };
        // Point right near arrow tip
        expect(findPhotoAnnotationAtPoint([arrow], { x: 0.8, y: 0.5 }, 500, 500, 16)).toBe(0);
    });

    it('safely handles empty or corrupted points without crashing', () => {
        const emptyStroke = {
            id: 'empty-stroke',
            type: 'stroke',
            points: [] as any,
            color: '#000',
            width: 2,
            opacity: 1,
        } as PhotoAnnotation;

        const nullPointsStroke = {
            id: 'null-stroke',
            type: 'stroke',
            points: null as any,
            color: '#000',
            width: 2,
            opacity: 1,
        } as PhotoAnnotation;

        // Rotation should not throw
        expect(rotatePhotoAnnotationClockwise(emptyStroke)).toBeDefined();
        expect(rotatePhotoAnnotationClockwise(nullPointsStroke)).toBeDefined();

        // Crop should not throw
        const cropBox = { x: 0, y: 0, width: 1, height: 1 };
        expect(cropPhotoAnnotation(emptyStroke, cropBox)).toBeDefined();
        expect(cropPhotoAnnotation(nullPointsStroke, cropBox)).toBeDefined();

        // Hit testing / sweep search should not throw and should return no hits
        expect(findPhotoAnnotationAtPoint([emptyStroke, nullPointsStroke], { x: 0.5, y: 0.5 }, 400, 400)).toBe(-1);
        expect(findPhotoAnnotationsInSweep([emptyStroke, nullPointsStroke], { x: 0, y: 0 }, { x: 1, y: 1 }, 400, 400)).toEqual([]);
    });

    it('accurately hit-tests text badges and calculates text bounds', () => {
        const textAnnotation: PhotoText = {
            id: 'txt-1',
            type: 'text',
            point: { x: 0.5, y: 0.5 },
            text: 'Anatomi Notu',
            fontSize: 24,
            bgStyle: 'badge',
            textAlign: 'center',
            color: '#ffffff',
            width: 1,
            opacity: 1,
        };

        const bounds = calculatePhotoTextBounds(textAnnotation, 400, 400);
        expect(bounds.width).toBeGreaterThan(50);
        expect(bounds.height).toBeGreaterThan(20);
        expect(bounds.x).toBeLessThan(200); // Centered at 200
        expect(bounds.x + bounds.width).toBeGreaterThan(200);

        // Center tap should hit
        expect(isPointInPhotoText(textAnnotation, { x: 0.5, y: 0.5 }, 400, 400)).toBe(true);
        expect(findPhotoAnnotationAtPoint([textAnnotation], { x: 0.5, y: 0.5 }, 400, 400)).toBe(0);

        // Far away tap should not hit
        expect(isPointInPhotoText(textAnnotation, { x: 0.05, y: 0.05 }, 400, 400)).toBe(false);
        expect(findPhotoAnnotationAtPoint([textAnnotation], { x: 0.05, y: 0.05 }, 400, 400)).toBe(-1);
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

    it('carries the label twist when the whole photo is rotated', () => {
        const rotated = rotatePhotoAnnotationClockwise(label(30)) as PhotoText;
        expect(rotated.rotation).toBe(120);
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

describe('photo editor drag-to-delete', () => {
    const CANVAS_W = 360;
    const CANVAS_H = 480;

    const release = (point: PhotoPoint | null, hasMoved: boolean, width = CANVAS_W, height = CANVAS_H) =>
        resolvePhotoTextDragRelease({
            point,
            zone: photoTrashZoneRect(width, height),
            canvasWidth: width,
            canvasHeight: height,
            hasMoved,
        });

    /** Centre of the bin, in the normalized coordinates the gesture handlers work in. */
    const binCentre = (width = CANVAS_W, height = CANVAS_H): PhotoPoint => {
        const pill = photoTrashPillRect(width, height);
        return { x: (pill.x + pill.width / 2) / width, y: (pill.y + pill.height / 2) / height };
    };

    it('pins drag-to-delete: releasing a dragged label over the trash zone deletes it', () => {
        // The regression this guards: the release used to consult a piece of React state that the
        // PanResponder had closed over on the first render, so it read `false` forever and every
        // drop was treated as a reposition. The decision is a pure function of the drag now.
        expect(release(binCentre(), true)).toBe('delete');
    });

    it('repositions a label released anywhere outside the bin', () => {
        expect(release({ x: 0.5, y: 0.5 }, true)).toBe('reposition');
        // Just above the bin's slop, still on the picture.
        const pill = photoTrashPillRect(CANVAS_W, CANVAS_H);
        expect(release({ x: 0.5, y: (pill.y - 24) / CANVAS_H }, true)).toBe('reposition');
    });

    it('treats a release that never moved as a tap, even over the bin', () => {
        // The bin is only drawn once the drag has started, so a target the user cannot see must
        // not swallow a plain tap on a label that happens to sit near the bottom of the picture.
        expect(release(binCentre(), false)).toBe('tap');
        expect(release(null, false)).toBe('tap');
    });

    it('keeps the drop zone wrapped around the bin the editor actually draws', () => {
        [[360, 480], [320, 220], [400, 900], [180, 300]].forEach(([width, height]) => {
            const pill = photoTrashPillRect(width, height);
            const zone = photoTrashZoneRect(width, height);
            // Every corner of the drawn pill has to fall inside the region that deletes.
            expect(zone.x).toBeLessThanOrEqual(pill.x);
            expect(zone.y).toBeLessThanOrEqual(pill.y);
            expect(zone.x + zone.width).toBeGreaterThanOrEqual(pill.x + pill.width);
            expect(zone.y + zone.height).toBeGreaterThanOrEqual(pill.y + pill.height);
            // And the zone never escapes the canvas it is measured against.
            expect(zone.x).toBeGreaterThanOrEqual(0);
            expect(zone.x + zone.width).toBeLessThanOrEqual(width);
            expect(zone.y + zone.height).toBeCloseTo(height, 5);
        });
    });

    it('tracks the bin down the canvas instead of using a fixed fraction of its height', () => {
        // A hard-coded `y > 0.82` band sat far above the bin on a tall canvas and cut the top off
        // it on a short one. Anchoring to the bottom edge keeps both ends honest.
        const tall = photoTrashZoneRect(360, 900);
        expect(isPointInPhotoTrashZone({ x: 0.5, y: 0.85 }, tall, 360, 900)).toBe(false);
        expect(release({ x: 0.5, y: 0.85 }, true, 360, 900)).toBe('reposition');
        expect(release(binCentre(360, 900), true, 360, 900)).toBe('delete');

        const short = photoTrashZoneRect(360, 220);
        const shortPill = photoTrashPillRect(360, 220);
        // The very top edge of the drawn pill on a short canvas — outside the old 0.82 band.
        expect(shortPill.y / 220).toBeLessThan(0.82);
        expect(isPointInPhotoTrashZone({ x: 0.5, y: shortPill.y / 220 }, short, 360, 220)).toBe(true);
    });

    it('accepts a drop on either end of the bin, not just its middle', () => {
        // The old band only covered the middle 44% of the canvas, so the ends of a pill wide
        // enough to read were visibly highlighted yet refused the drop.
        const pill = photoTrashPillRect(CANVAS_W, CANVAS_H);
        const y = (pill.y + pill.height / 2) / CANVAS_H;
        expect(release({ x: (pill.x + 2) / CANVAS_W, y }, true)).toBe('delete');
        expect(release({ x: (pill.x + pill.width - 2) / CANVAS_W, y }, true)).toBe('delete');
        expect(pill.width / CANVAS_W).toBeGreaterThan(0.44);
    });

    it('lets go of the label below the bin as well, since nothing else lives down there', () => {
        expect(release({ x: 0.5, y: 1 }, true)).toBe('delete');
    });

    it('keeps the bin on a canvas too narrow to fit it at full width', () => {
        const pill = photoTrashPillRect(120, 300);
        expect(pill.x).toBe(0);
        expect(pill.width).toBe(120);
        expect(photoTrashZoneRect(120, 300).width).toBe(120);
    });

    it('ignores a missing or degenerate zone rather than deleting by accident', () => {
        const zone = photoTrashZoneRect(CANVAS_W, CANVAS_H);
        expect(isPointInPhotoTrashZone(null, zone, CANVAS_W, CANVAS_H)).toBe(false);
        expect(isPointInPhotoTrashZone(
            { x: 0.5, y: 0.95 }, { x: 0, y: 0, width: 0, height: 0 }, CANVAS_W, CANVAS_H,
        )).toBe(false);
    });
});
