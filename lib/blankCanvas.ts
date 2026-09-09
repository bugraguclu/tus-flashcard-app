// Page description for the blank drawing surface. The editor draws the page itself — there is
// no source bitmap — so both the on-screen preview and the PNG export ask these helpers for the
// same geometry at their own resolution.

export type BlankCanvasPaper = 'plain' | 'grid' | 'lined' | 'dotted';
export type BlankCanvasShape = 'landscape' | 'square' | 'portrait';

export type BlankCanvasPage = {
    /** Page colour behind everything the user draws. */
    background: string;
    paper: BlankCanvasPaper;
    /** Export resolution in pixels; the preview only borrows its aspect ratio. */
    width: number;
    height: number;
    /**
     * Where the ruling sits on this sheet. A fresh page leaves it out and takes the default;
     * a page that has been cropped or turned carries the ruling it had before the edit.
     */
    ruling?: BlankCanvasRuling;
};

/**
 * The ruling as a printed sheet has it: one spacing, and a phase saying where the first line
 * falls. Both are in the page's own export pixels, so a crop can move the phase without the
 * squares changing size, which is what keeps writing sitting on the lines it was written on.
 */
export type BlankCanvasRuling = {
    /** Distance between two lines, in page pixels. */
    spacing: number;
    /** Position of the first vertical line, in [0, spacing). */
    offsetX: number;
    /** Position of the first horizontal line, in [0, spacing). */
    offsetY: number;
    /** Lined paper only: which way the rules run. Turning the page flips it. */
    orientation: BlankCanvasRulingOrientation;
};

export type BlankCanvasRulingOrientation = 'horizontal' | 'vertical';

export const BLANK_CANVAS_SHAPES: { id: BlankCanvasShape; width: number; height: number }[] = [
    { id: 'landscape', width: 1600, height: 1200 },
    { id: 'square', width: 1400, height: 1400 },
    { id: 'portrait', width: 1200, height: 1600 },
];

export const BLANK_CANVAS_BACKGROUNDS: { id: string; color: string }[] = [
    { id: 'white', color: '#ffffff' },
    { id: 'cream', color: '#fbf5e6' },
    { id: 'slate', color: '#1b2a24' },
];

export const BLANK_CANVAS_PAPERS: BlankCanvasPaper[] = ['plain', 'grid', 'lined', 'dotted'];

export const DEFAULT_BLANK_CANVAS_PAGE: BlankCanvasPage = {
    background: BLANK_CANVAS_BACKGROUNDS[0].color,
    paper: 'plain',
    width: BLANK_CANVAS_SHAPES[0].width,
    height: BLANK_CANVAS_SHAPES[0].height,
};

export type BlankCanvasLine = { x1: number; y1: number; x2: number; y2: number };
export type BlankCanvasDot = { x: number; y: number };
export type BlankCanvasPaperGeometry = {
    lines: BlankCanvasLine[];
    dots: BlankCanvasDot[];
    spacing: number;
};

/** Squares across the shorter edge, so a page rules the same way at any resolution. */
const PAPER_DIVISIONS = 16;
/** Below this the ruling turns into a solid tint, so degenerate sizes stop subdividing. */
const MIN_PAPER_SPACING = 8;

export function blankCanvasPaperSpacing(width: number, height: number): number {
    const shortEdge = Math.min(width, height);
    if (!Number.isFinite(shortEdge) || shortEdge <= 0) return 0;
    return Math.max(MIN_PAPER_SPACING, shortEdge / PAPER_DIVISIONS);
}

/** Fold a phase back into [0, spacing) so a shifted ruling stays on the same grid. */
function wrapPhase(value: number, spacing: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(spacing) || spacing <= 0) return 0;
    return ((value % spacing) + spacing) % spacing;
}

/** The ruling a freshly created page of this size starts with. */
export function defaultBlankCanvasRuling(width: number, height: number): BlankCanvasRuling {
    return {
        spacing: blankCanvasPaperSpacing(width, height),
        offsetX: 0,
        offsetY: 0,
        orientation: 'horizontal',
    };
}

/** Accept a stored/partial ruling, or fall back to the size's default. */
export function resolveBlankCanvasRuling(
    ruling: BlankCanvasRuling | null | undefined,
    width: number,
    height: number,
): BlankCanvasRuling {
    if (!ruling || !Number.isFinite(ruling.spacing) || ruling.spacing <= 0) {
        return defaultBlankCanvasRuling(width, height);
    }
    return {
        spacing: ruling.spacing,
        offsetX: wrapPhase(ruling.offsetX, ruling.spacing),
        offsetY: wrapPhase(ruling.offsetY, ruling.spacing),
        orientation: ruling.orientation === 'vertical' ? 'vertical' : 'horizontal',
    };
}

/**
 * The same ruling measured in a different surface's units — page pixels to canvas points, say.
 * The preview scales rather than re-deriving, so what is on screen is what the PNG will hold.
 */
export function scaleBlankCanvasRuling(ruling: BlankCanvasRuling, factor: number): BlankCanvasRuling {
    if (!Number.isFinite(factor) || factor <= 0) return ruling;
    return {
        spacing: ruling.spacing * factor,
        offsetX: ruling.offsetX * factor,
        offsetY: ruling.offsetY * factor,
        orientation: ruling.orientation,
    };
}

/**
 * Ruling after the page is trimmed. Only the phase moves: cutting a sheet down does not resize
 * its squares, so the strokes drawn over a line stay over that same line.
 */
export function cropBlankCanvasRuling(
    ruling: BlankCanvasRuling,
    page: { width: number; height: number },
    crop: { x: number; y: number },
): BlankCanvasRuling {
    const left = page.width * Math.min(1, Math.max(0, crop.x));
    const top = page.height * Math.min(1, Math.max(0, crop.y));
    return {
        spacing: ruling.spacing,
        offsetX: wrapPhase(ruling.offsetX - left, ruling.spacing),
        offsetY: wrapPhase(ruling.offsetY - top, ruling.spacing),
        orientation: ruling.orientation,
    };
}

/**
 * Ruling after the page is turned a quarter turn clockwise, which sends `(x, y)` to
 * `(pageHeight - y, x)`. The ink is turned with it, so the paper has to follow or the writing
 * comes down off its lines: horizontal rules become vertical, and each phase picks up the other
 * axis's.
 */
export function rotateBlankCanvasRulingClockwise(
    ruling: BlankCanvasRuling,
    pageHeight: number,
): BlankCanvasRuling {
    return {
        spacing: ruling.spacing,
        offsetX: wrapPhase(pageHeight - ruling.offsetY, ruling.spacing),
        offsetY: wrapPhase(ruling.offsetX, ruling.spacing),
        orientation: ruling.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    };
}

/** A page this finely ruled is a tint, not a grid; the cap stops a bad ruling from hanging. */
const MAX_RULING_LINES = 512;

/** Ruling coordinates strictly inside `(0, extent)`, stepping the grid from its phase. */
function ruledPositions(offset: number, spacing: number, extent: number): number[] {
    const positions: number[] = [];
    if (!(spacing > 0) || !(extent > 0)) return positions;
    // A phase of 0 puts a line on the page edge, where it would only thicken the border.
    const first = offset > 0 ? offset : spacing;
    const count = Math.min(MAX_RULING_LINES, Math.ceil((extent - first) / spacing));
    // Indexed rather than accumulated: stepping by `+= spacing` drifts, and a drifting last
    // line lands a hair inside the edge and draws a rule the page should not have.
    for (let index = 0; index < count; index += 1) {
        const value = first + index * spacing;
        if (value >= extent) break;
        positions.push(value);
    }
    return positions;
}

/**
 * Ruling for one page at the given surface size. Coordinates are in that surface's own units,
 * so the preview passes canvas points and the exporter passes export pixels. Pass `ruling` in
 * those same units to draw a page that has been cropped or turned; omit it for a fresh sheet.
 */
export function blankCanvasPaperGeometry(
    paper: BlankCanvasPaper,
    width: number,
    height: number,
    ruling?: BlankCanvasRuling | null,
): BlankCanvasPaperGeometry {
    const resolved = resolveBlankCanvasRuling(ruling, width, height);
    const spacing = resolved.spacing;
    const empty: BlankCanvasPaperGeometry = { lines: [], dots: [], spacing };
    if (spacing <= 0 || paper === 'plain') return empty;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return empty;

    const columns = ruledPositions(resolved.offsetX, spacing, width);
    const rows = ruledPositions(resolved.offsetY, spacing, height);
    const lines: BlankCanvasLine[] = [];
    const dots: BlankCanvasDot[] = [];

    if (paper === 'dotted') {
        rows.forEach((y) => {
            columns.forEach((x) => dots.push({ x, y }));
        });
        return { lines, dots, spacing };
    }

    // Lined paper rules one way only, and that way turns with the page.
    if (paper !== 'lined' || resolved.orientation === 'horizontal') {
        rows.forEach((y) => lines.push({ x1: 0, y1: y, x2: width, y2: y }));
    }
    if (paper === 'grid' || (paper === 'lined' && resolved.orientation === 'vertical')) {
        columns.forEach((x) => lines.push({ x1: x, y1: 0, x2: x, y2: height }));
    }
    return { lines, dots, spacing };
}

function hexChannels(color: string): { r: number; g: number; b: number } | null {
    const value = typeof color === 'string' ? color.trim() : '';
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
    if (short) {
        return {
            r: parseInt(short[1] + short[1], 16),
            g: parseInt(short[2] + short[2], 16),
            b: parseInt(short[3] + short[3], 16),
        };
    }
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (!long) return null;
    return {
        r: parseInt(long[1], 16),
        g: parseInt(long[2], 16),
        b: parseInt(long[3], 16),
    };
}

/** Perceived brightness (ITU-R BT.601), 0 for black and 1 for white. */
export function blankCanvasLuminance(color: string): number {
    const channels = hexChannels(color);
    if (!channels) return 1;
    return (0.299 * channels.r + 0.587 * channels.g + 0.114 * channels.b) / 255;
}

export function isDarkBlankCanvasPage(background: string): boolean {
    return blankCanvasLuminance(background) < 0.5;
}

/** Ruling colour: visible enough to guide a drawing, faint enough to stay out of it. */
export function blankCanvasPaperInk(background: string): string {
    return isDarkBlankCanvasPage(background) ? 'rgba(255, 255, 255, 0.16)' : 'rgba(17, 24, 39, 0.14)';
}

/** Pen colour a page opens with, so the first stroke is never invisible. */
export function blankCanvasDefaultInk(background: string): string {
    return isDarkBlankCanvasPage(background) ? '#ffffff' : '#111827';
}

/** Page size after a crop, in export pixels; `cropBlankCanvasRuling` moves the ruling with it. */
export function cropBlankCanvasSize(
    page: { width: number; height: number },
    crop: { x: number; y: number; width: number; height: number },
): { width: number; height: number } {
    const width = Math.max(1, Math.round(page.width * Math.min(1, Math.max(0, crop.width))));
    const height = Math.max(1, Math.round(page.height * Math.min(1, Math.max(0, crop.height))));
    return { width, height };
}
