import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { exitDuration, MotionDuration, MotionEasing, NATIVE_DRIVER } from '../constants/motion';
import { easedWindow, staggerDelay, staggeredDuration } from '../lib/motion';

/** An animated number from 0 (hidden) to 1 (shown). */
export type PresenceValue = Animated.Value | Animated.AnimatedInterpolation<number>;

export interface Presence {
    /** False once the exit has finished: render nothing, or close the Modal. */
    mounted: boolean;
    /** 0 hidden … 1 shown, for the backdrop and anything that enters at once. */
    progress: Animated.Value;
    /** Each staggered item's own 0 … 1: its slice of the entrance, then the shared exit. */
    items: PresenceValue[];
    /** Call when the surface is on screen (a Modal's onShow): the entrance plays from then. */
    shown: () => void;
}

export interface PresenceOptions {
    /** How many items enter one after another, `staggerMs` apart. */
    itemCount?: number;
    staggerMs?: number;
    enterMs?: number;
    /** Defaults to 80% of `enterMs`. */
    exitMs?: number;
}

/** Longest wait for `shown` before the entrance plays anyway. */
const SHOW_TIMEOUT_MS = 250;
/** Two frames past an exit's planned end, by when its end has certainly been drawn. */
const EXIT_SETTLE_MS = 34;

/**
 * Keeps a surface mounted while it animates out. `visible` mounts it; once it is on screen
 * (`shown`) `progress` eases out from 0 to 1 over `enterMs`. Starting earlier would spend the
 * entrance while UIKit is still presenting the Modal: on the simulator the first visible frame
 * of a menu was already 93% dimmed. On `visible` false it eases back over `exitMs`, and `mounted`
 * turns false two frames after the exit's planned end, without waiting on the native driver's end
 * callback, which can arrive late or not at all while JavaScript is busy.
 *
 * Staggered items follow one linear clock that runs for the whole entrance, each easing over its
 * own slice of it: item n starts n × `staggerMs` after the first. One native animation keeps that
 * spacing exact; a delay per item waits on JavaScript timers, which fire together while the thread
 * is busy drawing the surface. Items leave together with `progress`.
 */
export function usePresence(visible: boolean, options: PresenceOptions = {}): Presence {
    const enterMs = options.enterMs ?? MotionDuration.popover;
    const itemCount = Math.max(0, options.itemCount ?? 0);
    const staggerMs = options.staggerMs ?? 0;
    const settings = { enterMs, exitMs: options.exitMs ?? exitDuration(enterMs), itemCount, staggerMs };
    const [mounted, setMounted] = useState(visible);
    const progress = useRef(new Animated.Value(0)).current;
    // The entrance's clock for staggered items: linear, from the first item's start to the last's end.
    const clock = useRef(new Animated.Value(0)).current;
    const latest = useRef({ mounted, settings });
    latest.current = { mounted, settings };
    const generation = useRef(0);
    // The latest generation that asked to be shown, and the one whose entrance has started: `shown`
    // and its timeout start an entrance once, and never for a surface already asked to leave.
    const wanted = useRef(-1);
    const entered = useRef(-1);
    // Whether the surface has been on screen since it last left: an entrance has played.
    const onScreen = useRef(false);

    const enter = useCallback((run: number) => {
        if (run !== generation.current || run !== wanted.current || entered.current === run) return;
        entered.current = run;
        onScreen.current = true;
        const { enterMs: enterFor, itemCount: count, staggerMs: step } = latest.current.settings;
        const animations = [Animated.timing(progress, {
            toValue: 1,
            duration: enterFor,
            easing: MotionEasing.out,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        })];
        if (count > 0) {
            animations.push(Animated.timing(clock, {
                toValue: 1,
                duration: staggeredDuration(count, enterFor, step),
                easing: Easing.linear,
                useNativeDriver: NATIVE_DRIVER,
                isInteraction: false,
            }));
        }
        Animated.parallel(animations).start();
    }, [clock, progress]);

    useEffect(() => {
        const run = ++generation.current;
        const { exitMs: exit } = latest.current.settings;
        progress.stopAnimation();
        clock.stopAnimation();
        if (visible) {
            wanted.current = run;
            setMounted(true);
            // A surface reopened while it was leaving is still on screen: it carries on from there.
            if (onScreen.current) {
                enter(run);
                return undefined;
            }
            clock.setValue(0);
            const timeout = setTimeout(() => enter(run), SHOW_TIMEOUT_MS);
            return () => clearTimeout(timeout);
        }
        // A surface that has never been shown has nothing to animate away.
        if (!latest.current.mounted) return undefined;
        let done = false;
        const finish = () => {
            if (done || run !== generation.current) return;
            done = true;
            onScreen.current = false;
            clock.setValue(0);
            setMounted(false);
        };
        const settled = setTimeout(finish, exit + EXIT_SETTLE_MS);
        Animated.timing(progress, {
            toValue: 0,
            duration: exit,
            easing: MotionEasing.out,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        }).start(({ finished }) => {
            if (finished) finish();
        });
        return () => clearTimeout(settled);
    }, [clock, enter, progress, visible]);

    const shown = useCallback(() => enter(generation.current), [enter]);

    const entering = useMemo(() => {
        const total = staggeredDuration(itemCount, enterMs, staggerMs);
        return Array.from({ length: itemCount }, (_, index) => {
            const start = staggerDelay(index, staggerMs) / total;
            return clock.interpolate({ ...easedWindow(start, start + enterMs / total), extrapolate: 'clamp' });
        });
    }, [clock, enterMs, itemCount, staggerMs]);
    const leaving = useMemo(() => Array.from({ length: itemCount }, () => progress), [itemCount, progress]);

    return { mounted, progress, items: visible ? entering : leaving, shown };
}
