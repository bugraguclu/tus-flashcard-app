import { describe, expect, it } from 'vitest';
import {
    BLANK_CANVAS_SHAPES,
    blankCanvasDefaultInk,
    blankCanvasLuminance,
    blankCanvasPaperGeometry,
    blankCanvasPaperInk,
    blankCanvasPaperSpacing,
    cropBlankCanvasSize,
    isDarkBlankCanvasPage,
} from './blankCanvas';

describe('blank canvas ruling', () => {
    it('rules a page the same way at preview and export resolution', () => {
        const preview = blankCanvasPaperGeometry('grid', 320, 240);
        const exported = blankCanvasPaperGeometry('grid', 1600, 1200);
        expect(preview.lines.length).toBe(exported.lines.length);
        expect(preview.dots).toEqual([]);

        // Same fraction of the page, five times the pixels.
        const previewFirst = preview.lines[0];
        const exportedFirst = exported.lines[0];
        expect(exportedFirst.y1 / 1200).toBeCloseTo(previewFirst.y1 / 240, 6);
    });

    it('keeps grid cells square on a portrait page', () => {
        const { lines, spacing } = blankCanvasPaperGeometry('grid', 1200, 1600);
        const horizontals = lines.filter((line) => line.y1 === line.y2);
        const verticals = lines.filter((line) => line.x1 === line.x2);
        expect(spacing).toBeCloseTo(1200 / 16, 6);
        expect(horizontals.length).toBe(Math.ceil(1600 / spacing) - 1);
        expect(verticals.length).toBe(Math.ceil(1200 / spacing) - 1);
        expect(horizontals.every((line) => line.x1 === 0 && line.x2 === 1200)).toBe(true);
        expect(verticals.every((line) => line.y1 === 0 && line.y2 === 1600)).toBe(true);
    });

    it('draws only horizontals for lined paper and only dots for dotted paper', () => {
        const lined = blankCanvasPaperGeometry('lined', 1600, 1200);
        expect(lined.dots).toEqual([]);
        expect(lined.lines.every((line) => line.y1 === line.y2)).toBe(true);

        const dotted = blankCanvasPaperGeometry('dotted', 1600, 1200);
        expect(dotted.lines).toEqual([]);
        expect(dotted.dots.length).toBe(
            (Math.ceil(1600 / dotted.spacing) - 1) * (Math.ceil(1200 / dotted.spacing) - 1),
        );
        expect(dotted.dots.every((dot) => dot.x > 0 && dot.x < 1600 && dot.y > 0 && dot.y < 1200)).toBe(true);
    });

    it('leaves plain paper and degenerate sizes unruled', () => {
        expect(blankCanvasPaperGeometry('plain', 1600, 1200)).toEqual({ lines: [], dots: [], spacing: 75 });
        expect(blankCanvasPaperGeometry('grid', 0, 1200).lines).toEqual([]);
        expect(blankCanvasPaperGeometry('grid', Number.NaN, 100).lines).toEqual([]);
        expect(blankCanvasPaperSpacing(0, 0)).toBe(0);
    });

    it('never rules a line onto the page edge', () => {
        const spacing = blankCanvasPaperSpacing(800, 800);
        const { lines } = blankCanvasPaperGeometry('grid', 800, 800);
        expect(spacing).toBeCloseTo(50, 6);
        expect(lines.every((line) => (
            (line.y1 === line.y2 && line.y1 > 0 && line.y1 < 800)
            || (line.x1 === line.x2 && line.x1 > 0 && line.x1 < 800)
        ))).toBe(true);
    });
});

describe('blank canvas ink contrast', () => {
    it('opens a light page with dark ink and a dark page with light ink', () => {
        expect(blankCanvasDefaultInk('#ffffff')).toBe('#111827');
        expect(blankCanvasDefaultInk('#fbf5e6')).toBe('#111827');
        expect(blankCanvasDefaultInk('#1b2a24')).toBe('#ffffff');
        expect(blankCanvasPaperInk('#ffffff')).toContain('17, 24, 39');
        expect(blankCanvasPaperInk('#1b2a24')).toContain('255, 255, 255');
    });

    it('reads short hex and falls back to a light page for anything else', () => {
        expect(blankCanvasLuminance('#000')).toBe(0);
        expect(blankCanvasLuminance('#fff')).toBe(1);
        expect(isDarkBlankCanvasPage('#000')).toBe(true);
        expect(isDarkBlankCanvasPage('rgba(0,0,0,1)')).toBe(false);
        expect(blankCanvasDefaultInk('')).toBe('#111827');
    });
});

describe('blank canvas cropping', () => {
    it('trims the export resolution to the kept fraction of the page', () => {
        const landscape = BLANK_CANVAS_SHAPES[0];
        expect(cropBlankCanvasSize(landscape, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }))
            .toEqual({ width: 800, height: 600 });
        expect(cropBlankCanvasSize(landscape, { x: 0, y: 0, width: 1, height: 1 }))
            .toEqual({ width: 1600, height: 1200 });
    });

    it('clamps a nonsensical crop to at least one pixel', () => {
        expect(cropBlankCanvasSize({ width: 1600, height: 1200 }, { x: 0, y: 0, width: 0, height: -1 }))
            .toEqual({ width: 1, height: 1 });
        expect(cropBlankCanvasSize({ width: 1600, height: 1200 }, { x: 0, y: 0, width: 4, height: 4 }))
            .toEqual({ width: 1600, height: 1200 });
    });
});
