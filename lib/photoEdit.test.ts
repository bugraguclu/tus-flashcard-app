import { describe, expect, it } from 'vitest';

import {
    INITIAL_PHOTO_EDIT,
    cropPhotoEdit,
    isPhotoEditUntouched,
    mirrorPhotoEdit,
    photoCropScreenCanvas,
    photoEditCanvas,
    photoEditExportSurface,
    resetPhotoEditGeometry,
    turnPhotoEdit,
    type PhotoEdit,
} from './photoEdit';
import { FULL_PHOTO_CROP, applyPhotoAffine, isIdentityPhotoGeometry, photoDisplayTransform } from './photoGeometry';
import { calculatePhotoTextBounds, type PhotoStroke, type PhotoText } from './photoEditor';

const photo = { width: 400, height: 300 };
const stage = { width: 375, height: 520 };
const mark: PhotoStroke = { id: 's', type: 'stroke', color: '#ef4444', width: 4, opacity: 1, points: [{ x: 0.3, y: 0.4 }] };
const caption: PhotoText = {
    id: 't', type: 'text', text: 'Aorta', point: { x: 0.6, y: 0.2 }, fontSize: 20,
    bgStyle: 'classic', textAlign: 'center', color: '#ef4444', width: 1, opacity: 1,
};
const drawn: PhotoEdit = { ...INITIAL_PHOTO_EDIT, annotations: [mark, caption] };

/** Where a mark sits on the original photo, in its pixels, and how thick it is there. */
function onPhoto(edit: PhotoEdit) {
    const canvas = photoEditCanvas(photo, edit.geometry, stage);
    const transform = photoDisplayTransform(photo, edit.geometry, edit.geometry.crop, canvas);
    // Invert the display transform by solving for the photo pixel under the mark.
    const [a, b, c, d, e, f] = transform;
    const determinant = a * d - b * c;
    const stroke = edit.annotations[0] as PhotoStroke;
    const x = stroke.points[0].x * canvas.width - e;
    const y = stroke.points[0].y * canvas.height - f;
    const pixel = { x: (d * x - c * y) / determinant, y: (a * y - b * x) / determinant };
    // The solved pixel has to land back on the mark, or the inversion above is wrong.
    const landed = applyPhotoAffine(transform, pixel);
    expect(landed.x).toBeCloseTo(stroke.points[0].x * canvas.width, 6);
    const pointsPerPixel = Math.hypot(a, b);
    return { pixel, widthOnPhoto: stroke.width / pointsPerPixel };
}

describe('photo edits carry the markup along', () => {
    it('keeps a mark on the same photo pixel, at the same thickness on the photo, through every edit', () => {
        const start = onPhoto(drawn);
        let edit = turnPhotoEdit(drawn, 'cw', photo, stage);
        edit = mirrorPhotoEdit(edit);
        edit = cropPhotoEdit(edit, { x: 0.1, y: 0.15, width: 0.7, height: 0.6 }, photo, stage);
        edit = turnPhotoEdit(edit, 'ccw', photo, stage);
        const end = onPhoto(edit);
        expect(end.pixel.x).toBeCloseTo(start.pixel.x, 6);
        expect(end.pixel.y).toBeCloseTo(start.pixel.y, 6);
        expect(end.widthOnPhoto).toBeCloseTo(start.widthOnPhoto, 6);
    });

    it('puts everything back where it was drawn when the geometry is reset', () => {
        let edit = turnPhotoEdit(drawn, 'ccw', photo, stage);
        edit = cropPhotoEdit(edit, { x: 0.2, y: 0.1, width: 0.5, height: 0.5 }, photo, stage);
        edit = mirrorPhotoEdit(edit);
        edit = turnPhotoEdit(edit, 'ccw', photo, stage);
        const reset = resetPhotoEditGeometry(edit, photo, stage);
        expect(isIdentityPhotoGeometry(reset.geometry)).toBe(true);
        const [stroke, label] = reset.annotations as [PhotoStroke, PhotoText];
        expect(stroke.points[0].x).toBeCloseTo(0.3, 6);
        expect(stroke.points[0].y).toBeCloseTo(0.4, 6);
        expect(stroke.width).toBeCloseTo(4, 6);
        expect(label.point.x).toBeCloseTo(0.6, 6);
        expect(label.fontSize).toBeCloseTo(20, 6);
        expect(label.rotation).toBeUndefined();
    });

    it('keeps a label that was on the photo on it when the photo is turned to stand tall', () => {
        const wide: PhotoText = { ...caption, text: 'Arcus aortae', point: { x: 0.6, y: 0.25 }, fontSize: 26, bgStyle: 'badge' };
        const turned = turnPhotoEdit({ ...INITIAL_PHOTO_EDIT, annotations: [wide] }, 'cw', photo, stage);
        const canvas = photoEditCanvas(photo, turned.geometry, stage);
        const label = turned.annotations[0] as PhotoText;
        const bounds = calculatePhotoTextBounds(label, canvas.width, canvas.height);
        expect(bounds.x).toBeGreaterThanOrEqual(-0.5);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvas.width + 0.5);
        expect(label.rotation).toBeUndefined();
    });

    it('leaves a label the crop had already cut where it is', () => {
        const cropped = cropPhotoEdit({ ...INITIAL_PHOTO_EDIT, annotations: [caption] }, { x: 0, y: 0.3, width: 1, height: 0.7 }, photo, stage);
        const outside = cropped.annotations[0] as PhotoText;
        expect(outside.point.y).toBeLessThan(0);
        const turned = turnPhotoEdit(cropped, 'cw', photo, stage).annotations[0] as PhotoText;
        expect(turned.point.x).toBeGreaterThan(1);
    });

    it('returns the same edit for a crop that changes nothing', () => {
        expect(cropPhotoEdit(drawn, { ...FULL_PHOTO_CROP }, photo, stage)).toBe(drawn);
    });

    it('knows when there is nothing to save but the photo as picked', () => {
        expect(isPhotoEditUntouched(INITIAL_PHOTO_EDIT)).toBe(true);
        expect(isPhotoEditUntouched(drawn)).toBe(false);
        expect(isPhotoEditUntouched({ ...INITIAL_PHOTO_EDIT, adjustments: { ...INITIAL_PHOTO_EDIT.adjustments, warmth: 5 } })).toBe(false);
        expect(isPhotoEditUntouched(mirrorPhotoEdit(mirrorPhotoEdit(INITIAL_PHOTO_EDIT)))).toBe(true);
    });
});

describe('exporting an edited photo', () => {
    it('renders the baked photo\'s pixels on a surface a whole number of points across', () => {
        const canvas = { width: 351, height: 456 };
        // 901 × 1201 pixels at 3× would be 300⅓ × 400⅓ points, captured a pixel too wide and tall.
        const surface = photoEditExportSurface({ width: 901, height: 1201 }, canvas, 3);
        expect(surface).toEqual({ width: 300, height: 400, scale: 300 / 351 });
        expect(photoEditExportSurface({ width: 2000, height: 1500 }, canvas, 1)).toEqual({ width: 2000, height: 1500, scale: 2000 / 351 });
    });

    it('never enlarges a small crop to the screen', () => {
        const surface = photoEditExportSurface({ width: 300, height: 390 }, { width: 351, height: 456 }, 3);
        expect(surface.width * 3).toBe(300);
        expect(surface.height * 3).toBe(390);
    });
});

describe('the photo between the editor screens', () => {
    it('stays at the same size on the crop, adjust and draw screens while it is not cropped', () => {
        for (const size of [photo, { width: 3024, height: 4032 }, { width: 4000, height: 1000 }]) {
            for (const turns of [0, 1, 2, 3] as const) {
                const geometry = { ...INITIAL_PHOTO_EDIT.geometry, quarterTurns: turns };
                expect(photoEditCanvas(size, geometry, stage)).toEqual(photoCropScreenCanvas(size, geometry, stage));
            }
        }
    });

    it('fills the stage up to the same margin on every screen', () => {
        const canvas = photoCropScreenCanvas({ width: 3024, height: 4032 }, INITIAL_PHOTO_EDIT.geometry, stage);
        expect(canvas.width).toBeLessThanOrEqual(stage.width - 48);
        expect(canvas.height).toBeLessThanOrEqual(stage.height - 48);
        expect(Math.max(stage.width - 48 - canvas.width, stage.height - 48 - canvas.height)).toBeGreaterThan(0);
        expect(Math.min(stage.width - 48 - canvas.width, stage.height - 48 - canvas.height)).toBeLessThanOrEqual(1);
    });
});
