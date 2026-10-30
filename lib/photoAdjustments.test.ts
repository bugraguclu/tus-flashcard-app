import { describe, expect, it } from 'vitest';

import {
    NEUTRAL_PHOTO_ADJUSTMENTS,
    PHOTO_FILTERS,
    applyPhotoColorMatrix,
    clampPhotoAdjustment,
    isNeutralPhotoAdjustments,
    photoColorMatrix,
    photoColorMatrixValues,
    photoFilterMatching,
    type PhotoAdjustments,
} from './photoAdjustments';

const adjusted = (change: Partial<PhotoAdjustments>): PhotoAdjustments => ({ ...NEUTRAL_PHOTO_ADJUSTMENTS, ...change });

/** One RGBA pixel run through the sliders, as the web export runs it. */
function pixelAfter(change: Partial<PhotoAdjustments>, rgba: [number, number, number, number]): number[] {
    const matrix = photoColorMatrix(adjusted(change));
    const pixels = Uint8ClampedArray.from(rgba);
    if (matrix) applyPhotoColorMatrix(pixels, matrix);
    return Array.from(pixels);
}

describe('photo adjustment sliders', () => {
    it('leaves an untouched photo unfiltered', () => {
        expect(photoColorMatrix(NEUTRAL_PHOTO_ADJUSTMENTS)).toBeNull();
        expect(isNeutralPhotoAdjustments(adjusted({ warmth: 1 }))).toBe(false);
    });

    it('keeps slider values whole and inside the range', () => {
        expect(clampPhotoAdjustment(140)).toBe(100);
        expect(clampPhotoAdjustment(-100.4)).toBe(-100);
        expect(clampPhotoAdjustment(12.6)).toBe(13);
        expect(clampPhotoAdjustment(Number.NaN)).toBe(0);
    });

    it('builds one 4×5 matrix that leaves transparency alone', () => {
        const matrix = photoColorMatrix(adjusted({ brightness: 30, contrast: -20, saturation: 50, warmth: -10 }))!;
        expect(matrix).toHaveLength(20);
        expect(matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
        expect(photoColorMatrixValues(matrix).split(' ')).toHaveLength(20);
        expect(pixelAfter({ brightness: 60, saturation: -40 }, [10, 120, 230, 77])[3]).toBe(77);
    });

    it('lightens and darkens with brightness', () => {
        const [lighter] = pixelAfter({ brightness: 50 }, [100, 100, 100, 255]);
        const [darker] = pixelAfter({ brightness: -50 }, [100, 100, 100, 255]);
        expect(lighter).toBeGreaterThan(110);
        expect(darker).toBeLessThan(90);
    });

    it('pushes tones away from middle grey with contrast, and pulls them in without it', () => {
        const [shadowUp] = pixelAfter({ contrast: 60 }, [60, 60, 60, 255]);
        const [highlightUp] = pixelAfter({ contrast: 60 }, [200, 200, 200, 255]);
        expect(shadowUp).toBeLessThan(60);
        expect(highlightUp).toBeGreaterThan(200);
        const [shadowDown] = pixelAfter({ contrast: -60 }, [60, 60, 60, 255]);
        expect(shadowDown).toBeGreaterThan(60);
    });

    it('turns a colour to its own grey at the lowest saturation', () => {
        const [red, green, blue] = pixelAfter({ saturation: -100 }, [200, 40, 90, 255]);
        expect(Math.abs(red - green)).toBeLessThanOrEqual(1);
        expect(Math.abs(green - blue)).toBeLessThanOrEqual(1);
    });

    it('warms a grey towards red and cools it towards blue', () => {
        const [warmRed, , warmBlue] = pixelAfter({ warmth: 80 }, [128, 128, 128, 255]);
        const [coolRed, , coolBlue] = pixelAfter({ warmth: -80 }, [128, 128, 128, 255]);
        expect(warmRed).toBeGreaterThan(warmBlue);
        expect(coolBlue).toBeGreaterThan(coolRed);
    });

    it('turns a photographed page white and its ink black with the document look', () => {
        const documentLook = PHOTO_FILTERS.find((filter) => filter.id === 'document')!.adjustments;
        const [paper] = pixelAfter(documentLook, [191, 186, 178, 255]);
        const [ink] = pixelAfter(documentLook, [55, 52, 60, 255]);
        expect(paper).toBeGreaterThanOrEqual(245);
        expect(ink).toBeLessThanOrEqual(12);
    });

    it('names the look the sliders are set to, and none once one is moved', () => {
        for (const filter of PHOTO_FILTERS) expect(photoFilterMatching(filter.adjustments)).toBe(filter.id);
        const vivid = PHOTO_FILTERS.find((filter) => filter.id === 'vivid')!.adjustments;
        expect(photoFilterMatching({ ...vivid, contrast: vivid.contrast + 1 })).toBeNull();
    });
});

describe('applying a colour matrix to pixels', () => {
    it('returns every byte unchanged through an identity matrix', () => {
        const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
        const pixels = new Uint8ClampedArray(256 * 4);
        for (let value = 0; value < 256; value += 1) pixels.set([value, 255 - value, value, 255], value * 4);
        const before = Array.from(pixels);
        applyPhotoColorMatrix(pixels, identity);
        expect(Array.from(pixels)).toEqual(before);
    });

    it('ignores a matrix of the wrong size', () => {
        const pixels = Uint8ClampedArray.from([1, 2, 3, 4]);
        applyPhotoColorMatrix(pixels, [1, 2, 3]);
        expect(Array.from(pixels)).toEqual([1, 2, 3, 4]);
    });
});
