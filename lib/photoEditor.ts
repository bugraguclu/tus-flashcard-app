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

/**
 * How a label is set off from what is under it. `plain` is ink on paper: no plate and no halo,
 * for the blank drawing page, where there is no photo to read the words against.
 */
export type PhotoTextStyle = 'classic' | 'badge' | 'frosted' | 'outline' | 'plain';
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

/**
 * A picture placed on the page.
 *
 * Unlike the page's own source bitmap, this one is an annotation: it is carried through undo,
 * crop and rotation with everything else the learner put on the sheet, and it is baked into the
 * export rather than kept as a file of its own. Only the reference is stored, so the picture has
 * to stay readable at `uri` for as long as the editor is open.
 */
export type PhotoImage = AnnotationBase & {
    type: 'image';
    /** Where the picture's bytes are: a picker or camera URI, read again at export time. */
    uri: string;
    /** Centre of the picture on the page, normalized. Rotation turns it around this point. */
    point: PhotoPoint;
    /**
     * The box the picture is drawn in, in the units of the surface it was placed on.
     * `AnnotationBase.width` carries the other half of it, which is why `scalePhotoAnnotation`
     * already takes the picture up to an export surface — the height only has to follow.
     */
    height: number;
    /** Clockwise rotation in degrees around the centre. */
    rotation?: number;
};

export type PhotoAnnotation = PhotoStroke | PhotoShape | PhotoText | PhotoImage;

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

    const isPill = textAnnotation.bgStyle && textAnnotation.bgStyle !== 'classic' && textAnnotation.bgStyle !== 'plain';
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
 * Turn a canvas pixel around an anchor, the way an annotation's own twist turns everything laid
 * out from it. Labels and pictures are both drawn upright and then twisted around their anchor,
 * so a corner's real place on the canvas is its upright place put through this.
 */
function rotateAroundAnchor(
    px: number,
    py: number,
    anchor: { x: number; y: number },
    rotation: number,
): { x: number; y: number } {
    if (!rotation) return { x: px, y: py };
    const radians = (rotation * Math.PI) / 180;
    const dx = px - anchor.x;
    const dy = py - anchor.y;
    return {
        x: anchor.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: anchor.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
}

/**
 * That turn undone: a canvas pixel mapped back into the frame the annotation was laid out in,
 * so hit tests and eraser sweeps stay accurate once the user has twisted something.
 */
function unrotateAroundAnchor(
    px: number,
    py: number,
    anchor: { x: number; y: number },
    rotation: number,
): { x: number; y: number } {
    return rotateAroundAnchor(px, py, anchor, -rotation);
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
    return unrotateAroundAnchor(
        px,
        py,
        photoTextAnchorPixels(textAnnotation, canvasWidth, canvasHeight),
        textAnnotation.rotation ?? 0,
    );
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

export type PhotoRect = { x: number; y: number; width: number; height: number };

/** The smallest a placed picture may be shrunk to, in canvas points, so it stays grabbable. */
export const PHOTO_IMAGE_MIN_EDGE = 40;
/** The largest it may be grown to, as a multiple of the page: past this it is all off the sheet. */
export const PHOTO_IMAGE_MAX_COVERAGE = 3;

/** Centre of a placed picture in canvas pixels — the point it is positioned and turned around. */
export function photoImageAnchorPixels(
    annotation: PhotoImage,
    canvasWidth: number,
    canvasHeight: number,
): { x: number; y: number } {
    const point = annotation.point ?? { x: 0.5, y: 0.5 };
    return { x: point.x * canvasWidth, y: point.y * canvasHeight };
}

/**
 * The box a picture is drawn in, before its rotation is applied — which is exactly how it is
 * rendered: laid out upright around its centre, then turned. The editor paints from these
 * numbers and hit-tests against them, so the frame the finger sees is the frame it grabs.
 */
export function photoImageBounds(
    annotation: PhotoImage,
    canvasWidth: number,
    canvasHeight: number,
): PhotoRect {
    const anchor = photoImageAnchorPixels(annotation, canvasWidth, canvasHeight);
    const width = Math.max(1, annotation.width || 1);
    const height = Math.max(1, annotation.height || 1);
    return { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height };
}

/** Map a canvas pixel into a picture's own (unrotated) frame. */
export function toPhotoImageLocalPixels(
    px: number,
    py: number,
    annotation: PhotoImage,
    canvasWidth: number,
    canvasHeight: number,
): { x: number; y: number } {
    return unrotateAroundAnchor(
        px,
        py,
        photoImageAnchorPixels(annotation, canvasWidth, canvasHeight),
        annotation.rotation ?? 0,
    );
}

/** Whether a normalized pointer lands on a placed picture, with a fingertip's allowance. */
export function isPointInPhotoImage(
    annotation: PhotoImage,
    point: PhotoPoint,
    canvasWidth: number,
    canvasHeight: number,
    tolerance = 12,
): boolean {
    const bounds = photoImageBounds(annotation, canvasWidth, canvasHeight);
    const local = toPhotoImageLocalPixels(
        point.x * canvasWidth,
        point.y * canvasHeight,
        annotation,
        canvasWidth,
        canvasHeight,
    );
    return local.x >= bounds.x - tolerance
        && local.x <= bounds.x + bounds.width + tolerance
        && local.y >= bounds.y - tolerance
        && local.y <= bounds.y + bounds.height + tolerance;
}

/**
 * The box a freshly added picture is dropped into, in canvas points.
 *
 * It arrives at its own aspect ratio, large enough to work on and small enough that the page it
 * was added to is still visible around it — a picture that filled the sheet edge to edge would
 * leave nothing to draw on and no margin to grab it by.
 */
export function photoImagePlacement(input: {
    /** The picture's own pixel size; a picker that reports nothing falls back to a square. */
    source: { width?: number | null; height?: number | null };
    /** The surface it is being dropped onto, in points. */
    canvas: { width: number; height: number };
    /** Fraction of the page the picture may take up along either edge. */
    coverage?: number;
}): { width: number; height: number } {
    const rawCoverage = input.coverage ?? 0.62;
    const coverage = Math.min(1, Math.max(0.05, Number.isFinite(rawCoverage) ? rawCoverage : 0.62));
    const sourceWidth = Number(input.source?.width) || 0;
    const sourceHeight = Number(input.source?.height) || 0;
    const aspect = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
    const canvasWidth = Math.max(1, input.canvas.width);
    const canvasHeight = Math.max(1, input.canvas.height);

    let width = canvasWidth * coverage;
    let height = width / aspect;
    const maxHeight = canvasHeight * coverage;
    if (height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
    }
    return {
        width: Math.max(PHOTO_IMAGE_MIN_EDGE, width),
        height: Math.max(PHOTO_IMAGE_MIN_EDGE, height),
    };
}

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
