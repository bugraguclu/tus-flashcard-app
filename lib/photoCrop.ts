// The crop frame on the photo editor's crop screen: what a touch takes hold of, how a drag moves
// or reshapes the frame, and the shapes it can be locked to.
//
// Everything is measured on the canvas the whole turned photo is shown on. The canvas is the
// photo scaled evenly, so a ratio measured there is the ratio of the cropped pixels.

import type { PhotoCropRect, PhotoPoint } from './photoEditor';
import type { PhotoSize } from './photoGeometry';

export type PhotoCropHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move';

export type PhotoCropAspectId = 'free' | 'original' | 'square' | '4:3' | '3:4' | '16:9' | '9:16';

/** The shapes the frame can be locked to, in the order the crop screen offers them. */
export const PHOTO_CROP_ASPECTS: PhotoCropAspectId[] = ['free', 'original', 'square', '4:3', '3:4', '16:9', '9:16'];

/** How far from a corner or an edge, in canvas points, a touch still takes hold of it. */
export const PHOTO_CROP_HANDLE_REACH = 28;
/** The smallest side the frame may be dragged to, in canvas points, so it can still be held. */
export const PHOTO_CROP_MIN_EDGE = 36;

/** Width over height for a shape, in the turned photo's pixels; null when the frame is free. */
export function photoCropAspectRatio(id: PhotoCropAspectId, oriented: PhotoSize): number | null {
    switch (id) {
        case 'free': return null;
        case 'original': return oriented.width / Math.max(1, oriented.height);
        case 'square': return 1;
        case '4:3': return 4 / 3;
        case '3:4': return 3 / 4;
        case '16:9': return 16 / 9;
        case '9:16': return 9 / 16;
    }
}

/** The shape a locked frame takes after a quarter turn: a landscape lock becomes a portrait one. */
export function turnedPhotoCropAspect(id: PhotoCropAspectId): PhotoCropAspectId {
    switch (id) {
        case '4:3': return '3:4';
        case '3:4': return '4:3';
        case '16:9': return '9:16';
        case '9:16': return '16:9';
        default: return id;
    }
}

/**
 * The part of the frame under a finger at `point` (canvas points), or null for a touch that
 * reaches none of it. Corners win over edges and edges over the inside; on a small frame the
 * reach shrinks, so its middle can still be taken hold of to move it.
 */
export function photoCropHandleAt(
    point: PhotoPoint,
    crop: PhotoCropRect,
    canvas: PhotoSize,
    reach = PHOTO_CROP_HANDLE_REACH,
): PhotoCropHandle | null {
    const left = crop.x * canvas.width;
    const top = crop.y * canvas.height;
    const right = (crop.x + crop.width) * canvas.width;
    const bottom = (crop.y + crop.height) * canvas.height;
    const span = Math.min(right - left, bottom - top);
    const grip = Math.min(reach, Math.max(10, span / 3));

    const corners: [PhotoCropHandle, number, number][] = [
        ['tl', left, top],
        ['tr', right, top],
        ['bl', left, bottom],
        ['br', right, bottom],
    ];
    let nearest: PhotoCropHandle | null = null;
    let nearestDistance = Infinity;
    for (const [handle, x, y] of corners) {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= grip && distance < nearestDistance) {
            nearest = handle;
            nearestDistance = distance;
        }
    }
    if (nearest) return nearest;

    const withinX = point.x >= left - grip && point.x <= right + grip;
    const withinY = point.y >= top - grip && point.y <= bottom + grip;
    const edges: [PhotoCropHandle, number, boolean][] = [
        ['t', Math.abs(point.y - top), withinX],
        ['b', Math.abs(point.y - bottom), withinX],
        ['l', Math.abs(point.x - left), withinY],
        ['r', Math.abs(point.x - right), withinY],
    ];
    for (const [handle, distance, within] of edges) {
        if (within && distance <= grip && distance < nearestDistance) {
            nearest = handle;
            nearestDistance = distance;
        }
    }
    if (nearest) return nearest;

    if (point.x > left && point.x < right && point.y > top && point.y < bottom) return 'move';
    return null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The frame after a drag of `delta` canvas points on one of its handles.
 *
 * A free frame moves each dragged edge on its own. A locked frame keeps its shape: a corner
 * resizes it from the opposite corner, following the axis the finger has moved further along,
 * and an edge resizes it about its own middle. Either way it stops at the photo's edge and never gets
 * smaller than `minEdge` on its shorter side.
 */
export function dragPhotoCrop(input: {
    start: PhotoCropRect;
    handle: PhotoCropHandle;
    delta: PhotoPoint;
    /** Width over height to keep, or null for a free frame. */
    aspect: number | null;
    canvas: PhotoSize;
    minEdge?: number;
}): PhotoCropRect {
    const { start, handle, delta, aspect, canvas } = input;
    const width = canvas.width;
    const height = canvas.height;
    const minEdge = Math.min(input.minEdge ?? PHOTO_CROP_MIN_EDGE, width, height);
    let left = start.x * width;
    let top = start.y * height;
    let right = (start.x + start.width) * width;
    let bottom = (start.y + start.height) * height;

    if (handle === 'move') {
        const boxWidth = right - left;
        const boxHeight = bottom - top;
        left = clamp(left + delta.x, 0, width - boxWidth);
        top = clamp(top + delta.y, 0, height - boxHeight);
        return toCrop(left, top, left + boxWidth, top + boxHeight, canvas);
    }

    if (!aspect) {
        if (handle === 'tl' || handle === 'bl' || handle === 'l') left = clamp(left + delta.x, 0, right - minEdge);
        if (handle === 'tr' || handle === 'br' || handle === 'r') right = clamp(right + delta.x, left + minEdge, width);
        if (handle === 'tl' || handle === 'tr' || handle === 't') top = clamp(top + delta.y, 0, bottom - minEdge);
        if (handle === 'bl' || handle === 'br' || handle === 'b') bottom = clamp(bottom + delta.y, top + minEdge, height);
        return toCrop(left, top, right, bottom, canvas);
    }

    // The smallest locked frame whose shorter side is still `minEdge`.
    const minWidth = aspect >= 1 ? minEdge * aspect : minEdge;

    if (handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br') {
        const growsLeft = handle === 'tl' || handle === 'bl';
        const growsUp = handle === 'tl' || handle === 'tr';
        const anchorX = growsLeft ? right : left;
        const anchorY = growsUp ? bottom : top;
        const proposedWidth = growsLeft ? right - (left + delta.x) : right + delta.x - left;
        const proposedHeight = growsUp ? bottom - (top + delta.y) : bottom + delta.y - top;
        const roomX = growsLeft ? anchorX : width - anchorX;
        const roomY = growsUp ? anchorY : height - anchorY;
        const maxWidth = Math.min(roomX, roomY * aspect);
        // The axis the finger has moved further along decides, growing or shrinking alike.
        const startWidth = right - left;
        const byHeight = proposedHeight * aspect;
        const proposed = Math.abs(proposedWidth - startWidth) >= Math.abs(byHeight - startWidth) ? proposedWidth : byHeight;
        const boxWidth = clamp(proposed, Math.min(minWidth, maxWidth), maxWidth);
        const boxHeight = boxWidth / aspect;
        const newLeft = growsLeft ? anchorX - boxWidth : anchorX;
        const newTop = growsUp ? anchorY - boxHeight : anchorY;
        return toCrop(newLeft, newTop, newLeft + boxWidth, newTop + boxHeight, canvas);
    }

    if (handle === 'l' || handle === 'r') {
        const proposedWidth = handle === 'l' ? right - (left + delta.x) : right + delta.x - left;
        const maxWidth = Math.min(handle === 'l' ? right : width - left, height * aspect);
        const boxWidth = clamp(proposedWidth, Math.min(minWidth, maxWidth), maxWidth);
        const boxHeight = boxWidth / aspect;
        const middle = (top + bottom) / 2;
        const newTop = clamp(middle - boxHeight / 2, 0, height - boxHeight);
        const newLeft = handle === 'l' ? right - boxWidth : left;
        return toCrop(newLeft, newTop, newLeft + boxWidth, newTop + boxHeight, canvas);
    }

    const proposedHeight = handle === 't' ? bottom - (top + delta.y) : bottom + delta.y - top;
    const maxHeight = Math.min(handle === 't' ? bottom : height - top, width / aspect);
    const boxHeight = clamp(proposedHeight, Math.min(minWidth / aspect, maxHeight), maxHeight);
    const boxWidth = boxHeight * aspect;
    const centre = (left + right) / 2;
    const newLeft = clamp(centre - boxWidth / 2, 0, width - boxWidth);
    const newTop = handle === 't' ? bottom - boxHeight : top;
    return toCrop(newLeft, newTop, newLeft + boxWidth, newTop + boxHeight, canvas);
}

/**
 * The frame reshaped to a newly chosen ratio: the same area where it can be, centred where it
 * was, and shrunk only as far as the photo's edges make it.
 */
export function photoCropForAspect(crop: PhotoCropRect, aspect: number | null, canvas: PhotoSize): PhotoCropRect {
    if (!aspect || aspect <= 0) return crop;
    const width = canvas.width;
    const height = canvas.height;
    const centreX = (crop.x + crop.width / 2) * width;
    const centreY = (crop.y + crop.height / 2) * height;
    const area = crop.width * width * crop.height * height;
    let boxWidth = Math.sqrt(area * aspect);
    let boxHeight = boxWidth / aspect;
    const fit = Math.min(1, width / boxWidth, height / boxHeight);
    boxWidth *= fit;
    boxHeight *= fit;
    const left = clamp(centreX - boxWidth / 2, 0, width - boxWidth);
    const top = clamp(centreY - boxHeight / 2, 0, height - boxHeight);
    return toCrop(left, top, left + boxWidth, top + boxHeight, canvas);
}

function toCrop(left: number, top: number, right: number, bottom: number, canvas: PhotoSize): PhotoCropRect {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const x = clamp(left / width, 0, 1);
    const y = clamp(top / height, 0, 1);
    return {
        x,
        y,
        width: clamp((right - left) / width, 0, 1 - x),
        height: clamp((bottom - top) / height, 0, 1 - y),
    };
}
