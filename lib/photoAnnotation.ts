/**
 * The annotations the drawing pad and the photo editor put on a page, and where each one sits:
 * a label's plate, colours and bounds, a picture's box, and the hit tests for both. Positions are
 * fractions of the page; sizes are canvas points. `lib/photoEditor.ts` builds the editing
 * operations (eraser, crop, export) on top of this module and re-exports it.
 */

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
