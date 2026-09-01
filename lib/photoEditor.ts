export type PhotoPoint = { x: number; y: number };

type AnnotationBase = {
    id: string;
    color: string;
    width: number;
    opacity: number;
};

export type PhotoStroke = AnnotationBase & {
    type: 'stroke';
    points: PhotoPoint[];
};

export type PhotoShape = AnnotationBase & {
    type: 'arrow' | 'rect' | 'ellipse' | 'cover';
    start: PhotoPoint;
    end: PhotoPoint;
};

export type PhotoTextStyle = 'classic' | 'badge' | 'frosted' | 'outline';
export type PhotoTextAlign = 'left' | 'center' | 'right';

export type PhotoText = AnnotationBase & {
    type: 'text';
    point: PhotoPoint;
    text: string;
    fontSize: number;
    bgStyle?: PhotoTextStyle;
    textAlign?: PhotoTextAlign;
    bgColor?: string;
    /** Clockwise rotation in degrees around the anchor point. */
    rotation?: number;
};

export type PhotoAnnotation = PhotoStroke | PhotoShape | PhotoText;

export type PhotoTextBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
    lines: string[];
    lineHeight: number;
    paddingX: number;
    paddingY: number;
};

/**
 * Where a label sits relative to its anchor. An explicit choice wins; otherwise the label leans
 * away from the nearest edge so a caption dropped near the frame stays inside the picture.
 */
export function resolvePhotoTextAlign(textAnnotation: PhotoText): PhotoTextAlign {
    if (textAnnotation.textAlign) return textAnnotation.textAlign;
    const x = textAnnotation.point?.x ?? 0.5;
    return x > 0.65 ? 'right' : x < 0.35 ? 'left' : 'center';
}

/**
 * Ink colours that read as light against a photo, so a badge or frosted plate behind them has to
 * flip to a dark fill (and the label itself to dark text) to stay legible.
 */
const LIGHT_PHOTO_TEXT_COLORS = ['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'];

export type PhotoTextColors = {
    /** Fill behind the label for every style except `classic`. */
    background: string;
    /** Colour the glyphs are painted in once the backing plate is accounted for. */
    text: string;
};

/**
 * Resolve the plate and glyph colours for a text annotation.
 *
 * The on-screen SVG preview and the canvas that bakes the annotations into the exported image
 * both need these, and a label whose export does not match its preview is worse than one that is
 * merely ugly, so the two renderers share this single resolution.
 */
export function photoTextColors(textAnnotation: PhotoText): PhotoTextColors {
    const textColor = textAnnotation.color || '#ffffff';
    const bgStyle = textAnnotation.bgStyle || 'classic';
    const isLight = LIGHT_PHOTO_TEXT_COLORS.includes(textColor);

    const background = textAnnotation.bgColor || (
        bgStyle === 'badge'
            ? (textColor === '#ffffff' ? '#111827' : textColor)
            : (isLight ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.85)')
    );

    // A badge paints the ink colour itself as the plate, so the glyphs take the opposite side:
    // white ink keeps its dark plate and stays white, any other light ink turns dark on its own
    // colour, and dark ink is reversed out in white.
    const text = bgStyle === 'badge'
        ? (textColor !== '#ffffff' && isLight ? '#111827' : '#ffffff')
        : (bgStyle === 'frosted' ? (isLight ? '#ffffff' : '#111827') : textColor);

    return { background, text };
}

/** Calculates display bounding box and layout metrics for a text annotation. */
export function calculatePhotoTextBounds(
    textAnnotation: PhotoText,
    canvasWidth: number,
    canvasHeight: number,
): PhotoTextBounds {
    const rawLines = textAnnotation.text.split('\n');
    const lines = rawLines.length > 0 ? rawLines : [' '];
    const fontSize = textAnnotation.fontSize;
    const lineHeight = fontSize * 1.25;

    let maxLineWidth = 0;
    lines.forEach((line) => {
        const estWidth = Math.max(20, line.length * fontSize * 0.58);
        if (estWidth > maxLineWidth) maxLineWidth = estWidth;
    });

    const isPill = textAnnotation.bgStyle && textAnnotation.bgStyle !== 'classic';
    const paddingX = isPill ? Math.max(12, fontSize * 0.4) : 6;
    const paddingY = isPill ? Math.max(6, fontSize * 0.25) : 3;

    const totalWidth = maxLineWidth + paddingX * 2;
    const totalHeight = lines.length * lineHeight + paddingY * 2;

    const anchorX = textAnnotation.point.x * canvasWidth;
    const anchorY = textAnnotation.point.y * canvasHeight;

    const align = resolvePhotoTextAlign(textAnnotation);

    let left = anchorX - totalWidth / 2;
    if (align === 'left') {
        left = anchorX - paddingX;
    } else if (align === 'right') {
        left = anchorX - totalWidth + paddingX;
    }

    const top = anchorY - totalHeight / 2;

    return {
        x: left,
        y: top,
        width: totalWidth,
        height: totalHeight,
        lines,
        lineHeight,
        paddingX,
        paddingY,
    };
}

/** Pixel position of the anchor a text annotation is placed and rotated around. */
export function photoTextAnchorPixels(
    textAnnotation: PhotoText,
    canvasWidth: number,
    canvasHeight: number,
): { x: number; y: number } {
    const point = textAnnotation.point ?? { x: 0.5, y: 0.5 };
    return { x: point.x * canvasWidth, y: point.y * canvasHeight };
}

/**
 * Map a canvas pixel into the text's own (unrotated) frame, so hit tests and eraser
 * sweeps stay accurate once the user has twisted a label.
 */
export function toPhotoTextLocalPixels(
    px: number,
    py: number,
    textAnnotation: PhotoText,
    canvasWidth: number,
    canvasHeight: number,
): { x: number; y: number } {
    const rotation = textAnnotation.rotation ?? 0;
    if (!rotation) return { x: px, y: py };
    const anchor = photoTextAnchorPixels(textAnnotation, canvasWidth, canvasHeight);
    const radians = (-rotation * Math.PI) / 180;
    const dx = px - anchor.x;
    const dy = py - anchor.y;
    return {
        x: anchor.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: anchor.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
}

/** Keep a rotation angle inside [0, 360) so stored values never drift unbounded. */
export function normalizePhotoRotation(degrees: number): number {
    if (!Number.isFinite(degrees)) return 0;
    const wrapped = degrees % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function clampPhotoPoint(point: PhotoPoint): PhotoPoint {
    return {
        x: Math.min(1, Math.max(0, point.x)),
        y: Math.min(1, Math.max(0, point.y)),
    };
}

/** Rotate a normalized point 90 degrees clockwise together with its source image. */
export function rotatePhotoPointClockwise(point: PhotoPoint): PhotoPoint {
    return { x: 1 - point.y, y: point.x };
}

/** Keep annotations attached to the same image feature after a 90-degree rotation. */
export function rotatePhotoAnnotationClockwise(annotation: PhotoAnnotation): PhotoAnnotation {
    if (!annotation) return annotation;
    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        return { ...annotation, points: points.map(rotatePhotoPointClockwise) };
    }
    if (annotation.type === 'text') {
        const point = annotation.point ? rotatePhotoPointClockwise(annotation.point) : { x: 0.5, y: 0.5 };
        return { ...annotation, point, rotation: normalizePhotoRotation((annotation.rotation ?? 0) + 90) };
    }
    const start = annotation.start ? rotatePhotoPointClockwise(annotation.start) : { x: 0, y: 0 };
    const end = annotation.end ? rotatePhotoPointClockwise(annotation.end) : { x: 1, y: 1 };
    return {
        ...annotation,
        start,
        end,
    };
}

export function normalizedRect(start: PhotoPoint, end: PhotoPoint) {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

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

/** Check if a point hits a text annotation with optional padding/tolerance. */
export function isPointInPhotoText(
    annotation: PhotoText,
    point: PhotoPoint,
    canvasWidth: number,
    canvasHeight: number,
    tolerance = 16,
): boolean {
    const bounds = calculatePhotoTextBounds(annotation, canvasWidth, canvasHeight);
    const { x: px, y: py } = toPhotoTextLocalPixels(
        point.x * canvasWidth,
        point.y * canvasHeight,
        annotation,
        canvasWidth,
        canvasHeight,
    );
    return px >= bounds.x - tolerance
        && px <= bounds.x + bounds.width + tolerance
        && py >= bounds.y - tolerance
        && py <= bounds.y + bounds.height + tolerance;
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

export function findPhotoAnnotationsInSweep(
    annotations: PhotoAnnotation[],
    startPoint: PhotoPoint,
    endPoint: PhotoPoint,
    width: number,
    height: number,
    tolerance = 24,
): number[] {
    const hits: number[] = [];
    for (let index = 0; index < annotations.length; index += 1) {
        if (isAnnotationHitBySweep(annotations[index], startPoint, endPoint, width, height, tolerance)) {
            hits.push(index);
        }
    }
    return hits;
}

/**
 * Find the visually top-most annotation near a tap or point.
 */
export function findPhotoAnnotationAtPoint(
    annotations: PhotoAnnotation[],
    point: PhotoPoint,
    width: number,
    height: number,
    tolerance = 24,
): number {
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
        if (isAnnotationHitBySweep(annotations[index], point, point, width, height, tolerance)) {
            return index;
        }
    }
    return -1;
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

/** Convert normalized crop box to source image pixel crop parameters. */
export function calculateSourceCropPixels(
    cropRect: PhotoCropRect,
    sourceWidth: number,
    sourceHeight: number,
): { originX: number; originY: number; width: number; height: number } {
    const clamped = clampCropRect(cropRect);
    const originX = Math.min(sourceWidth - 1, Math.max(0, Math.round(clamped.x * sourceWidth)));
    const originY = Math.min(sourceHeight - 1, Math.max(0, Math.round(clamped.y * sourceHeight)));
    const maxW = sourceWidth - originX;
    const maxH = sourceHeight - originY;
    const width = Math.max(1, Math.min(maxW, Math.round(clamped.width * sourceWidth)));
    const height = Math.max(1, Math.min(maxH, Math.round(clamped.height * sourceHeight)));
    return { originX, originY, width, height };
}

/** Transform a normalized coordinate into the cropped image coordinate frame. */
export function cropPhotoPoint(point: PhotoPoint, cropRect: PhotoCropRect): PhotoPoint {
    const clamped = clampCropRect(cropRect);
    const rawX = (point.x - clamped.x) / clamped.width;
    const rawY = (point.y - clamped.y) / clamped.height;
    const roundedX = Math.abs(rawX - Math.round(rawX)) < 1e-9 ? Math.round(rawX) : rawX;
    const roundedY = Math.abs(rawY - Math.round(rawY)) < 1e-9 ? Math.round(rawY) : rawY;
    return {
        x: Math.min(1, Math.max(0, roundedX)),
        y: Math.min(1, Math.max(0, roundedY)),
    };
}

/** Transform annotations to match the newly cropped image bounds. */
export function cropPhotoAnnotation(annotation: PhotoAnnotation, cropRect: PhotoCropRect): PhotoAnnotation {
    if (!annotation) return annotation;
    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        return {
            ...annotation,
            points: points.map((pt) => cropPhotoPoint(pt, cropRect)),
        };
    }
    if (annotation.type === 'text') {
        const point = annotation.point ? cropPhotoPoint(annotation.point, cropRect) : { x: 0.5, y: 0.5 };
        return {
            ...annotation,
            point,
        };
    }
    const start = annotation.start ? cropPhotoPoint(annotation.start, cropRect) : { x: 0, y: 0 };
    const end = annotation.end ? cropPhotoPoint(annotation.end, cropRect) : { x: 1, y: 1 };
    return {
        ...annotation,
        start,
        end,
    };
}

/**
 * Adjust a normalized crop rectangle to match a target physical aspect ratio (width / height).
 */
export function applyAspectRatioToCropRect(
    cropRect: PhotoCropRect,
    targetAspect: number,
    sourceWidth: number,
    sourceHeight: number,
): PhotoCropRect {
    if (!targetAspect || targetAspect <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
        return clampCropRect(cropRect);
    }
    const sourceAspect = sourceWidth / sourceHeight;
    const desiredNormAspect = targetAspect / sourceAspect; // widthNorm / heightNorm

    const centerX = cropRect.x + cropRect.width / 2;
    const centerY = cropRect.y + cropRect.height / 2;

    let nextWidth = cropRect.width;
    let nextHeight = nextWidth / desiredNormAspect;

    if (nextHeight > 1) {
        nextHeight = 1;
        nextWidth = nextHeight * desiredNormAspect;
    }
    if (nextWidth > 1) {
        nextWidth = 1;
        nextHeight = nextWidth / desiredNormAspect;
    }

    let nextX = centerX - nextWidth / 2;
    let nextY = centerY - nextHeight / 2;

    if (nextX < 0) nextX = 0;
    if (nextX + nextWidth > 1) nextX = 1 - nextWidth;
    if (nextY < 0) nextY = 0;
    if (nextY + nextHeight > 1) nextY = 1 - nextHeight;

    return clampCropRect({ x: nextX, y: nextY, width: nextWidth, height: nextHeight });
}
