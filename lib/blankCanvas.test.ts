import { describe, expect, it } from 'vitest';
import {
    BLANK_CANVAS_SHAPES,
    blankCanvasDefaultInk,
    blankCanvasLuminance,
    blankCanvasPaperGeometry,
    blankCanvasPaperInk,
    blankCanvasPaperSpacing,
    cropBlankCanvasRuling,
    cropBlankCanvasSize,
    defaultBlankCanvasRuling,
    isDarkBlankCanvasPage,
    resolveBlankCanvasRuling,
    rotateBlankCanvasRulingClockwise,
    scaleBlankCanvasRuling,
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

describe('ruling that survives an edit', () => {
    const page = { width: 1600, height: 1200 };
    const spacing = blankCanvasPaperSpacing(page.width, page.height);

    it('rules a fresh page exactly as it did before the ruling was tracked', () => {
        const fresh = defaultBlankCanvasRuling(page.width, page.height);
        expect(fresh).toEqual({ spacing, offsetX: 0, offsetY: 0, orientation: 'horizontal' });

        const withRuling = blankCanvasPaperGeometry('grid', page.width, page.height, fresh);
        const withoutRuling = blankCanvasPaperGeometry('grid', page.width, page.height);
        expect(withRuling).toEqual(withoutRuling);
        // A phase of zero keeps the ruling off the page edges rather than thickening the border.
        const horizontals = withRuling.lines.filter((line) => line.y1 === line.y2);
        const verticals = withRuling.lines.filter((line) => line.x1 === line.x2);
        expect(horizontals.every((line) => line.y1 > 0 && line.y1 < page.height)).toBe(true);
        expect(verticals.every((line) => line.x1 > 0 && line.x1 < page.width)).toBe(true);
    });

    it('keeps the squares the same size when the page is cropped', () => {
        const fresh = defaultBlankCanvasRuling(page.width, page.height);
        const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
        const trimmed = cropBlankCanvasSize(page, crop);
        const trimmedRuling = cropBlankCanvasRuling(fresh, page, crop);

        expect(trimmedRuling.spacing).toBe(spacing);
        // Re-deriving instead would have shrunk the squares with the sheet.
        expect(blankCanvasPaperSpacing(trimmed.width, trimmed.height)).not.toBeCloseTo(spacing, 6);

        const geometry = blankCanvasPaperGeometry('grid', trimmed.width, trimmed.height, trimmedRuling);
        const horizontals = geometry.lines.filter((line) => line.y1 === line.y2).map((line) => line.y1);
        // Every line the crop kept is still where it was, measured from the new top-left corner.
        horizontals.forEach((y) => {
            expect((y + page.height * crop.y) % spacing).toBeCloseTo(0, 6);
        });
    });

    it('leaves a stroke sitting on the line it was drawn on after a crop', () => {
        const fresh = defaultBlankCanvasRuling(page.width, page.height);
        // A stroke written along the sixth rule of the page, which the crop below keeps.
        const inkY = 6 * spacing;
        const crop = { x: 0, y: 0.3, width: 1, height: 0.5 };

        const trimmed = cropBlankCanvasSize(page, crop);
        const trimmedRuling = cropBlankCanvasRuling(fresh, page, crop);
        const geometry = blankCanvasPaperGeometry('lined', trimmed.width, trimmed.height, trimmedRuling);

        // `cropPhotoAnnotation` moves normalised ink the same way; in page pixels that is a shift.
        const inkAfterCrop = inkY - page.height * crop.y;
        expect(geometry.lines.some((line) => Math.abs(line.y1 - inkAfterCrop) < 1e-6)).toBe(true);
    });

    it('turns the ruling with the page so writing stays on its lines', () => {
        const cropped = cropBlankCanvasRuling(
            defaultBlankCanvasRuling(page.width, page.height),
            page,
            { x: 0, y: 0.1 },
        );
        const turned = rotateBlankCanvasRulingClockwise(cropped, page.height);

        expect(turned.spacing).toBe(cropped.spacing);
        // A quarter turn clockwise sends (x, y) to (pageHeight - y, x), so the phases swap axes.
        expect(turned.offsetX).toBeCloseTo(((page.height - cropped.offsetY) % spacing + spacing) % spacing, 6);
        expect(turned.offsetY).toBeCloseTo(cropped.offsetX, 6);
        // Lined paper ruled across is ruled down once the sheet is on its side.
        expect(turned.orientation).toBe('vertical');

        const lines = blankCanvasPaperGeometry('lined', page.height, page.width, turned).lines;
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every((line) => line.x1 === line.x2)).toBe(true);

        // Four turns come back to the page the learner started on.
        const full = [1, 2, 3].reduce(
            (state, index) => rotateBlankCanvasRulingClockwise(
                state,
                index % 2 === 1 ? page.width : page.height,
            ),
            turned,
        );
        expect(full.orientation).toBe(cropped.orientation);
        expect(full.offsetX).toBeCloseTo(cropped.offsetX, 6);
        expect(full.offsetY).toBeCloseTo(cropped.offsetY, 6);
    });

    it('measures the same ruling in the preview\'s units', () => {
        const fresh = cropBlankCanvasRuling(
            defaultBlankCanvasRuling(page.width, page.height),
            page,
            { x: 0.13, y: 0.37 },
        );
        const factor = 320 / page.width;
        const scaled = scaleBlankCanvasRuling(fresh, factor);
        const preview = blankCanvasPaperGeometry('grid', 320, 240, scaled);
        const exported = blankCanvasPaperGeometry('grid', page.width, page.height, fresh);

        expect(preview.lines.length).toBe(exported.lines.length);
        const previewFirst = preview.lines[0];
        const exportedFirst = exported.lines[0];
        expect(previewFirst.y1 / 240).toBeCloseTo(exportedFirst.y1 / page.height, 6);
    });

    it('ignores a ruling that could not be drawn', () => {
        const fallback = defaultBlankCanvasRuling(page.width, page.height);
        expect(resolveBlankCanvasRuling(null, page.width, page.height)).toEqual(fallback);
        expect(resolveBlankCanvasRuling(
            { spacing: 0, offsetX: 4, offsetY: 4, orientation: 'vertical' },
            page.width,
            page.height,
        )).toEqual(fallback);
        // A phase outside one step is folded back onto the same grid.
        expect(resolveBlankCanvasRuling(
            { spacing: 40, offsetX: 95, offsetY: -10, orientation: 'vertical' },
            page.width,
            page.height,
        )).toEqual({ spacing: 40, offsetX: 15, offsetY: 30, orientation: 'vertical' });
    });
});
