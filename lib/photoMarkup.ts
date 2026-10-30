// What the learner draws on a photo in the photo editor: its inks and label styles, and how the
// markup follows the photo when the photo is cropped, turned or mirrored.
//
// Markup is stored the way the drawing pad stores it — positions normalised to the canvas, widths
// and font sizes in canvas points — on the canvas that shows the cropped photo. A crop, a turn or a
// mirror changes that canvas, so each of them carries the markup across: every mark stays on the
// part of the photo it was drawn on, at the same size relative to the photo.

import {
    normalizePhotoRotation,
    scalePhotoAnnotation,
    type PhotoAnnotation,
    type PhotoCropRect,
    type PhotoPoint,
    type PhotoTextStyle,
} from './photoEditor';
import { turnPhotoPoint, type PhotoTurnDirection } from './photoGeometry';

/**
 * Pen inks for a photo. Red first, as markup on a picture usually is; then the inks that hold up
 * on light and on dark photos. Their light/dark split matches the label plates in
 * `photoTextColors`, so a label in any of them stays legible on its plate.
 */
export const PHOTO_PEN_INKS = ['#ef4444', '#f59e0b', '#ffffff', '#111827', '#2563eb'] as const;

/**
 * How a label on a photo is set off from the picture under it: a halo, a plate in the ink's
 * colour, or bare ink. A photo is busy where a page is blank, so it opens on the halo.
 */
export const PHOTO_LABEL_STYLES: PhotoTextStyle[] = ['classic', 'badge', 'plain'];
export const DEFAULT_PHOTO_LABEL_STYLE: PhotoTextStyle = 'classic';

/** The same annotation with every point it is placed by sent through `map`. */
export function mapPhotoAnnotationPoints<T extends PhotoAnnotation>(annotation: T, map: (point: PhotoPoint) => PhotoPoint): T {
    if (annotation.type === 'stroke') return { ...annotation, points: annotation.points.map(map) };
    if (annotation.type === 'text' || annotation.type === 'image') return { ...annotation, point: map(annotation.point) };
    return { ...annotation, start: map(annotation.start), end: map(annotation.end) };
}

/**
 * Canvas points per photo pixel on a canvas `canvasWidth` points wide that shows `pixelWidth`
 * pixels of the photo across. Two of these give the factor markup is scaled by when the view
 * of the photo changes.
 */
export function photoCanvasScale(canvasWidth: number, pixelWidth: number): number {
    return canvasWidth / Math.max(1e-6, pixelWidth);
}

/**
 * Markup drawn on a canvas showing `from` of the turned photo, moved onto one showing `to`.
 * `factor` is the second canvas's points per pixel over the first's, so a line keeps its
 * thickness on the photo when the crop zooms the photo in or out.
 *
 * Marks that fall outside the new crop are kept, off the canvas: they are cut from the export
 * like any other part of the photo outside the crop, and come back if the crop is widened.
 */
export function reframePhotoAnnotations(
    annotations: PhotoAnnotation[],
    from: PhotoCropRect,
    to: PhotoCropRect,
    factor: number,
): PhotoAnnotation[] {
    const sameWindow = from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height;
    if (sameWindow && factor === 1) return annotations;
    const move = (point: PhotoPoint): PhotoPoint => ({
        x: (from.x + point.x * from.width - to.x) / Math.max(1e-6, to.width),
        y: (from.y + point.y * from.height - to.y) / Math.max(1e-6, to.height),
    });
    return annotations.map((annotation) => scalePhotoAnnotation(mapPhotoAnnotationPoints(annotation, move), factor));
}

/**
 * Markup carried through a quarter turn of the photo. Every mark moves with the picture, but a
 * label stays upright so it can still be read; it is placed by its middle, so it stays centred on
 * what it names.
 */
export function turnPhotoAnnotations(
    annotations: PhotoAnnotation[],
    direction: PhotoTurnDirection,
    factor: number,
): PhotoAnnotation[] {
    return annotations.map((annotation) => scalePhotoAnnotation(
        mapPhotoAnnotationPoints(annotation, (point) => turnPhotoPoint(point, direction)),
        factor,
    ));
}

/**
 * Markup carried through a mirror of the photo. Marks are mirrored with the picture; a label's
 * words are not, so it stays readable, and a label leaning one way now leans the other.
 */
export function mirrorPhotoAnnotations(annotations: PhotoAnnotation[]): PhotoAnnotation[] {
    return annotations.map((annotation) => {
        const mirrored = mapPhotoAnnotationPoints(annotation, (point) => ({ x: 1 - point.x, y: point.y }));
        if (mirrored.type === 'text') {
            const textAlign = mirrored.textAlign === 'left' ? 'right' : mirrored.textAlign === 'right' ? 'left' : mirrored.textAlign;
            return {
                ...mirrored,
                textAlign,
                rotation: mirrored.rotation ? normalizePhotoRotation(-mirrored.rotation) : mirrored.rotation,
            };
        }
        if (mirrored.type === 'image' && mirrored.rotation) {
            return { ...mirrored, rotation: normalizePhotoRotation(-mirrored.rotation) };
        }
        return mirrored;
    });
}
