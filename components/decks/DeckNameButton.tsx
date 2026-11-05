import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

export interface DeckNameDragHandlers {
    begin: (pageY: number) => void;
    move: (pageY: number) => void;
    complete: () => void;
    cancel: () => void;
}

interface DeckNameButtonProps {
    children: React.ReactNode;
    style: StyleProp<ViewStyle>;
    accessibilityLabel: string;
    accessibilityHint?: string;
    title?: string;
    onPress: () => void;
    drag?: DeckNameDragHandlers;
}

const HOLD_DELAY_MS = 450;
const SCROLL_SLOP = 10;

/** A tap studies; a stationary hold hands the same touch to the deck list's existing drag. */
export default function DeckNameButton(props: DeckNameButtonProps) {
    const latest = useRef(props);
    latest.current = props;
    const [pressed, setPressed] = useState(false);
    const gesture = useRef({
        timer: null as ReturnType<typeof setTimeout> | null,
        active: false,
        moved: false,
        x: 0,
        y: 0,
        pageY: 0,
    });
    const clearHold = () => {
        if (gesture.current.timer !== null) clearTimeout(gesture.current.timer);
        gesture.current.timer = null;
    };
    // Keep the responder and its in-flight gesture through the parent's drag-preview re-render.
    const [responder] = useState(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
            clearHold();
            const { pageX, pageY } = event.nativeEvent;
            Object.assign(gesture.current, { active: false, moved: false, x: pageX, y: pageY, pageY });
            setPressed(true);
            gesture.current.timer = setTimeout(() => {
                gesture.current.timer = null;
                if (!latest.current.drag) return;
                gesture.current.active = true;
                setPressed(false);
                latest.current.drag.begin(gesture.current.pageY);
            }, HOLD_DELAY_MS);
        },
        onPanResponderMove: (event) => {
            const current = gesture.current;
            const { pageX, pageY } = event.nativeEvent;
            current.pageY = pageY;
            if (current.active) {
                latest.current.drag?.move(pageY);
            } else if (Math.hypot(pageX - current.x, pageY - current.y) > SCROLL_SLOP) {
                current.moved = true;
                clearHold();
                setPressed(false);
            }
        },
        onPanResponderRelease: (event) => {
            clearHold();
            setPressed(false);
            const current = gesture.current;
            if (current.active) {
                current.active = false;
                latest.current.drag?.move(event.nativeEvent.pageY);
                latest.current.drag?.complete();
            } else if (!current.moved) {
                latest.current.onPress();
            }
        },
        onPanResponderTerminate: () => {
            clearHold();
            setPressed(false);
            if (gesture.current.active) {
                gesture.current.active = false;
                latest.current.drag?.cancel();
            }
        },
        // Before the hold, let the native list take an ordinary scroll. Once lifted, keep the drag.
        onPanResponderTerminationRequest: () => !gesture.current.active,
    }));

    useEffect(() => () => {
        clearHold();
        if (gesture.current.active) latest.current.drag?.cancel();
    }, []);

    const { children, style, accessibilityLabel, accessibilityHint, title, onPress, drag } = props;
    const webProps = Platform.OS === 'web' ? {
        title,
        tabIndex: 0 as const,
        onKeyDown: (event: React.KeyboardEvent) => {
            if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            onPress();
        },
        onClick: (event: React.MouseEvent) => {
            // Assistive technology can activate a button without a pointer gesture.
            if (event.detail === 0) onPress();
        },
    } : {};

    if (!drag) return (
        <TouchableOpacity style={style} onPress={onPress} accessibilityRole="button"
            accessibilityLabel={accessibilityLabel} {...(Platform.OS === 'web' ? { title } : {})}>
            {children}
        </TouchableOpacity>
    );

    return (
        <View {...responder.panHandlers} {...webProps} style={[style, pressed && { opacity: 0.2 }]}
            accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint} onAccessibilityTap={onPress}>
            {children}
        </View>
    );
}
