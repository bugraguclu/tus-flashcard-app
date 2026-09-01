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
};

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

/**
 * Ruling for one page at the given surface size. Coordinates are in that surface's own units,
 * so the preview passes canvas points and the exporter passes export pixels.
 */
export function blankCanvasPaperGeometry(
    paper: BlankCanvasPaper,
    width: number,
    height: number,
): BlankCanvasPaperGeometry {
    const spacing = blankCanvasPaperSpacing(width, height);
    const empty: BlankCanvasPaperGeometry = { lines: [], dots: [], spacing };
    if (spacing <= 0 || paper === 'plain') return empty;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return empty;

    const rows = Math.max(0, Math.ceil(height / spacing) - 1);
    const columns = Math.max(0, Math.ceil(width / spacing) - 1);
    const lines: BlankCanvasLine[] = [];
    const dots: BlankCanvasDot[] = [];

    if (paper === 'dotted') {
        for (let row = 1; row <= rows; row += 1) {
            for (let column = 1; column <= columns; column += 1) {
                dots.push({ x: column * spacing, y: row * spacing });
            }
        }
        return { lines, dots, spacing };
    }

    for (let row = 1; row <= rows; row += 1) {
        const y = row * spacing;
        lines.push({ x1: 0, y1: y, x2: width, y2: y });
    }
    if (paper === 'grid') {
        for (let column = 1; column <= columns; column += 1) {
            const x = column * spacing;
            lines.push({ x1: x, y1: 0, x2: x, y2: height });
        }
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

/** Page size after a crop, in export pixels; the ruling re-flows to the trimmed page. */
export function cropBlankCanvasSize(
    page: { width: number; height: number },
    crop: { x: number; y: number; width: number; height: number },
): { width: number; height: number } {
    const width = Math.max(1, Math.round(page.width * Math.min(1, Math.max(0, crop.width))));
    const height = Math.max(1, Math.round(page.height * Math.min(1, Math.max(0, crop.height))));
    return { width, height };
}
