/**
 * Chart axis geometry, kept out of the SVG component so the arithmetic that decides where a bar
 * and its label land can be tested directly. The old chart spread three labels across the row
 * with `justify-content: space-between`, which put them wherever flexbox liked rather than under
 * the bucket they described — the axis and the bars disagreed by design.
 */

/** Round a step up to 1/2/5 × 10ⁿ so the axis lands on numbers people read at a glance. */
export function niceStep(rough: number, integer: boolean = true): number {
    if (!Number.isFinite(rough) || rough <= 0) return 1;
    const exponent = Math.floor(Math.log10(rough));
    const base = 10 ** exponent;
    const normalized = rough / base;
    const stepped = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * base;
    return integer ? Math.max(1, Math.round(stepped)) : stepped;
}

export interface AxisTicks {
    /** The value the top gridline sits on; bars are scaled against this, not the raw maximum. */
    top: number;
    ticks: number[];
}

/**
 * Gridline values covering 0..maxValue, on a round step, aiming for `target` divisions. The top
 * is always at or above the largest bar so nothing is clipped.
 */
export function axisTicks(maxValue: number, target: number = 4, integer: boolean = true): AxisTicks {
    if (!Number.isFinite(maxValue) || maxValue <= 0) return { top: 1, ticks: [0, 1] };
    const step = niceStep(maxValue / Math.max(1, target), integer);
    const top = Math.ceil(maxValue / step) * step;
    const ticks: number[] = [];
    for (let value = 0; value <= top + step / 1000; value += step) ticks.push(value);
    return { top, ticks };
}

/** Compact axis-only number labels. Tooltips and metric cards should retain exact values. */
export function compactAxisValue(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const absolute = Math.abs(value);
    const compact = (divisor: number, suffix: string) => {
        const scaled = value / divisor;
        const digits = Math.abs(scaled) < 10 && !Number.isInteger(scaled) ? 1 : 0;
        return `${scaled.toFixed(digits).replace(/\.0$/, '')}${suffix}`;
    };
    if (absolute >= 1_000_000) return compact(1_000_000, 'M');
    if (absolute >= 1_000) return compact(1_000, 'K');
    if (absolute > 0 && absolute < 1) return value.toFixed(1).replace(/\.0$/, '');
    return String(Math.round(value));
}

/**
 * Which bucket indexes get an x-axis label: evenly spaced, one per `slotWidth` of plot, always
 * including the first and last so the axis states the range it actually covers.
 */
export function labelIndexes(count: number, plotWidth: number, slotWidth: number = 58): number[] {
    if (count <= 0 || plotWidth <= 0) return [];
    if (count === 1) return [0];
    const slots = Math.max(2, Math.floor(plotWidth / slotWidth));
    if (count <= slots) return Array.from({ length: count }, (_, index) => index);

    const stride = (count - 1) / (slots - 1);
    const indexes = Array.from({ length: slots }, (_, slot) => Math.round(slot * stride));
    return [...new Set(indexes)].sort((left, right) => left - right);
}

export interface BarGeometry {
    /** Distance between the left edge of one bucket and the next. */
    step: number;
    barWidth: number;
    /** Left edge of the bar for a bucket. */
    xForIndex: (index: number) => number;
    /** Centre of a bucket, where its label and the cumulative point belong. */
    centreForIndex: (index: number) => number;
}

/**
 * Bar placement. Every bucket owns an equal slice of the plot and its bar is centred in that
 * slice, so bar N and label N always share a centre line no matter how many buckets there are.
 */
export function barGeometry(
    count: number,
    plotLeft: number,
    plotWidth: number,
    options: { minWidth?: number; maxWidth?: number; gap?: number } = {},
): BarGeometry {
    const { minWidth = 1, maxWidth = 26, gap = 2 } = options;
    const step = count > 0 ? plotWidth / count : plotWidth;
    // Keep a sliver of breathing room until the buckets get so dense that the gap would eat the
    // bar itself; past that the bars touch and the chart reads as a continuous area, which is
    // what Anki shows for a year of daily data. The width is never forced above the step: a
    // minimum wider than the slot pushes the first bar out of the plot and overlaps the rest.
    const barWidth = Math.min(maxWidth, step > gap + minWidth ? step - gap : step);
    return {
        step,
        barWidth,
        xForIndex: (index) => plotLeft + index * step + (step - barWidth) / 2,
        centreForIndex: (index) => plotLeft + index * step + step / 2,
    };
}

export interface TooltipBox {
    left: number;
    top: number;
    /** True when there was no room above the bar and the box had to sit below its top. */
    flipped: boolean;
}

/**
 * Where the touch readout goes.
 *
 * The box is centred on the bucket the finger is over — so it lines up with the bar it describes —
 * but lifted off the **finger**, not off the bar. Anchoring it to the top of the stack put it
 * under the reader's own thumb on tall bars; anchoring it to the touch point keeps the value
 * visible wherever on the chart they press. If there is no room above the finger the box drops
 * below it, and both axes are clamped to the chart so it never leaves the card.
 */
export function tooltipPlacement(
    anchorX: number,
    touchY: number,
    box: { width: number; height: number },
    bounds: { width: number; height: number },
    options: { margin?: number; gap?: number } = {},
): TooltipBox {
    const { margin = 4, gap = 14 } = options;
    const left = Math.min(
        Math.max(margin, anchorX - box.width / 2),
        Math.max(margin, bounds.width - box.width - margin),
    );
    const above = touchY - box.height - gap;
    if (above >= margin) return { left, top: above, flipped: false };
    return {
        left,
        top: Math.min(touchY + gap, Math.max(margin, bounds.height - box.height - margin)),
        flipped: true,
    };
}
