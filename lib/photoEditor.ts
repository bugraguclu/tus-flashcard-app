/**
 * Editing operations on a page's annotations: the eraser and its hit tests, arrow heads, the
 * crop frame, and the surface a drawing is exported at. The annotation model itself lives in
 * `lib/photoAnnotation.ts`, re-exported here so existing imports keep working.
 */

import {
    calculatePhotoTextBounds,
    normalizedRect,
    toPhotoTextLocalPixels,
    PHOTO_IMAGE_MIN_EDGE,
    type PhotoAnnotation,
    type PhotoImage,
    type PhotoPoint,
    type PhotoStroke,
    type PhotoText,
} from './photoAnnotation';

export {
    calculatePhotoTextBounds,
    clampPhotoPoint,
    isPointInPhotoImage,
    isPointInPhotoText,
    normalizedRect,
    normalizePhotoRotation,
    photoImageAnchorPixels,
    photoImageBounds,
    photoImagePlacement,
    photoTextAnchorPixels,
    photoTextColors,
    resolvePhotoTextAlign,
    toPhotoImageLocalPixels,
    toPhotoTextLocalPixels,
    PHOTO_IMAGE_MIN_EDGE,
} from './photoAnnotation';
export type {
    PhotoAnnotation,
    PhotoImage,
    PhotoPoint,
    PhotoRect,
    PhotoShape,
    PhotoStroke,
    PhotoText,
    PhotoTextAlign,
    PhotoTextBounds,
    PhotoTextColors,
    PhotoTextStyle,
} from './photoAnnotation';

export function pointToSegmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    const clampedT = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + clampedT * dx), py - (ay + clampedT * dy));
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number,
): boolean {
    return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy)
        && ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

export function segmentToSegmentDistance(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number,
): number {
    if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(
        pointToSegmentDistance(ax, ay, cx, cy, dx, dy),
        pointToSegmentDistance(bx, by, cx, cy, dx, dy),
        pointToSegmentDistance(cx, cy, ax, ay, bx, by),
        pointToSegmentDistance(dx, dy, ax, ay, bx, by),
    );
}

function isPointInTriangle(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
): boolean {
    const area = 0.5 * (-by * cx + ay * (-bx + cx) + ax * (by - cy) + bx * cy);
    if (Math.abs(area) < 1e-6) return false;
    const s = (1 / (2 * area)) * (ay * cx - ax * cy + (cy - ay) * px + (ax - cx) * py);
    const t = (1 / (2 * area)) * (ax * by - ay * bx + (ay - by) * px + (bx - ax) * py);
    return s >= 0 && t >= 0 && (1 - s - t) >= 0;
}

function distanceToRect(
    px: number, py: number,
    rx: number, ry: number, rw: number, rh: number,
    isFilled: boolean,
): number {
    const left = rx;
    const right = rx + rw;
    const top = ry;
    const bottom = ry + rh;

    if (isFilled) {
        const dx = Math.max(0, left - px, px - right);
        const dy = Math.max(0, top - py, py - bottom);
        return Math.hypot(dx, dy);
    }

    const dTop = pointToSegmentDistance(px, py, left, top, right, top);
    const dRight = pointToSegmentDistance(px, py, right, top, right, bottom);
    const dBottom = pointToSegmentDistance(px, py, right, bottom, left, bottom);
    const dLeft = pointToSegmentDistance(px, py, left, bottom, left, top);
    return Math.min(dTop, dRight, dBottom, dLeft);
}

function distanceToEllipse(
    px: number, py: number,
    cx: number, cy: number,
    rx: number, ry: number,
    isFilled = false,
): number {
    if (rx <= 0 || ry <= 0) return Math.hypot(px - cx, py - cy);
    const normDist = Math.hypot((px - cx) / rx, (py - cy) / ry);
    if (isFilled && normDist <= 1) return 0;
    const angle = Math.atan2((py - cy) * rx, (px - cx) * ry);
    const ex = cx + rx * Math.cos(angle);
    const ey = cy + ry * Math.sin(angle);
    return Math.hypot(px - ex, py - ey);
}

function distanceToText(
    px: number, py: number,
    annotation: PhotoText,
    width: number,
    height: number,
): number {
    const bounds = calculatePhotoTextBounds(annotation, width, height);
    const local = toPhotoTextLocalPixels(px, py, annotation, width, height);
    return distanceToRect(local.x, local.y, bounds.x, bounds.y, bounds.width, bounds.height, true);
}

/** The largest it may be grown to, as a multiple of the page: past this it is all off the sheet. */
export const PHOTO_IMAGE_MAX_COVERAGE = 3;

/**
 * The resize factor a picture is actually allowed to take, so pinching cannot shrink it into a
 * speck that is impossible to grab again or blow it up until every edge is off the page. The
 * factor is clamped rather than the box, which is what keeps the aspect ratio exact however far
 * the fingers travel.
 *
 * A limit only ever stops a resize; it never reverses one. A picture that is already past the
 * ceiling — one placed on a page that was later cropped down, say — simply stops growing, rather
 * than being snapped back to the ceiling by a press of the button that was asking it to grow.
 */
export function clampPhotoImageScale(
    annotation: PhotoImage,
    factor: number,
    canvas: { width: number; height: number },
): number {
    if (!Number.isFinite(factor) || factor <= 0) return 1;
    const width = Math.max(1, annotation.width || 1);
    const height = Math.max(1, annotation.height || 1);
    const minFactor = Math.max(PHOTO_IMAGE_MIN_EDGE / width, PHOTO_IMAGE_MIN_EDGE / height);
    const maxFactor = Math.min(
        (Math.max(1, canvas.width) * PHOTO_IMAGE_MAX_COVERAGE) / width,
        (Math.max(1, canvas.height) * PHOTO_IMAGE_MAX_COVERAGE) / height,
    );
    if (factor > 1) return Math.min(factor, Math.max(1, maxFactor));
    if (factor < 1) return Math.max(factor, Math.min(1, minFactor));
    return 1;
}

/** Resize a picture about its centre, keeping its aspect and staying inside the limits above. */
export function resizePhotoImage(
    annotation: PhotoImage,
    factor: number,
    canvas: { width: number; height: number },
): PhotoImage {
    const applied = clampPhotoImageScale(annotation, factor, canvas);
    if (applied === 1) return annotation;
    return {
        ...annotation,
        width: Math.max(1, annotation.width || 1) * applied,
        height: Math.max(1, annotation.height || 1) * applied,
    };
}

/** How far the finger must travel before a shape tool has drawn anything worth keeping. */
export const PHOTO_SHAPE_MIN_DRAG_PX = 6;

/**
 * Whether a shape drag ended far enough from where it started to be committed.
 *
 * A shape tool has no shape until the finger has actually travelled: `start` and `end` on the
 * same spot draw an arrowhead sitting on its own round line cap — a triangle with a dot beside
 * it — and a rectangle or ellipse of zero size. Releases that short are dropped instead.
 */
export function isPhotoShapeDragCommittable(
    start: PhotoPoint,
    end: PhotoPoint,
    canvasWidth: number,
    canvasHeight: number,
    minDragPx = PHOTO_SHAPE_MIN_DRAG_PX,
): boolean {
    const dx = (end.x - start.x) * canvasWidth;
    const dy = (end.y - start.y) * canvasHeight;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    return Math.hypot(dx, dy) >= minDragPx;
}

export function isAnnotationHitBySweep(
    annotation: PhotoAnnotation,
    startPoint: PhotoPoint,
    endPoint: PhotoPoint,
    width: number,
    height: number,
    tolerance = 24,
): boolean {
    const sx = startPoint.x * width;
    const sy = startPoint.y * height;
    const ex = endPoint.x * width;
    const ey = endPoint.y * height;
    const sweepLength = Math.hypot(ex - sx, ey - sy);
    const numSamples = Math.max(1, Math.ceil(sweepLength / Math.max(8, tolerance * 0.6)));

    // A picture is not ink. The eraser rubs out what was drawn, and a stroke made over a
    // picture sits on top of it, so a sweep across one has to reach that stroke and leave the
    // picture where it is. Pictures are removed by selecting them and using their own bin.
    if (annotation.type === 'image') return false;

    if (annotation.type === 'text') {
        for (let i = 0; i <= numSamples; i += 1) {
            const t = i / numSamples;
            const px = sx + t * (ex - sx);
            const py = sy + t * (ey - sy);
            if (distanceToText(px, py, annotation, width, height) <= tolerance) return true;
        }
        return false;
    }

    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        if (points.length === 0) return false;
        const threshold = tolerance + (annotation.width || 3) / 2;
        if (points.length === 1) {
            const p = points[0];
            return pointToSegmentDistance(p.x * width, p.y * height, sx, sy, ex, ey) <= threshold;
        }
        for (let i = 1; i < points.length; i += 1) {
            const pA = { x: points[i - 1].x * width, y: points[i - 1].y * height };
            const pB = { x: points[i].x * width, y: points[i].y * height };
            if (segmentToSegmentDistance(sx, sy, ex, ey, pA.x, pA.y, pB.x, pB.y) <= threshold) {
                return true;
            }
        }
        return false;
    }

    if (annotation.type === 'arrow') {
        const threshold = tolerance + (annotation.width || 3) / 2;
        const ax = annotation.start.x * width;
        const ay = annotation.start.y * height;
        const bx = annotation.end.x * width;
        const by = annotation.end.y * height;
        if (segmentToSegmentDistance(sx, sy, ex, ey, ax, ay, bx, by) <= threshold) {
            return true;
        }
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 14 + annotation.width * 1.5);
        for (let i = 0; i <= numSamples; i += 1) {
            const t = i / numSamples;
            const px = sx + t * (ex - sx);
            const py = sy + t * (ey - sy);
            if (isPointInTriangle(px, py, head[0].x, head[0].y, head[1].x, head[1].y, head[2].x, head[2].y)) {
                return true;
            }
        }
        for (let i = 0; i < 3; i += 1) {
            const nextIdx = (i + 1) % 3;
            if (segmentToSegmentDistance(sx, sy, ex, ey, head[i].x, head[i].y, head[nextIdx].x, head[nextIdx].y) <= threshold) {
                return true;
            }
        }
        return false;
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    const rx = rect.x * width;
    const ry = rect.y * height;
    const rw = rect.width * width;
    const rh = rect.height * height;

    if (annotation.type === 'cover') {
        for (let i = 0; i <= numSamples; i += 1) {
            const t = i / numSamples;
            const px = sx + t * (ex - sx);
            const py = sy + t * (ey - sy);
            if (distanceToRect(px, py, rx, ry, rw, rh, true) <= tolerance) return true;
        }
        return false;
    }

    if (annotation.type === 'rect') {
        const threshold = tolerance + (annotation.width || 3) / 2;
        const rLeft = rx;
        const rRight = rx + rw;
        const rTop = ry;
        const rBottom = ry + rh;
        if (segmentToSegmentDistance(sx, sy, ex, ey, rLeft, rTop, rRight, rTop) <= threshold
            || segmentToSegmentDistance(sx, sy, ex, ey, rRight, rTop, rRight, rBottom) <= threshold
            || segmentToSegmentDistance(sx, sy, ex, ey, rRight, rBottom, rLeft, rBottom) <= threshold
            || segmentToSegmentDistance(sx, sy, ex, ey, rLeft, rBottom, rLeft, rTop) <= threshold) {
            return true;
        }
        return false;
    }

    if (annotation.type === 'ellipse') {
        const threshold = tolerance + (annotation.width || 3) / 2;
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        const erx = rw / 2;
        const ery = rh / 2;
        for (let i = 0; i <= numSamples; i += 1) {
            const t = i / numSamples;
            const px = sx + t * (ex - sx);
            const py = sy + t * (ey - sy);
            if (distanceToEllipse(px, py, cx, cy, erx, ery, false) <= threshold) return true;
        }
        return false;
    }

    return false;
}

/**
 * How the eraser treats what it sweeps over.
 * `partial` cuts ink out of freehand strokes the way a real eraser does and only removes
 * shapes/labels as a whole (a vector rectangle cannot be half-erased); `object` wipes any
 * annotation it touches in one go.
 */
export type PhotoEraserMode = 'partial' | 'object';

/** Longest densified stroke a single erase pass will build, so a huge scribble stays responsive. */
const MAX_ERASE_SAMPLES = 1600;

function strokePiece(source: PhotoStroke, points: PhotoPoint[], index: number): PhotoStroke {
    return { ...source, id: `${source.id}~${index}`, points };
}

/**
 * Cut the part of a freehand stroke that an eraser sweep passed over and return the
 * surviving pieces. The stroke is densified first so a small eraser can bite a hole in the
 * middle of a long segment instead of skipping between the recorded sample points.
 */
export function erasePhotoStrokeBySweep(
    stroke: PhotoStroke,
    startPoint: PhotoPoint,
    endPoint: PhotoPoint,
    width: number,
    height: number,
    radius: number,
): PhotoStroke[] {
    const points = Array.isArray(stroke.points) ? stroke.points : [];
    if (points.length === 0) return [];

    const threshold = radius + (stroke.width || 3) / 2;
    const sx = startPoint.x * width;
    const sy = startPoint.y * height;
    const ex = endPoint.x * width;
    const ey = endPoint.y * height;
    const isErased = (point: PhotoPoint) =>
        pointToSegmentDistance(point.x * width, point.y * height, sx, sy, ex, ey) <= threshold;

    if (points.length === 1) return isErased(points[0]) ? [] : [stroke];

    const step = Math.max(2, threshold / 2);
    const dense: PhotoPoint[] = [points[0]];
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        // Once the sample budget is spent the rest of the stroke is carried through at its
        // recorded resolution rather than abandoned: a huge scribble stays responsive, and ink
        // the sweep never reached is never silently dropped.
        if (dense.length >= MAX_ERASE_SAMPLES) {
            dense.push(to);
            continue;
        }
        const distance = Math.hypot((to.x - from.x) * width, (to.y - from.y) * height);
        const segments = Math.min(32, Math.max(1, Math.ceil(distance / step)));
        for (let sample = 1; sample <= segments; sample += 1) {
            const t = sample / segments;
            dense.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
        }
    }

    const pieces: PhotoStroke[] = [];
    let current: PhotoPoint[] = [];
    let erasedAny = false;
    for (const point of dense) {
        if (isErased(point)) {
            erasedAny = true;
            if (current.length >= 2) pieces.push(strokePiece(stroke, current, pieces.length));
            current = [];
        } else {
            current.push(point);
        }
    }
    if (current.length >= 2) pieces.push(strokePiece(stroke, current, pieces.length));

    if (!erasedAny) return [stroke];
    return pieces;
}

/**
 * Apply one eraser sweep to the whole annotation list.
 * Returns the same array instance when nothing was touched so callers can skip a re-render
 * and avoid pushing an empty step onto the undo stack.
 */
export function applyPhotoEraserSweep(
    annotations: PhotoAnnotation[],
    startPoint: PhotoPoint,
    endPoint: PhotoPoint,
    width: number,
    height: number,
    radius: number,
    mode: PhotoEraserMode = 'partial',
): { annotations: PhotoAnnotation[]; changed: boolean } {
    const next: PhotoAnnotation[] = [];
    let changed = false;

    for (const annotation of annotations) {
        const hit = isAnnotationHitBySweep(annotation, startPoint, endPoint, width, height, radius);
        if (!hit) {
            next.push(annotation);
            continue;
        }
        if (mode === 'object' || annotation.type !== 'stroke') {
            changed = true;
            continue;
        }
        const pieces = erasePhotoStrokeBySweep(annotation, startPoint, endPoint, width, height, radius);
        if (pieces.length === 1 && pieces[0] === annotation) {
            next.push(annotation);
            continue;
        }
        changed = true;
        next.push(...pieces);
    }

    return changed ? { annotations: next, changed } : { annotations, changed: false };
}

export function photoArrowHead(
    start: PhotoPoint,
    end: PhotoPoint,
    width: number,
    height: number,
    size: number,
): [PhotoPoint, PhotoPoint, PhotoPoint] {
    const sx = start.x * width;
    const sy = start.y * height;
    const ex = end.x * width;
    const ey = end.y * height;
    const angle = Math.atan2(ey - sy, ex - sx);
    const wing = Math.PI / 6;
    return [
        { x: ex, y: ey },
        { x: ex - size * Math.cos(angle - wing), y: ey - size * Math.sin(angle - wing) },
        { x: ex - size * Math.cos(angle + wing), y: ey - size * Math.sin(angle + wing) },
    ];
}

export type PhotoCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** Clamp a normalized crop rectangle within image boundaries [0, 1]. */
export function clampCropRect(rect: PhotoCropRect, minSize = 0.05): PhotoCropRect {
    const minW = Math.min(1, Math.max(0.01, minSize));
    const minH = Math.min(1, Math.max(0.01, minSize));
    const width = Math.max(minW, Math.min(1, rect.width));
    const height = Math.max(minH, Math.min(1, rect.height));
    const x = Math.max(0, Math.min(1 - width, rect.x));
    const y = Math.max(0, Math.min(1 - height, rect.y));
    return { x, y, width, height };
}

/**
 * The surface an export is rendered on, and how much bigger it is than the surface the drawing
 * was made on.
 *
 * The native exporter photographs a real view rather than replaying the drawing into a bitmap, so
 * whatever it photographs is the resolution the card gets. Photographing the on-screen canvas ties
 * the exported PNG to the phone: a page created at 1600×1200 comes out at whatever the stage
 * happened to measure, and a 12-megapixel photo is thrown away down to a screen's worth of pixels
 * the moment a single arrow is drawn on it. So the export is rendered on its own off-screen
 * surface, sized in points such that the device's pixel ratio turns it back into the resolution
 * the drawing actually claims.
 *
 * `scale` is the factor between that surface and the on-screen canvas. Stroke widths and font
 * sizes are stored in the units of the canvas they were drawn on, so they have to be multiplied
 * by it — otherwise a four-times-larger export would draw every line four times thinner.
 */
export function photoExportSurface(input: {
    /** The drawing's own resolution: the photo's pixels, or the page's declared size. */
    source: { width: number; height: number };
    /** The on-screen canvas the annotations were drawn on, in points. */
    canvas: { width: number; height: number };
    /** Device pixels per point. */
    pixelRatio: number;
    /** Longest edge the export may reach, in pixels. */
    maxDimension?: number;
}): { width: number; height: number; scale: number } {
    const { source, canvas, pixelRatio, maxDimension = 2000 } = input;
    const canvasWidth = Math.max(1, canvas.width);
    const ratio = source.width > 0 && source.height > 0
        ? source.width / source.height
        : canvasWidth / Math.max(1, canvas.height);

    const longestSourceEdge = Math.max(source.width, source.height);
    const cap = longestSourceEdge > 0 && maxDimension > 0
        ? Math.min(1, maxDimension / longestSourceEdge)
        : 1;
    const targetPixelWidth = source.width * cap;
    const usablePixelRatio = pixelRatio > 0 ? pixelRatio : 1;

    // Never smaller than what photographing the visible canvas would already have given.
    const width = Math.max(canvasWidth, targetPixelWidth / usablePixelRatio);
    return {
        width: Math.round(width),
        height: Math.max(1, Math.round(width / (ratio > 0 ? ratio : 1))),
        scale: Math.round(width) / canvasWidth,
    };
}

/**
 * The same annotation measured for a surface `factor` times the size of the one it was drawn on.
 *
 * Positions are stored normalised and need no help, but a stroke's width and a label's font size
 * are in the drawing surface's own units. Rendering those unchanged on a larger surface is what
 * makes an exported drawing look thinner and smaller-lettered than the one on screen.
 */
export function scalePhotoAnnotation<T extends PhotoAnnotation>(annotation: T, factor: number): T {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return annotation;
    const scaled: PhotoAnnotation = { ...annotation };
    if (typeof scaled.width === 'number') scaled.width *= factor;
    if (scaled.type === 'text' && typeof scaled.fontSize === 'number') scaled.fontSize *= factor;
    // A picture's box is stored as `width` and this height together; scaling one without the
    // other would export it stretched.
    if (scaled.type === 'image' && typeof scaled.height === 'number') scaled.height *= factor;
    return scaled as T;
}
