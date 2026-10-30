import { describe, expect, it } from 'vitest';

import {
    FULL_PHOTO_CROP,
    IDENTITY_PHOTO_GEOMETRY,
    applyPhotoAffine,
    isIdentityPhotoGeometry,
    mirrorPhotoGeometry,
    orientedPhotoSize,
    photoAffineToSvg,
    photoBaseSteps,
    photoCropPixels,
    photoCropSize,
    photoDisplayTransform,
    samePhotoCrop,
    turnPhotoGeometry,
    type PhotoGeometry,
    type PhotoQuarterTurns,
    type PhotoSize,
} from './photoGeometry';
import type { PhotoPoint } from './photoEditor';

const source: PhotoSize = { width: 400, height: 300 };
const samples: PhotoPoint[] = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 120, y: 210 }, { x: 333, y: 47 }, { x: 400, y: 300 }];

/**
 * Where a pixel of the original lands, normalised to the result, after the steps an image
 * manipulator runs: mirror, clockwise quarter turns, then the crop measured on the turned photo.
 */
function bakedPosition(point: PhotoPoint, photo: PhotoSize, geometry: PhotoGeometry): PhotoPoint {
    let position = { ...point };
    let size = { ...photo };
    if (geometry.flipped) position = { x: size.width - position.x, y: position.y };
    for (let turn = 0; turn < geometry.quarterTurns; turn += 1) {
        position = { x: size.height - position.y, y: position.x };
        size = { width: size.height, height: size.width };
    }
    const { crop } = geometry;
    return {
        x: (position.x - crop.x * size.width) / (crop.width * size.width),
        y: (position.y - crop.y * size.height) / (crop.height * size.height),
    };
}

function everyGeometry(crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }): PhotoGeometry[] {
    const geometries: PhotoGeometry[] = [];
    for (const flipped of [false, true]) {
        for (const quarterTurns of [0, 1, 2, 3] as PhotoQuarterTurns[]) {
            geometries.push({ quarterTurns, flipped, crop });
        }
    }
    return geometries;
}

describe('photo geometry', () => {
    it('shows an untouched photo pixel for pixel', () => {
        const transform = photoDisplayTransform(source, IDENTITY_PHOTO_GEOMETRY, FULL_PHOTO_CROP, source);
        expect(applyPhotoAffine(transform, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
        expect(photoAffineToSvg(transform)).toBe('matrix(1 0 0 1 0 0)');
    });

    it('draws on screen exactly the pixels the export bakes, for every turn, mirror and crop', () => {
        for (const geometry of everyGeometry()) {
            const cropped = photoCropSize(source, geometry);
            const canvas = { width: cropped.width * 0.7, height: cropped.height * 0.7 };
            const transform = photoDisplayTransform(source, geometry, geometry.crop, canvas);
            for (const sample of samples) {
                const onScreen = applyPhotoAffine(transform, sample);
                const baked = bakedPosition(sample, source, geometry);
                expect(onScreen.x / canvas.width).toBeCloseTo(baked.x, 9);
                expect(onScreen.y / canvas.height).toBeCloseTo(baked.y, 9);
            }
        }
    });

    it('turns the crop with the photo, so a turn and its reverse cancel out', () => {
        const start: PhotoGeometry = { quarterTurns: 0, flipped: false, crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } };
        let turned = start;
        for (let turn = 0; turn < 4; turn += 1) turned = turnPhotoGeometry(turned, 'cw');
        expect(turned.quarterTurns).toBe(0);
        expect(samePhotoCrop(turned.crop, start.crop)).toBe(true);

        const back = turnPhotoGeometry(turnPhotoGeometry(start, 'cw'), 'ccw');
        expect(back.quarterTurns).toBe(0);
        expect(samePhotoCrop(back.crop, start.crop)).toBe(true);
    });

    it('moves what is on screen a quarter turn when the photo is turned', () => {
        for (const geometry of everyGeometry()) {
            const cropped = photoCropSize(source, geometry);
            const canvas = { width: cropped.width, height: cropped.height };
            const before = photoDisplayTransform(source, geometry, geometry.crop, canvas);
            const clockwise = turnPhotoGeometry(geometry, 'cw');
            const turnedCanvas = { width: canvas.height, height: canvas.width };
            const after = photoDisplayTransform(source, clockwise, clockwise.crop, turnedCanvas);
            for (const sample of samples) {
                const was = applyPhotoAffine(before, sample);
                const now = applyPhotoAffine(after, sample);
                expect(now.x).toBeCloseTo(canvas.height - was.y, 6);
                expect(now.y).toBeCloseTo(was.x, 6);
            }
        }
    });

    it('mirrors what is on screen, whatever turn the photo has', () => {
        for (const geometry of everyGeometry()) {
            const cropped = photoCropSize(source, geometry);
            const canvas = { width: cropped.width, height: cropped.height };
            const before = photoDisplayTransform(source, geometry, geometry.crop, canvas);
            const mirrored = mirrorPhotoGeometry(geometry);
            const after = photoDisplayTransform(source, mirrored, mirrored.crop, canvas);
            for (const sample of samples) {
                const was = applyPhotoAffine(before, sample);
                const now = applyPhotoAffine(after, sample);
                expect(now.x).toBeCloseTo(canvas.width - was.x, 6);
                expect(now.y).toBeCloseTo(was.y, 6);
            }
            const twice = mirrorPhotoGeometry(mirrored);
            expect(twice.quarterTurns).toBe(geometry.quarterTurns);
            expect(twice.flipped).toBe(geometry.flipped);
            expect(samePhotoCrop(twice.crop, geometry.crop)).toBe(true);
        }
    });

    it('swaps the sides of a photo turned an odd number of quarters', () => {
        expect(orientedPhotoSize(source, 1)).toEqual({ width: 300, height: 400 });
        expect(orientedPhotoSize(source, 2)).toEqual({ width: 400, height: 300 });
        expect(photoCropSize(source, { quarterTurns: 3, flipped: false, crop: { x: 0, y: 0, width: 0.5, height: 0.25 } }))
            .toEqual({ width: 150, height: 100 });
    });

    it('knows an untouched geometry', () => {
        expect(isIdentityPhotoGeometry(IDENTITY_PHOTO_GEOMETRY)).toBe(true);
        expect(isIdentityPhotoGeometry({ ...IDENTITY_PHOTO_GEOMETRY, flipped: true })).toBe(false);
        expect(isIdentityPhotoGeometry({ ...IDENTITY_PHOTO_GEOMETRY, crop: { x: 0, y: 0, width: 0.9, height: 1 } })).toBe(false);
        // Four quarter turns and two mirrors leave nothing to bake.
        let geometry = IDENTITY_PHOTO_GEOMETRY;
        for (let turn = 0; turn < 4; turn += 1) geometry = turnPhotoGeometry(geometry, 'ccw');
        expect(isIdentityPhotoGeometry(mirrorPhotoGeometry(mirrorPhotoGeometry(geometry)))).toBe(true);
    });
});

describe('baking a geometry into pixels', () => {
    it('asks for nothing when the photo is untouched and small enough', () => {
        expect(photoBaseSteps(source, IDENTITY_PHOTO_GEOMETRY, 3000)).toEqual({ steps: [], size: source });
    });

    it('mirrors, turns, crops on the turned photo and then shrinks, in that order', () => {
        const big = { width: 4000, height: 3000 };
        const geometry: PhotoGeometry = { quarterTurns: 1, flipped: true, crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 } };
        const { steps, size } = photoBaseSteps(big, geometry, 1000);
        expect(steps).toEqual([
            { type: 'flip' },
            { type: 'rotate', degrees: 90 },
            // The turned photo is 3000×4000.
            { type: 'crop', originX: 750, originY: 400, width: 1500, height: 3200 },
            { type: 'resize', width: 469, height: 1000 },
        ]);
        expect(size).toEqual({ width: 469, height: 1000 });
    });

    it('keeps a crop on the edge of the photo inside it', () => {
        expect(photoCropPixels({ x: 0.95, y: 0.95, width: 0.2, height: 0.2 }, { width: 100, height: 100 }))
            .toEqual({ originX: 95, originY: 95, width: 5, height: 5 });
        expect(photoCropPixels({ x: 0, y: 0, width: 0.001, height: 0.001 }, { width: 100, height: 100 }))
            .toEqual({ originX: 0, originY: 0, width: 1, height: 1 });
    });
});
