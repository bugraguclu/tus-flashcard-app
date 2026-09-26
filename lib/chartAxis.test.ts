import { describe, expect, it } from 'vitest';
import {
    axisTicks,
    barGeometry,
    compactAxisValue,
    indexAtPosition,
    labelIndexes,
    niceStep,
    roundedTopBarPath,
    stackSegments,
    tooltipPlacement,
} from './chartAxis';

describe('axisTicks', () => {
    it('lands on round numbers rather than the raw maximum', () => {
        expect(axisTicks(137).ticks).toEqual([0, 50, 100, 150]);
        expect(axisTicks(3).ticks).toEqual([0, 1, 2, 3]);
        expect(axisTicks(1).ticks).toEqual([0, 1]);
    });

    it('never clips the tallest bar', () => {
        for (const max of [1, 2, 7, 19, 23, 99, 100, 101, 1234, 98765]) {
            expect(axisTicks(max).top).toBeGreaterThanOrEqual(max);
        }
    });

    it('keeps count axes on whole numbers', () => {
        for (const max of [1, 2, 3, 4, 5, 6, 9]) {
            for (const tick of axisTicks(max).ticks) expect(Number.isInteger(tick)).toBe(true);
        }
    });

    it('degrades to a 0..1 axis when there is nothing to plot', () => {
        expect(axisTicks(0)).toEqual({ top: 1, ticks: [0, 1] });
        expect(axisTicks(Number.NaN)).toEqual({ top: 1, ticks: [0, 1] });
    });

    it('allows fractional steps when the axis is not a count', () => {
        expect(niceStep(0.4, false)).toBeCloseTo(0.5);
        expect(niceStep(0.4, true)).toBe(1);
    });
});

describe('labelIndexes', () => {
    it('always names the first and last bucket', () => {
        const indexes = labelIndexes(365, 300);
        expect(indexes[0]).toBe(0);
        expect(indexes[indexes.length - 1]).toBe(364);
    });

    it('labels every bucket when they all fit', () => {
        expect(labelIndexes(4, 300)).toEqual([0, 1, 2, 3]);
    });

    it('thins the labels as the plot gets narrower', () => {
        const wide = labelIndexes(365, 600).length;
        const narrow = labelIndexes(365, 200).length;
        expect(narrow).toBeLessThan(wide);
        expect(narrow).toBeGreaterThanOrEqual(2);
    });

    it('never repeats an index', () => {
        for (const count of [2, 5, 31, 90, 365, 1000]) {
            const indexes = labelIndexes(count, 320);
            expect(new Set(indexes).size).toBe(indexes.length);
        }
    });

    it('keeps labels at least a slot apart', () => {
        const plotWidth = 320;
        const indexes = labelIndexes(365, plotWidth);
        const { centreForIndex } = barGeometry(365, 0, plotWidth);
        for (let i = 1; i < indexes.length; i++) {
            const gap = centreForIndex(indexes[i]) - centreForIndex(indexes[i - 1]);
            expect(gap).toBeGreaterThan(40);
        }
    });
});

describe('compactAxisValue', () => {
    it('keeps small values exact and shortens large axis labels', () => {
        expect(compactAxisValue(0)).toBe('0');
        expect(compactAxisValue(950)).toBe('950');
        expect(compactAxisValue(1_200)).toBe('1.2K');
        expect(compactAxisValue(25_000)).toBe('25K');
        expect(compactAxisValue(1_500_000)).toBe('1.5M');
    });

    it('keeps fractional time values visible', () => {
        expect(compactAxisValue(0.4)).toBe('0.4');
    });
});

describe('barGeometry', () => {
    it('centres a bar and its label on the same line', () => {
        const { xForIndex, centreForIndex, barWidth } = barGeometry(7, 34, 280);
        for (let index = 0; index < 7; index++) {
            expect(xForIndex(index) + barWidth / 2).toBeCloseTo(centreForIndex(index));
        }
    });

    it('keeps every bar inside the plot', () => {
        const plotLeft = 34;
        const plotWidth = 280;
        for (const count of [1, 2, 7, 31, 90, 365]) {
            const { xForIndex, barWidth } = barGeometry(count, plotLeft, plotWidth);
            expect(xForIndex(0)).toBeGreaterThanOrEqual(plotLeft);
            expect(xForIndex(count - 1) + barWidth).toBeLessThanOrEqual(plotLeft + plotWidth + 0.001);
        }
    });

    it('never lets neighbouring bars overlap', () => {
        for (const count of [2, 31, 180, 365, 900]) {
            const { step, barWidth } = barGeometry(count, 34, 280);
            expect(barWidth).toBeLessThanOrEqual(step + 0.001);
        }
    });

    it('caps the bar width so a two-bucket chart is not two giant slabs', () => {
        expect(barGeometry(2, 34, 280).barWidth).toBe(26);
    });

    it('still draws something when hundreds of buckets share the plot', () => {
        expect(barGeometry(900, 34, 280).barWidth).toBeGreaterThan(0);
    });
});

describe('tooltipPlacement', () => {
    const box = { width: 130, height: 70 };
    const bounds = { width: 340, height: 190 };

    it('centres the box on the bucket the finger is over', () => {
        const { left } = tooltipPlacement(170, 120, box, bounds);
        expect(left + box.width / 2).toBeCloseTo(170);
    });

    it('lifts the box clear of the finger rather than of the bar', () => {
        // A tall bar used to push the readout under the reader's own thumb.
        const { top, flipped } = tooltipPlacement(170, 150, box, bounds);
        expect(top + box.height).toBeLessThan(150);
        expect(flipped).toBe(false);
    });

    it('keeps the box on screen at the first and last bucket', () => {
        for (const anchor of [0, 6, 334, 340]) {
            const { left } = tooltipPlacement(anchor, 120, box, bounds);
            expect(left).toBeGreaterThanOrEqual(4);
            expect(left + box.width).toBeLessThanOrEqual(bounds.width - 4 + 0.001);
        }
    });

    it('drops below the finger when it is pressing near the top of the chart', () => {
        const { top, flipped } = tooltipPlacement(170, 10, box, bounds);
        expect(flipped).toBe(true);
        expect(top).toBeGreaterThan(10);
        expect(top + box.height).toBeLessThanOrEqual(bounds.height - 4 + 0.001);
    });

    it('never places the box outside the chart even when it barely fits', () => {
        const tall = { width: 130, height: 180 };
        const { top } = tooltipPlacement(170, 10, tall, bounds);
        expect(top).toBeGreaterThanOrEqual(4);
    });

    it('does not fight a chart narrower than the box', () => {
        const { left } = tooltipPlacement(50, 120, box, { width: 100, height: 190 });
        expect(left).toBe(4);
    });
});

describe('indexAtPosition', () => {
    it('finds the bucket under a finger and clamps to the ends', () => {
        expect(indexAtPosition(34, 34, 10, 5)).toBe(0);
        expect(indexAtPosition(55, 34, 10, 5)).toBe(2);
        expect(indexAtPosition(0, 34, 10, 5)).toBe(0);
        expect(indexAtPosition(500, 34, 10, 5)).toBe(4);
    });

    it('has nothing to find in an empty chart', () => {
        expect(indexAtPosition(40, 34, 10, 0)).toBeNull();
        expect(indexAtPosition(40, 34, 0, 5)).toBeNull();
    });
});

describe('stackSegments', () => {
    it('stacks bottom to top and leaves a gap only between pieces', () => {
        const segments = stackSegments([10, 0, 30], 40, 200, 100, 2);
        expect(segments.map((segment) => segment.series)).toEqual([0, 2]);
        // 10 of 40 is 25 points tall; the piece under another gives up two points to the gap.
        expect(segments[0]).toMatchObject({ y: 177, height: 23, top: false });
        // The top piece keeps its full height, so the bar still ends exactly on its total.
        expect(segments[1]).toMatchObject({ y: 100, height: 75, top: true });
    });

    it('keeps a tiny non-zero value visible', () => {
        const [segment] = stackSegments([1], 10_000, 200, 100);
        expect(segment.height).toBe(1);
    });

    it('draws nothing for an empty bucket or a degenerate axis', () => {
        expect(stackSegments([0, 0], 10, 200, 100)).toEqual([]);
        expect(stackSegments([5], 0, 200, 100)).toEqual([]);
    });
});

describe('roundedTopBarPath', () => {
    it('rounds the data end and keeps the base square', () => {
        const path = roundedTopBarPath(10, 20, 12, 50, 4);
        expect(path.startsWith('M10,70V24Q10,20 14,20H18Q22,20 22,24V70Z')).toBe(true);
    });

    it('shrinks the radius to fit a thin or short bar', () => {
        expect(roundedTopBarPath(0, 0, 2, 50, 4)).toContain('Q0,0 1,0');
        expect(roundedTopBarPath(0, 0, 12, 0, 4)).toBe('M0,0V0H12V0Z');
    });
});
