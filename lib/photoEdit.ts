// One state of a photo in the photo editor — its geometry, its light and colour, and the markup on
// it — and the edits that change the geometry, each carrying the markup along.
//
// Markup is measured on the canvas the cropped photo is drawn on, and that canvas is the largest
// one the stage can hold (`fitDrawingPage`). So each edit that changes what the canvas shows also
// works out how many canvas points a photo pixel was worth before and after, and scales the marks
// by the difference: a line keeps its thickness on the photo whatever the crop or the turn.

import { fitDrawingPage, keepDrawingObjectOnPage } from './drawingPad';
import { calculatePhotoTextBounds, type PhotoAnnotation, type PhotoCropRect, type PhotoText } from './photoEditor';
import {
    FULL_PHOTO_CROP,
    IDENTITY_PHOTO_GEOMETRY,
    isIdentityPhotoGeometry,
    mirrorPhotoGeometry,
    orientedPhotoSize,
    photoCropSize,
    samePhotoCrop,
    turnPhotoGeometry,
    type PhotoGeometry,
    type PhotoSize,
    type PhotoTurnDirection,
} from './photoGeometry';
import { NEUTRAL_PHOTO_ADJUSTMENTS, isNeutralPhotoAdjustments, type PhotoAdjustments } from './photoAdjustments';
import {
    mirrorPhotoAnnotations,
    photoCanvasScale,
    reframePhotoAnnotations,
    turnPhotoAnnotations,
} from './photoMarkup';

export interface PhotoEdit {
    geometry: PhotoGeometry;
    adjustments: PhotoAdjustments;
    /** Markup on the canvas that shows the cropped photo. */
    annotations: PhotoAnnotation[];
}

export const INITIAL_PHOTO_EDIT: PhotoEdit = {
    geometry: IDENTITY_PHOTO_GEOMETRY,
    adjustments: NEUTRAL_PHOTO_ADJUSTMENTS,
    annotations: [],
};

/** True when saving would only give back the photo that was picked. */
export function isPhotoEditUntouched(edit: PhotoEdit): boolean {
    return isIdentityPhotoGeometry(edit.geometry)
        && isNeutralPhotoAdjustments(edit.adjustments)
        && edit.annotations.length === 0;
}

/**
 * The off-screen surface an edited photo is exported on, in points the device's pixel ratio turns
 * back into the baked photo's pixels, and the factor that takes the markup from the editing canvas
 * up to it.
 *
 * The surface is a whole number of points. A view a fraction of a point wide is captured a pixel
 * wider than it is drawn — the renderer rounds the image up — which leaves a blank line down one
 * edge and along another; a whole number of points moves the photo by a pixel at most instead.
 * Unlike a drawing page, a photo is never enlarged to a screen's worth of pixels when its crop is
 * smaller: that adds bytes, not detail.
 */
export function photoEditExportSurface(
    photo: PhotoSize,
    canvas: PhotoSize,
    pixelRatio: number,
): { width: number; height: number; scale: number } {
    const ratio = pixelRatio > 0 ? pixelRatio : 1;
    const width = Math.max(1, Math.round(photo.width / ratio));
    const height = Math.max(1, Math.round(photo.height / ratio));
    return { width, height, scale: width / Math.max(1, canvas.width) };
}

/**
 * Room left around the photo on every screen of the editor. The crop screen needs it so a grip on
 * the photo's edge is not cut off, and the adjust and draw screens use the same, so a photo that is
 * not cropped stays exactly where it was, at the same size, when the screen changes.
 */
export const PHOTO_STAGE_MARGIN = 24;

/** The canvas the cropped photo is drawn on, as large as the stage allows. */
export function photoEditCanvas(photo: PhotoSize, geometry: PhotoGeometry, stage: PhotoSize): PhotoSize {
    return fitDrawingPage(stage, photoCropSize(photo, geometry), PHOTO_STAGE_MARGIN);
}

/** The canvas the crop screen shows the whole photo on, turned as it is, with its crop frame. */
export function photoCropScreenCanvas(photo: PhotoSize, geometry: PhotoGeometry, stage: PhotoSize): PhotoSize {
    return fitDrawingPage(stage, orientedPhotoSize(photo, geometry.quarterTurns), PHOTO_STAGE_MARGIN);
}

/** Canvas points per photo pixel while `geometry` is on show. */
function viewScale(photo: PhotoSize, geometry: PhotoGeometry, stage: PhotoSize): number {
    return photoCanvasScale(photoEditCanvas(photo, geometry, stage).width, photoCropSize(photo, geometry).width);
}

/** The photo cropped to `crop`, the markup kept on the parts of the photo it was drawn on. */
export function cropPhotoEdit(edit: PhotoEdit, crop: PhotoCropRect, photo: PhotoSize, stage: PhotoSize): PhotoEdit {
    if (samePhotoCrop(crop, edit.geometry.crop)) return edit;
    const geometry = { ...edit.geometry, crop };
    const factor = viewScale(photo, geometry, stage) / viewScale(photo, edit.geometry, stage);
    return {
        ...edit,
        geometry,
        annotations: reframePhotoAnnotations(edit.annotations, edit.geometry.crop, crop, factor),
    };
}

/** Whether a label's whole box is on a canvas of this size. */
function labelOnCanvas(label: PhotoText, canvas: PhotoSize): boolean {
    const bounds = calculatePhotoTextBounds(label, canvas.width, canvas.height);
    return bounds.x >= -0.5
        && bounds.y >= -0.5
        && bounds.x + bounds.width <= canvas.width + 0.5
        && bounds.y + bounds.height <= canvas.height + 0.5;
}

/**
 * The photo turned a quarter, the crop and the markup turning with it.
 *
 * A label stays upright as the photo turns under it, so a wide label on a photo that now stands
 * tall can reach past the canvas. One that was wholly on the canvas before the turn is nudged
 * back onto it, the way a label dragged against an edge stops there.
 */
export function turnPhotoEdit(edit: PhotoEdit, direction: PhotoTurnDirection, photo: PhotoSize, stage: PhotoSize): PhotoEdit {
    const geometry = turnPhotoGeometry(edit.geometry, direction);
    const factor = viewScale(photo, geometry, stage) / viewScale(photo, edit.geometry, stage);
    const before = photoEditCanvas(photo, edit.geometry, stage);
    const after = photoEditCanvas(photo, geometry, stage);
    const turned = turnPhotoAnnotations(edit.annotations, direction, factor);
    const annotations = turned.map((annotation, index) => {
        const original = edit.annotations[index];
        if (annotation.type !== 'text' || original.type !== 'text' || !labelOnCanvas(original, before)) return annotation;
        return keepDrawingObjectOnPage(annotation, after);
    });
    return { ...edit, geometry, annotations };
}

/** The photo mirrored left to right. The canvas keeps its size, so the markup keeps its own. */
export function mirrorPhotoEdit(edit: PhotoEdit): PhotoEdit {
    return {
        ...edit,
        geometry: mirrorPhotoGeometry(edit.geometry),
        annotations: mirrorPhotoAnnotations(edit.annotations),
    };
}

/**
 * The whole photo again, upright and unmirrored, with the markup taken back to where it sits on
 * the photo as it was picked. Light, colour and the markup itself are kept.
 */
export function resetPhotoEditGeometry(edit: PhotoEdit, photo: PhotoSize, stage: PhotoSize): PhotoEdit {
    let next = cropPhotoEdit(edit, FULL_PHOTO_CROP, photo, stage);
    while (next.geometry.quarterTurns !== 0) next = turnPhotoEdit(next, 'ccw', photo, stage);
    if (next.geometry.flipped) next = mirrorPhotoEdit(next);
    return { ...next, geometry: IDENTITY_PHOTO_GEOMETRY };
}
