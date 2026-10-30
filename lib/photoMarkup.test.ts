import { describe, expect, it } from 'vitest';

import {
    PHOTO_LABEL_STYLES,
    PHOTO_PEN_INKS,
    mirrorPhotoAnnotations,
    photoCanvasScale,
    reframePhotoAnnotations,
    turnPhotoAnnotations,
} from './photoMarkup';
import {
    applyPhotoAffine,
    mirrorPhotoGeometry,
    photoCropSize,
    photoDisplayTransform,
    turnPhotoGeometry,
    type PhotoGeometry,
    type PhotoSize,
} from './photoGeometry';
import { photoTextColors, type PhotoPoint, type PhotoShape, type PhotoStroke, type PhotoText } from './photoEditor';

const source: PhotoSize = { width: 400, height: 300 };
const geometry: PhotoGeometry = { quarterTurns: 1, flipped: false, crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 } };
const pixel = { x: 250, y: 120 };

const stroke = (points: PhotoPoint[]): PhotoStroke => ({ id: 's', type: 'stroke', color: '#ef4444', width: 4, opacity: 1, points });
const label = (point: PhotoPoint, extra: Partial<PhotoText> = {}): PhotoText => ({
    id: 't',
    type: 'text',
    text: 'Aorta',
    point,
    fontSize: 20,
    bgStyle: 'classic',
    textAlign: 'center',
    color: '#ef4444',
    width: 1,
    opacity: 1,
    ...extra,
});

/** A canvas showing the geometry's crop, and where a pixel of the original sits on it, normalised. */
function viewOf(view: PhotoGeometry) {
    const size = photoCropSize(source, view);
    const canvas = { width: size.width * 0.8, height: size.height * 0.8 };
    const transform = photoDisplayTransform(source, view, view.crop, canvas);
    const at = (point: PhotoPoint) => {
        const position = applyPhotoAffine(transform, point);
        return { x: position.x / canvas.width, y: position.y / canvas.height };
    };
    return { canvas, at };
}

describe('photo markup follows the photo', () => {
    it('stays on the same part of the photo, at the same size on it, when the crop changes', () => {
        const before = viewOf(geometry);
        const widened: PhotoGeometry = { ...geometry, crop: { x: 0, y: 0.1, width: 0.9, height: 0.8 } };
        const after = viewOf(widened);
        const factor = photoCanvasScale(after.canvas.width, photoCropSize(source, widened).width)
            / photoCanvasScale(before.canvas.width, photoCropSize(source, geometry).width);
        const [moved] = reframePhotoAnnotations([stroke([before.at(pixel)])], geometry.crop, widened.crop, factor) as PhotoStroke[];
        expect(moved.points[0].x).toBeCloseTo(after.at(pixel).x, 9);
        expect(moved.points[0].y).toBeCloseTo(after.at(pixel).y, 9);
        expect(moved.width).toBeCloseTo(4 * factor, 9);
    });

    it('keeps a mark the crop leaves out, off the canvas, so widening the crop brings it back', () => {
        const tightened = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
        const marks = [stroke([{ x: 0.1, y: 0.1 }])];
        const [cut] = reframePhotoAnnotations(marks, { x: 0, y: 0, width: 1, height: 1 }, tightened, 2) as PhotoStroke[];
        expect(cut.points[0].x).toBeLessThan(0);
        const [restored] = reframePhotoAnnotations([cut], tightened, { x: 0, y: 0, width: 1, height: 1 }, 0.5) as PhotoStroke[];
        expect(restored.points[0].x).toBeCloseTo(0.1, 9);
        expect(restored.width).toBeCloseTo(4, 9);
    });

    it('hands back the same markup when nothing about the view changed', () => {
        const marks = [stroke([{ x: 0.3, y: 0.4 }])];
        expect(reframePhotoAnnotations(marks, geometry.crop, { ...geometry.crop }, 1)).toBe(marks);
    });

    it('turns with the photo, keeping a label upright and centred on what it names', () => {
        for (const direction of ['cw', 'ccw'] as const) {
            const before = viewOf(geometry);
            const turned = turnPhotoGeometry(geometry, direction);
            const after = viewOf(turned);
            const marks = [stroke([before.at(pixel)]), label(before.at(pixel))];
            const [movedStroke, movedLabel] = turnPhotoAnnotations(marks, direction, 1.5) as [PhotoStroke, PhotoText];
            expect(movedStroke.points[0].x).toBeCloseTo(after.at(pixel).x, 9);
            expect(movedStroke.points[0].y).toBeCloseTo(after.at(pixel).y, 9);
            expect(movedLabel.point.x).toBeCloseTo(after.at(pixel).x, 9);
            expect(movedLabel.rotation).toBeUndefined();
            expect(movedLabel.fontSize).toBeCloseTo(30, 9);
        }
    });

    it('mirrors with the photo without mirroring the words', () => {
        const before = viewOf(geometry);
        const mirrored = mirrorPhotoGeometry(geometry);
        const after = viewOf(mirrored);
        const arrow: PhotoShape = { id: 'a', type: 'arrow', color: '#ef4444', width: 4, opacity: 1, start: before.at(pixel), end: { x: 0.9, y: 0.9 } };
        const leaning = label({ x: 0.25, y: 0.3 }, { textAlign: 'left', rotation: 30 });
        const [movedArrow, movedLabel] = mirrorPhotoAnnotations([arrow, leaning]) as [PhotoShape, PhotoText];
        expect(movedArrow.start.x).toBeCloseTo(after.at(pixel).x, 9);
        expect(movedArrow.end).toEqual({ x: 1 - 0.9, y: 0.9 });
        expect(movedLabel.point.x).toBeCloseTo(0.75, 9);
        expect(movedLabel.textAlign).toBe('right');
        expect(movedLabel.rotation).toBe(330);
        expect(mirrorPhotoAnnotations(mirrorPhotoAnnotations([leaning]))[0]).toEqual(leaning);
    });
});

describe('photo inks and labels', () => {
    const luminance = (hex: string) => {
        const channel = (offset: number) => {
            const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    };

    it('keeps a label legible on its plate in every photo ink', () => {
        for (const color of PHOTO_PEN_INKS) {
            const { background, text } = photoTextColors(label({ x: 0.5, y: 0.5 }, { bgStyle: 'badge', color }));
            const [light, dark] = [luminance(background), luminance(text)].sort((a, b) => b - a);
            expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(3);
        }
    });

    it('offers the halo first, for a busy photo', () => {
        expect(PHOTO_LABEL_STYLES[0]).toBe('classic');
    });
});
