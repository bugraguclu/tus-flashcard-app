import { Easing, Platform } from 'react-native';
import { criticallyDampedSpring, MotionCurve } from '../lib/motion';

export {
    exitDuration,
    KNOB_STRETCH,
    MotionDuration,
    POPOVER_START_SCALE,
    PRESS_SCALE,
    STAGGER_STEP_MS,
    SUCCESS_PULSE_SCALE,
    type PopoverOrigin,
} from '../lib/motion';

/** The browser has no native animation driver; asking for it only logs a fallback warning. */
export const NATIVE_DRIVER = Platform.OS !== 'web';

type EasingFunction = (value: number) => number;
const easings: Partial<Record<keyof typeof MotionCurve, EasingFunction>> = {};
const curve = (name: keyof typeof MotionCurve): EasingFunction => {
    const [x1, y1, x2, y2] = MotionCurve[name];
    easings[name] ??= Easing.bezier(x1, y1, x2, y2);
    return easings[name];
};

/** The curves of `lib/motion.ts` as React Native easings, built the first time they are used. */
export const MotionEasing = {
    /** Entrances and anything that answers a touch. */
    get out(): EasingFunction {
        return curve('easeOut');
    },
    /** Something already on screen moving to a new place. */
    get inOut(): EasingFunction {
        return curve('easeInOut');
    },
};

/**
 * Springs for everyday controls. Each is critically damped, so it settles without passing its
 * target: `snap` returns a control to a resting place, `lift` raises something picked up, and
 * `panel` brings a side panel to the screen's edge.
 */
export const MotionSpring = {
    snap: criticallyDampedSpring(420),
    lift: criticallyDampedSpring(520),
    panel: criticallyDampedSpring(260, 0.8),
} as const;
