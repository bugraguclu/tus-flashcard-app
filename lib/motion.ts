// Shared motion tokens. Every animated surface reads its duration and spring from here so the
// app moves on one set of curves, and so "Hareketi Azalt" can flatten all of them in one place.
// Deliberately free of react and react-native imports: the resolvers are pure, unit-tested here,
// and the React-facing side lives in hooks/useReduceMotion.ts.

/** Durations in milliseconds, named for the surface that uses them. */
export const MotionDuration = {
    /** Answer flash rising edge. */
    flashIn: 80,
    /** Deck tree expand/collapse (LayoutAnimation). */
    layout: 190,
    /** Answer flash falling edge. */
    flashOut: 180,
    /** Sidebar drawer slide and its overlay fade. */
    drawer: 220,
    /** Bottom sheet rising from the screen edge. */
    sheet: 240,
} as const;

export type MotionDurationToken = keyof typeof MotionDuration;

/** Spring configurations, passed straight to Animated.spring. */
export const MotionSpring = {
    /** Side panel landing in place (CardOptionsMenu). */
    panel: { damping: 24, stiffness: 260, mass: 0.8 },
    /** Card lifting under the finger at the start of a drag. */
    lift: { speed: 28, bounciness: 4 },
} as const;

export type MotionSpringToken = keyof typeof MotionSpring;
export type MotionSpringConfig = (typeof MotionSpring)[MotionSpringToken];

/** Whether motion should play at all; reduced motion keeps the state change but drops the travel. */
export function shouldAnimate(reduced: boolean): boolean {
    return !reduced;
}

/** Resolves a duration against the reduced-motion flag, collapsing to an instant transition. */
export function resolveDuration(base: number, reduced: boolean): number {
    if (reduced) return 0;
    if (!Number.isFinite(base) || base <= 0) return 0;
    return base;
}

/** Same as resolveDuration but keyed by token, so call sites never repeat a raw number. */
export function resolveDurationToken(token: MotionDurationToken, reduced: boolean): number {
    return resolveDuration(MotionDuration[token], reduced);
}

/** Returns the spring config, or null when reduced motion asks for an instant transition instead. */
export function resolveSpring<T extends MotionSpringConfig>(config: T, reduced: boolean): T | null {
    return reduced ? null : config;
}
