import { describe, expect, it } from 'vitest';
import {
    applyAspectRatioToCropRect,
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
    calculateSourceCropPixels,
    clampCropRect,
    clampPhotoPoint,
    cropPhotoAnnotation,
    cropPhotoPoint,
    findPhotoAnnotationAtPoint,
    findPhotoAnnotationsInSweep,
    isPhotoShapeDragCommittable,
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
    photoArrowHead,
    photoExportSurface,
    scalePhotoAnnotation,
    clampPhotoTextSize,
    findPhotoSelectionHandle,
    oppositePhotoCorner,
    photoAnchorForFixedCorner,
    photoHandleResizeFactor,
    photoHandleTouchRadius,
    photoPointerAngle,
    photoRotateHandleSide,
    photoSelectionHandlePoints,
    photoTextAnchorPixels,
    photoImageAnchorPixels,
    resizePhotoImageByHandle,
    resizePhotoTextByHandle,
    resolvePhotoDragSnap,
    resolvePhotoHandleRotation,
    PHOTO_ROTATE_HANDLE_OFFSET,
    PHOTO_TEXT_MAX_SIZE,
    PHOTO_TEXT_MIN_SIZE,
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

    it('turns and trims a picture with the sheet it was placed on', () => {
        const turned = rotatePhotoAnnotationClockwise(picture({ point: { x: 0.25, y: 0.8 }, rotation: 30 }));
        expect(turned).toMatchObject({ type: 'image', rotation: 120 });
        expect((turned as PhotoImage).point.x).toBeCloseTo(0.2, 6);
        expect((turned as PhotoImage).point.y).toBeCloseTo(0.25, 6);

        const trimmed = cropPhotoAnnotation(
            picture({ point: { x: 0.5, y: 0.4 } }),
            { x: 0.2, y: 0.2, width: 0.6, height: 0.4 },
        );
        expect((trimmed as PhotoImage).point).toEqual({ x: 0.5, y: 0.5 });
    });

    it('takes both sides of the box up to an export surface', () => {
        const exported = scalePhotoAnnotation(picture(), 4);
        expect(exported.width).toBe(800);
        expect(exported.height).toBe(600);
        expect(exported.uri).toBe('file:///tmp/kalp.png');
    });
});

describe('the selection frame a finger grabs', () => {
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

    function label(overrides: Partial<PhotoText> = {}): PhotoText {
        return {
            id: 'txt',
            type: 'text',
            point: { x: 0.5, y: 0.5 },
            text: 'Merhaba',
            fontSize: 20,
            bgStyle: 'badge',
            textAlign: 'center',
            color: '#ffffff',
            width: 1,
            opacity: 1,
            ...overrides,
        };
    }

    /** The frame the editor draws around a picture, in the picture's own upright coordinates. */
    function frameOf(annotation: PhotoImage) {
        return {
            anchor: photoImageAnchorPixels(annotation, CANVAS.width, CANVAS.height),
            bounds: photoImageBounds(annotation, CANVAS.width, CANVAS.height),
            rotation: annotation.rotation ?? 0,
        };
    }

    it('puts a handle on every corner and the knob above the top edge', () => {
        const handles = photoSelectionHandlePoints(frameOf(picture()));
        expect(handles.tl).toEqual({ x: 80, y: 165 });
        expect(handles.tr).toEqual({ x: 280, y: 165 });
        expect(handles.bl).toEqual({ x: 80, y: 315 });
        expect(handles.br).toEqual({ x: 280, y: 315 });
        expect(handles.rotate).toEqual({ x: 180, y: 165 - PHOTO_ROTATE_HANDLE_OFFSET });
    });

    it('carries the handles round with a picture that has been turned', () => {
        const handles = photoSelectionHandlePoints(frameOf(picture({ rotation: 90 })));
        // A quarter turn about the centre puts the top-left corner where the top-right was.
        expect(handles.tl.x).toBeCloseTo(255, 6);
        expect(handles.tl.y).toBeCloseTo(140, 6);
        expect(handles.rotate.x).toBeCloseTo(180 + 75 + PHOTO_ROTATE_HANDLE_OFFSET, 6);
        expect(handles.rotate.y).toBeCloseTo(240, 6);
    });

    it('hangs the knob under a picture that is pressed against the top of the page', () => {
        const middle = frameOf(picture());
        expect(photoRotateHandleSide(middle, CANVAS)).toBe('top');

        // Its top edge is 1.8pt from the page's, so a knob above it would be clipped away.
        const atTheTop = frameOf(picture({ point: { x: 0.5, y: 0.16 } }));
        expect(photoRotateHandleSide(atTheTop, CANVAS)).toBe('bottom');
        const knob = photoSelectionHandlePoints(atTheTop, 'bottom').rotate;
        expect(knob.y).toBeCloseTo(atTheTop.bounds.y + atTheTop.bounds.height + PHOTO_ROTATE_HANDLE_OFFSET, 6);
        expect(knob.y).toBeLessThan(CANVAS.height);

        // A picture with no room on either side keeps the side it started on.
        const enormous = frameOf(picture({ width: 4000, height: 4000 }));
        expect(photoRotateHandleSide(enormous, CANVAS)).toBe('top');
    });

    it('gives a fingertip the handle it is nearest, and nothing when it is on neither', () => {
        const handles = photoSelectionHandlePoints(frameOf(picture()));
        expect(findPhotoSelectionHandle({ x: 84, y: 170 }, handles)).toBe('tl');
        expect(findPhotoSelectionHandle({ x: 276, y: 310 }, handles)).toBe('br');
        expect(findPhotoSelectionHandle({ x: 180, y: 137 }, handles)).toBe('rotate');
        // The middle of a 200x150 picture is nowhere near a corner: that touch is a drag.
        expect(findPhotoSelectionHandle({ x: 180, y: 240 }, handles)).toBeNull();
    });

    it('reads a corner drag as a scaling of the diagonal it is dragged along', () => {
        const geometry = frameOf(picture());
        // Twice the diagonal out from the corner that stays put.
        expect(photoHandleResizeFactor({
            handle: 'br',
            pointer: { x: 80 + 400, y: 165 + 300 },
            geometry,
        })).toBeCloseTo(2, 6);
        // Sideways off the diagonal only moves the picture along it, never out of aspect.
        expect(photoHandleResizeFactor({
            handle: 'br',
            pointer: { x: 280 + 30, y: 315 - 40 },
            geometry,
        })).toBeCloseTo(1, 1);
        // Dragged back past the corner it is measured from: the smallest box, not a flipped one.
        expect(photoHandleResizeFactor({
            handle: 'br',
            pointer: { x: 20, y: 100 },
            geometry,
        })).toBeGreaterThan(0);
        expect(photoHandleResizeFactor({
            handle: 'br',
            pointer: { x: 20, y: 100 },
            geometry,
        })).toBeLessThan(0.01);
    });

    it('resizes a picture about the corner opposite the one being dragged', () => {
        const before = picture();
        const after = resizePhotoImageByHandle({
            annotation: before,
            handle: 'br',
            pointer: { x: 80 + 400, y: 165 + 300 },
            canvas: CANVAS,
        });
        expect(after.width).toBeCloseTo(400, 6);
        expect(after.height).toBeCloseTo(300, 6);
        expect(after.width / after.height).toBeCloseTo(before.width / before.height, 6);
        // The top-left corner has not moved a pixel; only the dragged corner travelled.
        const anchored = photoSelectionHandlePoints(frameOf(after));
        expect(anchored.tl.x).toBeCloseTo(80, 6);
        expect(anchored.tl.y).toBeCloseTo(165, 6);
    });

    it('pins the opposite corner of a turned picture too', () => {
        const before = picture({ rotation: 37 });
        const pinned = photoSelectionHandlePoints(frameOf(before)).tl;
        const after = resizePhotoImageByHandle({
            annotation: before,
            handle: 'br',
            pointer: { x: 300, y: 400 },
            canvas: CANVAS,
        });
        const moved = photoSelectionHandlePoints(frameOf(after)).tl;
        expect(moved.x).toBeCloseTo(pinned.x, 6);
        expect(moved.y).toBeCloseTo(pinned.y, 6);
        expect(after.width / after.height).toBeCloseTo(before.width / before.height, 6);
        expect(after.rotation).toBe(37);
    });

    it('will not let a corner drag shrink a picture out of reach', () => {
        const shrunk = resizePhotoImageByHandle({
            annotation: picture(),
            handle: 'tl',
            pointer: { x: 279, y: 314 },
            canvas: CANVAS,
        });
        expect(Math.min(shrunk.width, shrunk.height)).toBeGreaterThanOrEqual(PHOTO_IMAGE_MIN_EDGE);
    });

    it('grows a label by its font size, keeping the corner it is measured from', () => {
        const before = label();
        const box = calculatePhotoTextBounds(before, CANVAS.width, CANVAS.height);
        const after = resizePhotoTextByHandle({
            annotation: before,
            handle: 'br',
            pointer: { x: box.x + box.width * 2, y: box.y + box.height * 2 },
            canvas: CANVAS,
        });
        expect(after.fontSize).toBe(40);
        const grown = calculatePhotoTextBounds(after, CANVAS.width, CANVAS.height);
        expect(grown.x).toBeCloseTo(box.x, 6);
        expect(grown.y).toBeCloseTo(box.y, 6);
    });

    it('keeps a label inside the size range every other control uses', () => {
        const huge = resizePhotoTextByHandle({
            annotation: label(),
            handle: 'br',
            pointer: { x: 4000, y: 4000 },
            canvas: CANVAS,
        });
        expect(huge.fontSize).toBe(PHOTO_TEXT_MAX_SIZE);
        expect(clampPhotoTextSize(4)).toBe(PHOTO_TEXT_MIN_SIZE);
        expect(clampPhotoTextSize(Number.NaN)).toBe(PHOTO_TEXT_MIN_SIZE);
    });

    it('leaves an annotation alone when the drag asks for the size it already has', () => {
        const before = picture();
        expect(resizePhotoImageByHandle({
            annotation: before,
            handle: 'br',
            pointer: { x: 280, y: 315 },
            canvas: CANVAS,
        })).toBe(before);

        const text = label();
        const box = calculatePhotoTextBounds(text, CANVAS.width, CANVAS.height);
        expect(resizePhotoTextByHandle({
            annotation: text,
            handle: 'br',
            pointer: { x: box.x + box.width, y: box.y + box.height },
            canvas: CANVAS,
        })).toBe(text);
    });

    it('leaves the middle of even a tiny label to the label', () => {
        const tiny = label({ fontSize: PHOTO_TEXT_MIN_SIZE, text: 'A' });
        const bounds = calculatePhotoTextBounds(tiny, CANVAS.width, CANVAS.height);
        const geometry = {
            anchor: photoTextAnchorPixels(tiny, CANVAS.width, CANVAS.height),
            bounds,
            rotation: 0,
        };
        const radius = photoHandleTouchRadius(bounds);
        expect(radius).toBeLessThan(Math.hypot(bounds.width, bounds.height) / 2);
        expect(findPhotoSelectionHandle(geometry.anchor, photoSelectionHandlePoints(geometry), radius)).toBeNull();
        // Its corners are still reachable; only the middle of the box was given back.
        const corner = photoSelectionHandlePoints(geometry).br;
        expect(findPhotoSelectionHandle(corner, photoSelectionHandlePoints(geometry), radius)).toBe('br');
        // A picture with room to spare keeps the full fingertip.
        expect(photoHandleTouchRadius({ x: 0, y: 0, width: 300, height: 240 })).toBe(26);
    });

    it('names the corner that has to stand still', () => {
        expect(oppositePhotoCorner('tl')).toBe('br');
        expect(oppositePhotoCorner('tr')).toBe('bl');
        expect(oppositePhotoCorner('bl')).toBe('tr');
        expect(oppositePhotoCorner('br')).toBe('tl');
    });

    it('moves the anchor by exactly what the resize pushed the fixed corner', () => {
        const before = frameOf(picture());
        const after = { ...before, bounds: { x: 80, y: 165, width: 400, height: 300 } };
        const anchor = photoAnchorForFixedCorner({ handle: 'br', before, after });
        // The box measured with the anchor left alone starts at the same top-left corner, so
        // the anchor does not have to move at all to keep it there.
        expect(anchor.x).toBeCloseTo(before.anchor.x, 6);
        expect(anchor.y).toBeCloseTo(before.anchor.y, 6);
    });
});

describe('turning an annotation by its knob', () => {
    const ANCHOR = { x: 180, y: 240 };

    it('reports the direction of a finger in the degrees annotations store', () => {
        expect(photoPointerAngle({ x: 280, y: 240 }, ANCHOR)).toBeCloseTo(0, 6);
        expect(photoPointerAngle({ x: 180, y: 340 }, ANCHOR)).toBeCloseTo(90, 6);
        expect(photoPointerAngle({ x: 180, y: 140 }, ANCHOR)).toBeCloseTo(270, 6);
    });

    it('turns with the finger from wherever the knob was taken hold of', () => {
        // The knob sits above the frame, so grabbing an upright picture starts 90 degrees round.
        const grabOffset = photoPointerAngle({ x: 180, y: 140 }, ANCHOR);
        const turned = resolvePhotoHandleRotation({
            pointer: { x: 180, y: 340 },
            anchor: ANCHOR,
            grabOffset,
        });
        expect(turned.rotation).toBeCloseTo(180, 6);
    });

    it('settles onto a quarter turn the finger is nearly at, and turns freely past that', () => {
        const nearlyStraight = resolvePhotoHandleRotation({
            pointer: { x: 180 + 100 * Math.cos((43 * Math.PI) / 180), y: 240 + 100 * Math.sin((43 * Math.PI) / 180) },
            anchor: ANCHOR,
            grabOffset: 0,
        });
        expect(nearlyStraight).toEqual({ rotation: 45, snapped: true });

        const deliberate = resolvePhotoHandleRotation({
            pointer: { x: 180 + 100 * Math.cos((30 * Math.PI) / 180), y: 240 + 100 * Math.sin((30 * Math.PI) / 180) },
            anchor: ANCHOR,
            grabOffset: 0,
        });
        expect(deliberate.snapped).toBe(false);
        expect(deliberate.rotation).toBeCloseTo(30, 4);
    });

    it('can be told not to settle at all', () => {
        const free = resolvePhotoHandleRotation({
            pointer: { x: 180 + 100 * Math.cos((43 * Math.PI) / 180), y: 240 + 100 * Math.sin((43 * Math.PI) / 180) },
            anchor: ANCHOR,
            grabOffset: 0,
            snap: false,
        });
        expect(free.snapped).toBe(false);
        expect(free.rotation).toBeCloseTo(43, 4);
    });
});

describe('settling a drag onto the middle of the page', () => {
    const CANVAS = { width: 360, height: 480 };

    it('takes a nearly centred drag to the centre and says which guide caught it', () => {
        const snap = resolvePhotoDragSnap({ point: { x: 0.49, y: 0.7 }, canvas: CANVAS });
        expect(snap.point.x).toBeCloseTo(0.5, 6);
        expect(snap.point.y).toBeCloseTo(0.7, 6);
        expect(snap.guides).toEqual({ x: true, y: false });
    });

    it('centres the box rather than the anchor a label hangs from', () => {
        const snap = resolvePhotoDragSnap({
            point: { x: 0.44, y: 0.5 },
            centreOffset: { x: 20, y: 0 },
            canvas: CANVAS,
        });
        expect(snap.point.x * CANVAS.width + 20).toBeCloseTo(180, 6);
        expect(snap.guides).toEqual({ x: true, y: true });
    });

    it('leaves a drag that is nowhere near the middle exactly where it is', () => {
        const point = { x: 0.2, y: 0.8 };
        const snap = resolvePhotoDragSnap({ point, canvas: CANVAS });
        expect(snap.point).toEqual(point);
        expect(snap.guides).toEqual({ x: false, y: false });
    });

    it('is not fooled by a canvas or an offset that has no size', () => {
        const snap = resolvePhotoDragSnap({
            point: { x: 0.5, y: 0.5 },
            centreOffset: { x: Number.NaN, y: Number.NaN },
            canvas: { width: 0, height: 0 },
        });
        expect(Number.isFinite(snap.point.x)).toBe(true);
        expect(Number.isFinite(snap.point.y)).toBe(true);
    });
});
