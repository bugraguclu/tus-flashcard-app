import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    View,
    type PressableProps,
    type StyleProp,
    type ViewProps,
    type ViewStyle,
} from 'react-native';
import {
    MotionDuration,
    MotionEasing,
    NATIVE_DRIVER,
    POPOVER_START_SCALE,
    STAGGER_STEP_MS,
    type PopoverOrigin,
} from '../constants/motion';
import { usePresence, type Presence } from '../hooks/usePresence';
import { useReduceMotion } from '../hooks/useReduceMotion';

interface PopoverMotion extends Omit<Presence, 'shown'> {
    reduceMotion: boolean;
}

const PopoverContext = createContext<PopoverMotion | null>(null);
/** A Pressable whose style may hold animated values, e.g. a card that grows in as it opens. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PresenceProps {
    visible: boolean;
    children: React.ReactNode;
    /** How many `PopoverItem`s with an `index` enter one after another. */
    itemCount?: number;
    /** Time between those items; defaults to 30 ms when there are several. */
    staggerMs?: number;
    enterMs?: number;
}

function usePopoverMotion(visible: boolean, { itemCount = 0, staggerMs, enterMs }: Omit<PresenceProps, 'visible' | 'children'>) {
    const reduceMotion = useReduceMotion();
    const presence = usePresence(visible, {
        itemCount,
        staggerMs: staggerMs ?? (itemCount > 1 ? STAGGER_STEP_MS : 0),
        enterMs: enterMs ?? MotionDuration.popover,
    });
    const { mounted, progress, items, shown } = presence;
    // `items` keeps its identity until the surface turns from entering to leaving.
    const motion = useMemo<PopoverMotion>(() => ({ mounted, progress, items, reduceMotion }), [mounted, progress, items, reduceMotion]);
    return { motion, shown };
}

/**
 * Shows `children` while `visible` and keeps them while they animate out: a menu drawn over the
 * screen without a Modal, such as the editor's ••• dropdown.
 */
export function PopoverPresence({ visible, children, ...options }: PresenceProps) {
    const { motion, shown } = usePopoverMotion(visible, options);
    // Drawn in the same commit that mounted it: the entrance can start.
    useEffect(() => {
        if (motion.mounted) shown();
    }, [motion.mounted, shown]);
    if (!motion.mounted) return null;
    return <PopoverContext.Provider value={motion}>{children}</PopoverContext.Provider>;
}

interface PopoverModalProps extends PresenceProps {
    onRequestClose: () => void;
    /** After the menu has gone, on iOS: the time to open another modal or form. */
    onDismiss?: () => void;
}

/**
 * A transparent Modal for a menu that animates its own content: `PopoverBackdrop` fades, each
 * `PopoverItem` grows from 95% at the control that opened it, and both leave a fifth faster than
 * they came. The Modal itself appears and goes without a native animation, whose cross-fade
 * would take twice as long. Keep it mounted and drive it with `visible`; an action that opens
 * another modal must wait for `onDismiss`, since UIKit presents one modal at a time.
 */
export function PopoverModal({ visible, children, onRequestClose, onDismiss, ...options }: PopoverModalProps) {
    const { motion, shown } = usePopoverMotion(visible, options);
    return (
        <Modal
            visible={motion.mounted}
            transparent
            animationType="none"
            presentationStyle="overFullScreen"
            onRequestClose={onRequestClose}
            // The entrance starts once UIKit has put the Modal on screen.
            onShow={shown}
            onDismiss={onDismiss}
        >
            <PopoverContext.Provider value={motion}>
                {/* A menu on its way out no longer takes touches. The prop, not the style:
                    react-native-web drops a 'box-none' style and the layer would swallow taps. */}
                <View style={styles.layer} pointerEvents={visible ? 'box-none' : 'none'}>
                    {children}
                </View>
            </PopoverContext.Provider>
        </Modal>
    );
}

/**
 * The popover's own progress, 0 closed … 1 open, for a control that changes with it, such as a
 * ＋ that turns into × while its menu is open; null outside a popover.
 */
export function usePopoverProgress(): Animated.Value | null {
    return useContext(PopoverContext)?.progress ?? null;
}

/** The dimmed layer behind a popover: it fades with the popover and closes it when pressed. */
export function PopoverBackdrop({ style, ...props }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
    const motion = useContext(PopoverContext);
    return <AnimatedPressable {...props} style={[style, motion ? { opacity: motion.progress } : null]} />;
}

export interface PopoverItemMotion {
    /** The item's place in the entrance order; leave out to enter with the backdrop. */
    index?: number;
    /** The corner or edge that grows first: the one nearest the control that opened it. */
    origin?: PopoverOrigin;
    /** Slide in from this far along an axis instead of growing (a side panel). */
    slide?: { axis: 'x' | 'y'; distance: number };
}

/**
 * The style that animates one popover item: opacity and a growth from 95% (or a slide) at its
 * origin. Outside a `PopoverModal` or `PopoverPresence` — inside a Modal that fades natively — the
 * item only grows (or slides) as it mounts, and the Modal's fade carries the opacity. Reduce
 * Motion keeps the fade and drops the movement.
 */
export function usePopoverItemStyle({ index, origin = 'center', slide }: PopoverItemMotion = {}) {
    const motion = useContext(PopoverContext);
    const reduceMotion = useReduceMotion();
    const ownEntrance = useRef(new Animated.Value(motion ? 1 : 0)).current;
    const standalone = motion === null;
    const slideDistance = slide?.distance ?? 0;
    const slideAxis = slide?.axis ?? null;

    useEffect(() => {
        if (!standalone) return undefined;
        if (reduceMotion) {
            ownEntrance.setValue(1);
            return undefined;
        }
        ownEntrance.setValue(0);
        const animation = Animated.timing(ownEntrance, {
            toValue: 1,
            duration: slideAxis ? MotionDuration.panel : MotionDuration.popover,
            easing: MotionEasing.out,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        });
        animation.start();
        return () => animation.stop();
        // The entrance plays once, as the item mounts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownEntrance, standalone]);

    const value = motion
        ? (index === undefined ? motion.progress : (motion.items[index] ?? motion.progress))
        : ownEntrance;

    return useMemo(() => {
        const fade = standalone ? {} : { opacity: value };
        if (reduceMotion) return fade;
        if (slideAxis) {
            const offset = value.interpolate({ inputRange: [0, 1], outputRange: [slideDistance, 0] });
            return { ...fade, transform: [slideAxis === 'x' ? { translateX: offset } : { translateY: offset }] };
        }
        return {
            ...fade,
            transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [POPOVER_START_SCALE, 1] }) }],
            transformOrigin: origin,
        };
    }, [origin, reduceMotion, slideAxis, slideDistance, standalone, value]);
}

/** One animated part of a popover; see `usePopoverItemStyle`. */
export function PopoverItem({ index, origin, slide, style, ...props }: PopoverItemMotion & ViewProps) {
    const motionStyle = usePopoverItemStyle({ index, origin, slide });
    return <Animated.View {...props} style={[style, motionStyle]} />;
}

const styles = StyleSheet.create({
    layer: { flex: 1 },
});
