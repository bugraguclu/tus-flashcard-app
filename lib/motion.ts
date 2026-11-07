/**
 * TusAnkiM's motion rules as plain numbers, so they can be tested without React Native;
 * `constants/motion.ts` turns them into React Native easings and spring configs.
 *
 * - Something that appears eases out: it starts fast and lands softly. Something already on
 *   screen that moves to a new place eases in and out.
 * - Menus and popovers take 150–250 ms. They grow from 95% of their size, never from nothing,
 *   at the control that opened them, and shrink back toward it when they close.
 * - An exit takes 80% of its entrance: leaving should never hold the learner up.
 * - A pressed button settles at 97% of its size, so the press is felt before the action lands.
 * - Everyday controls never overshoot: their springs are critically damped.
 * - A drag past a limit meets growing resistance instead of a wall.
 */

export type CubicBezier = readonly [number, number, number, number];

export const MotionCurve = {
    /** Entrances, and anything that answers a touch: a fast start and a soft landing. */
    easeOut: [0.23, 1, 0.32, 1],
    /** Something already on screen moving to a new place. */
    easeInOut: [0.77, 0, 0.175, 1],
} as const satisfies Record<string, CubicBezier>;

export const MotionDuration = {
    /** A button sinking under the finger and coming back. */
    press: 150,
    /** A menu or popover opening (150–250 ms). */
    popover: 200,
    /** A side panel crossing part of the screen. */
    panel: 260,
    /** A selection moving between the segments of a control. */
    move: 250,
    /** A small badge appearing. */
    badge: 160,
    /** Content fading in once it has loaded. */
    fade: 220,
} as const;

/** An exit takes this share of its entrance. */
export const EXIT_RATIO = 0.8;
/** The size a pressed button settles at. */
export const PRESS_SCALE = 0.97;
/** The size a popover or menu starts from when it opens and returns to when it closes. */
export const POPOVER_START_SCALE = 0.95;
/** A small badge has to grow further than a menu for its entrance to be seen at all. */
export const BADGE_START_SCALE = 0.85;
/** Time between the rows of a list that enters one row after another. */
export const STAGGER_STEP_MS = 30;
/** Rows past this many enter together with it, so a long list still lands quickly. */
export const STAGGER_MAX_STEPS = 6;
/** How much a knob widens along its track while it travels. */
export const KNOB_STRETCH = 0.12;
/** How far a confirmation grows at the peak of its single pulse. */
export const SUCCESS_PULSE_SCALE = 1.06;
/** The resistance UIKit gives a scroll view pulled past its edge. */
export const RUBBER_BAND_CONSTANT = 0.55;

/** The exit that matches an entrance of `enterMs`. */
export function exitDuration(enterMs: number): number {
    return Math.round(Math.max(0, enterMs) * EXIT_RATIO);
}

/** When the row at `index` of a staggered list starts. */
export function staggerDelay(index: number, stepMs = STAGGER_STEP_MS, maxSteps = STAGGER_MAX_STEPS): number {
    return Math.min(Math.max(0, Math.floor(index)), maxSteps) * stepMs;
}

/** A cubic Bézier timing curve as a function of time (0…1) to progress (0…1), as CSS defines it. */
export function cubicBezier([x1, y1, x2, y2]: CubicBezier): (time: number) => number {
    const ax = 3 * x1 - 3 * x2 + 1;
    const bx = 3 * x2 - 6 * x1;
    const cx = 3 * x1;
    const ay = 3 * y1 - 3 * y2 + 1;
    const by = 3 * y2 - 6 * y1;
    const cy = 3 * y1;
    const curveX = (t: number) => ((ax * t + bx) * t + cx) * t;
    const curveY = (t: number) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
    return (time: number) => {
        if (time <= 0) return 0;
        if (time >= 1) return 1;
        // Newton's method finds the curve parameter for this time; bisection catches a flat slope.
        let t = time;
        for (let i = 0; i < 8; i += 1) {
            const error = curveX(t) - time;
            if (Math.abs(error) < 1e-7) return curveY(t);
            const slope = slopeX(t);
            if (Math.abs(slope) < 1e-6) break;
            t -= error / slope;
        }
        let low = 0;
        let high = 1;
        t = time;
        for (let i = 0; i < 40; i += 1) {
            const x = curveX(t);
            if (Math.abs(x - time) < 1e-7) break;
            if (x < time) low = t;
            else high = t;
            t = (low + high) / 2;
        }
        return curveY(t);
    };
}

/**
 * One row's share of a staggered entrance, for an interpolation of a single clock that runs
 * linearly from 0 to 1 over the whole entrance: the row stays hidden until `start`, eases out to
 * shown by `end`, and stays shown. The curve is sampled into straight pieces, which React
 * Native's native driver can follow, so the rows keep their spacing however busy JavaScript is.
 */
export function easedWindow(
    start: number,
    end: number,
    curve: CubicBezier = MotionCurve.easeOut,
    samples = 12,
): { inputRange: number[]; outputRange: number[] } {
    const from = Math.min(Math.max(start, 0), 1);
    const to = Math.min(Math.max(end, from + 1e-6), 1);
    const ease = cubicBezier(curve);
    const inputRange: number[] = [];
    const outputRange: number[] = [];
    for (let i = 0; i <= samples; i += 1) {
        const share = i / samples;
        inputRange.push(from + (to - from) * share);
        outputRange.push(ease(share));
    }
    return { inputRange, outputRange };
}

export interface Keyframe {
    /** Where this step ends, as a share (0…1] of the whole animation. */
    at: number;
    /** The value reached there; the same value as before holds it. */
    value: number;
    /** How the step gets there; ease-out unless given. */
    curve?: CubicBezier;
}

/**
 * A multi-step animation (grow, hold, fade) as one interpolation of a linear 0…1 clock, starting
 * at `start`. One native animation then plays every step on time, where a sequence would start
 * each step from a JavaScript callback and stall while the thread is busy, as it is right after
 * an answer or a save.
 */
export function keyframes(start: number, frames: Keyframe[], samples = 8): { inputRange: number[]; outputRange: number[] } {
    const inputRange = [0];
    const outputRange = [start];
    let from = start;
    let fromAt = 0;
    for (const frame of frames) {
        if (fromAt >= 1) break;
        const at = Math.min(1, Math.max(frame.at, fromAt + 1e-6));
        const ease = cubicBezier(frame.curve ?? MotionCurve.easeOut);
        const steps = frame.value === from ? 1 : samples;
        for (let i = 1; i <= steps; i += 1) {
            const share = i / steps;
            inputRange.push(fromAt + (at - fromAt) * share);
            outputRange.push(from + (frame.value - from) * ease(share));
        }
        from = frame.value;
        fromAt = at;
    }
    if (fromAt < 1) {
        inputRange.push(1);
        outputRange.push(from);
    }
    return { inputRange, outputRange };
}

/** How long a staggered entrance of `itemCount` rows takes, from the first row to the last. */
export function staggeredDuration(itemCount: number, enterMs: number, stepMs = STAGGER_STEP_MS): number {
    return enterMs + staggerDelay(Math.max(0, itemCount - 1), stepMs);
}

/**
 * How far something dragged `overshoot` points past a limit actually travels: it follows the
 * finger at first and gives less and less, never going further than `dimension`. This is the
 * curve iOS scroll views use at their edges.
 */
export function rubberBand(overshoot: number, dimension: number, constant = RUBBER_BAND_CONSTANT): number {
    if (!Number.isFinite(overshoot) || overshoot === 0 || dimension <= 0) return 0;
    const distance = Math.abs(overshoot);
    const travel = (1 - 1 / ((distance * constant) / dimension + 1)) * dimension;
    return Math.sign(overshoot) * travel;
}

/** `value` inside `[min, max]` as it is, and rubber-banded past either end. */
export function rubberBandClamp(
    value: number,
    min: number,
    max: number,
    dimension: number,
    constant = RUBBER_BAND_CONSTANT,
): number {
    if (value < min) return min + rubberBand(value - min, dimension, constant);
    if (value > max) return max + rubberBand(value - max, dimension, constant);
    return value;
}

export interface SpringConfig {
    stiffness: number;
    damping: number;
    mass: number;
}

/** A spring that settles as fast as it can without passing its target: critical damping. */
export function criticallyDampedSpring(stiffness: number, mass = 1): SpringConfig & { overshootClamping: true } {
    return { stiffness, mass, damping: 2 * Math.sqrt(stiffness * mass), overshootClamping: true };
}

/** A spring's damping ratio: 1 settles without overshoot, anything below it bounces. */
export function dampingRatio({ stiffness, damping, mass }: SpringConfig): number {
    return damping / (2 * Math.sqrt(stiffness * mass));
}

/**
 * A knob widened by `amount` along its track and narrowed to match across it, so it looks
 * squeezed by its speed rather than inflated.
 */
export function areaPreservingStretch(amount: number): { scaleX: number; scaleY: number } {
    const scaleX = 1 + Math.max(0, amount);
    return { scaleX, scaleY: 1 / scaleX };
}

/**
 * Where a popover grows from: the corner or edge nearest the control that opened it. Each value
 * is a valid React Native (and CSS) `transformOrigin`.
 */
export type PopoverOrigin =
    | 'top right'
    | 'top left'
    | 'bottom right'
    | 'bottom left'
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'center';
