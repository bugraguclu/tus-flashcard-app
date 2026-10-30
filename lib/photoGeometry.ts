// The turn, mirror and crop of a photo being edited, kept as numbers rather than as pixels.
//
// The photo editor never re-encodes the picture while the learner works on it. A quarter turn, a
// mirror and a crop are drawn on screen through one affine transform and applied to the pixels
// once, when the photo is added to the card. Every step is instant and undoable, and a crop that
// was tightened can be widened again, because the pixels outside it are never thrown away.

import type { PhotoCropRect, PhotoPoint } from './photoEditor';

export type PhotoSize = { width: number; height: number };
export type PhotoQuarterTurns = 0 | 1 | 2 | 3;
export type PhotoTurnDirection = 'cw' | 'ccw';

export interface PhotoGeometry {
    /** Clockwise quarter turns, applied after the mirror. */
    quarterTurns: PhotoQuarterTurns;
    /** Mirrored left to right in the photo's own frame, before it is turned. */
    flipped: boolean;
    /** The part of the turned photo that is kept, normalised to the turned photo. */
    crop: PhotoCropRect;
}

export const FULL_PHOTO_CROP: PhotoCropRect = { x: 0, y: 0, width: 1, height: 1 };
export const IDENTITY_PHOTO_GEOMETRY: PhotoGeometry = { quarterTurns: 0, flipped: false, crop: FULL_PHOTO_CROP };

const EPSILON = 1e-6;

export function isFullPhotoCrop(crop: PhotoCropRect): boolean {
    return crop.x <= EPSILON && crop.y <= EPSILON && crop.width >= 1 - EPSILON && crop.height >= 1 - EPSILON;
}

export function isIdentityPhotoGeometry(geometry: PhotoGeometry): boolean {
    return geometry.quarterTurns === 0 && !geometry.flipped && isFullPhotoCrop(geometry.crop);
}

export function samePhotoCrop(a: PhotoCropRect, b: PhotoCropRect): boolean {
    return Math.abs(a.x - b.x) < EPSILON
        && Math.abs(a.y - b.y) < EPSILON
        && Math.abs(a.width - b.width) < EPSILON
        && Math.abs(a.height - b.height) < EPSILON;
}

/** The photo's size once turned: an odd number of quarter turns swaps its sides. */
export function orientedPhotoSize(source: PhotoSize, quarterTurns: PhotoQuarterTurns): PhotoSize {
    return quarterTurns % 2 === 1
        ? { width: source.height, height: source.width }
        : { width: source.width, height: source.height };
}

/** The size, in the photo's own pixels, of the part the crop keeps. */
export function photoCropSize(source: PhotoSize, geometry: PhotoGeometry): PhotoSize {
    const oriented = orientedPhotoSize(source, geometry.quarterTurns);
    return {
        width: Math.max(1, oriented.width * geometry.crop.width),
        height: Math.max(1, oriented.height * geometry.crop.height),
    };
}

/** A clockwise quarter turn of a normalised point, with the picture it sits on. */
export function turnPhotoPoint(point: PhotoPoint, direction: PhotoTurnDirection): PhotoPoint {
    return direction === 'cw' ? { x: 1 - point.y, y: point.x } : { x: point.y, y: 1 - point.x };
}

/**
 * The photo turned a quarter, the crop turning with it, so the same part of the picture stays
 * selected.
 */
export function turnPhotoGeometry(geometry: PhotoGeometry, direction: PhotoTurnDirection): PhotoGeometry {
    const { x, y, width, height } = geometry.crop;
    const crop = direction === 'cw'
        ? { x: 1 - (y + height), y: x, width: height, height: width }
        : { x: y, y: 1 - (x + width), width: height, height: width };
    const step = direction === 'cw' ? 1 : 3;
    return {
        ...geometry,
        quarterTurns: ((geometry.quarterTurns + step) % 4) as PhotoQuarterTurns,
        crop: tidyPhotoCrop(crop),
    };
}

/**
 * The photo as it is on screen, mirrored left to right.
 *
 * The mirror is stored in the photo's own frame, before the turn, so mirroring a turned photo
 * also reverses the turn: a mirror and a clockwise quarter turn give the same picture as an
 * anticlockwise quarter turn and then the mirror.
 */
export function mirrorPhotoGeometry(geometry: PhotoGeometry): PhotoGeometry {
    const { crop } = geometry;
    return {
        quarterTurns: ((4 - geometry.quarterTurns) % 4) as PhotoQuarterTurns,
        flipped: !geometry.flipped,
        crop: tidyPhotoCrop({ ...crop, x: 1 - (crop.x + crop.width) }),
    };
}

/** A crop kept inside the photo, with the rounding of repeated turns taken off its edges. */
export function tidyPhotoCrop(crop: PhotoCropRect): PhotoCropRect {
    const snap = (value: number) => {
        const rounded = Math.round(value);
        return Math.abs(value - rounded) < EPSILON ? rounded : value;
    };
    const x = Math.min(1, Math.max(0, snap(crop.x)));
    const y = Math.min(1, Math.max(0, snap(crop.y)));
    return {
        x,
        y,
        width: Math.min(1 - x, Math.max(EPSILON, snap(crop.width))),
        height: Math.min(1 - y, Math.max(EPSILON, snap(crop.height))),
    };
}

/** A 2D affine transform in SVG and canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type PhotoAffine = [number, number, number, number, number, number];

const IDENTITY_AFFINE: PhotoAffine = [1, 0, 0, 1, 0, 0];

/** The transform that applies `inner` first and `outer` after it. */
export function composePhotoAffine(outer: PhotoAffine, inner: PhotoAffine): PhotoAffine {
    const [a1, b1, c1, d1, e1, f1] = outer;
    const [a2, b2, c2, d2, e2, f2] = inner;
    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ];
}

export function applyPhotoAffine(transform: PhotoAffine, point: PhotoPoint): PhotoPoint {
    const [a, b, c, d, e, f] = transform;
    return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** The same transform as an SVG `transform` attribute. */
export function photoAffineToSvg(transform: PhotoAffine): string {
    return `matrix(${transform.map((value) => Number(value.toFixed(6))).join(' ')})`;
}

/**
 * Where each pixel of the photo lands on a canvas that shows `window` of the turned photo.
 *
 * The photo is drawn at its own pixel size and moved into place by this one transform: mirrored,
 * turned a quarter at a time, and then scaled so the window fills the canvas. Pass the whole photo
 * as the window to show all of it, as the crop screen does.
 */
export function photoDisplayTransform(
    source: PhotoSize,
    orientation: Pick<PhotoGeometry, 'quarterTurns' | 'flipped'>,
    window: PhotoCropRect,
    canvas: PhotoSize,
): PhotoAffine {
    let transform: PhotoAffine = orientation.flipped ? [-1, 0, 0, 1, source.width, 0] : IDENTITY_AFFINE;
    let size = { width: source.width, height: source.height };
    for (let turn = 0; turn < orientation.quarterTurns; turn += 1) {
        // A clockwise quarter turn of a w×h picture sends (x, y) to (h − y, x).
        transform = composePhotoAffine([0, 1, -1, 0, size.height, 0], transform);
        size = { width: size.height, height: size.width };
    }
    const scaleX = canvas.width / Math.max(EPSILON, window.width * size.width);
    const scaleY = canvas.height / Math.max(EPSILON, window.height * size.height);
    return composePhotoAffine(
        [scaleX, 0, 0, scaleY, -window.x * size.width * scaleX, -window.y * size.height * scaleY],
        transform,
    );
}

/** One step of the pixel work that turns the original photo into the one the card gets. */
export type PhotoBaseStep =
    | { type: 'flip' }
    | { type: 'rotate'; degrees: number }
    | { type: 'crop'; originX: number; originY: number; width: number; height: number }
    | { type: 'resize'; width: number; height: number };

/**
 * The steps that bake a geometry into the photo's pixels — mirror, turn, crop, then shrink to
 * `maxEdge` — in the order an image manipulator applies them, and the size that comes out.
 *
 * The crop is measured on the turned photo, which is the picture the manipulator holds by the
 * time it reaches that step.
 */
export function photoBaseSteps(
    source: PhotoSize,
    geometry: PhotoGeometry,
    maxEdge: number,
): { steps: PhotoBaseStep[]; size: PhotoSize } {
    const steps: PhotoBaseStep[] = [];
    if (geometry.flipped) steps.push({ type: 'flip' });
    if (geometry.quarterTurns) steps.push({ type: 'rotate', degrees: geometry.quarterTurns * 90 });
    const oriented = orientedPhotoSize(source, geometry.quarterTurns);
    let size = { width: Math.round(oriented.width), height: Math.round(oriented.height) };
    if (!isFullPhotoCrop(geometry.crop)) {
        const crop = photoCropPixels(geometry.crop, size);
        steps.push({ type: 'crop', ...crop });
        size = { width: crop.width, height: crop.height };
    }
    const longest = Math.max(size.width, size.height);
    if (maxEdge > 0 && longest > maxEdge) {
        const factor = maxEdge / longest;
        size = {
            width: Math.max(1, Math.round(size.width * factor)),
            height: Math.max(1, Math.round(size.height * factor)),
        };
        steps.push({ type: 'resize', ...size });
    }
    return { steps, size };
}

/**
 * A normalised crop in whole pixels of a picture of `size`, never reaching past its edge.
 * Unlike the photo editor's older crop helper it sets no minimum share of the picture: the crop
 * screen already keeps the frame large enough to hold.
 */
export function photoCropPixels(
    crop: PhotoCropRect,
    size: PhotoSize,
): { originX: number; originY: number; width: number; height: number } {
    const originX = Math.min(size.width - 1, Math.max(0, Math.round(crop.x * size.width)));
    const originY = Math.min(size.height - 1, Math.max(0, Math.round(crop.y * size.height)));
    return {
        originX,
        originY,
        width: Math.max(1, Math.min(size.width - originX, Math.round(crop.width * size.width))),
        height: Math.max(1, Math.min(size.height - originY, Math.round(crop.height * size.height))),
    };
}
