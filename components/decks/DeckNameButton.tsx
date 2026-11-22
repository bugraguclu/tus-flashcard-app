import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { ROW_PRIMARY_DATA } from '../../lib/webHover';

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
    /**
     * Web with a mouse only: whether the button is held on the name. The row then draws the
     * feedback across its whole width, as a desktop list does, instead of the name fading. A
     * phone (the app, or a browser on a touch screen) keeps the name's own fade.
     */
    onPressedChange?: (pressed: boolean) => void;
}

const HOLD_DELAY_MS = 450;
const SCROLL_SLOP = 10;
/** A touch that starts a scroll moves within this time; only a touch that stays lights the row. */
const HIGHLIGHT_DELAY_MS = 90;
/** How long a quick tap, released before the highlight showed, still flashes it. */
const TAP_FLASH_MS = 120;

/** The faded name a phone shows under the finger. */
const PRESSED_OPACITY = 0.2;

/** A mouse that can hover: the web build on a computer, not a phone or tablet. */
export function usesRowHighlight(): boolean {
    return Platform.OS === 'web'
        && typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** A tap studies; a stationary hold hands the same touch to the deck list's existing drag. */
export default function DeckNameButton(props: DeckNameButtonProps) {
    const latest = useRef(props);
    latest.current = props;
    const rowHighlight = usesRowHighlight();
    const rowHighlightRef = useRef(rowHighlight);
    rowHighlightRef.current = rowHighlight;
    const [faded, setFaded] = useState(false);
    // `seen`: whether the highlight showed during the touch that just ended.
    const highlight = useRef({ shown: false, seen: false, timer: null as ReturnType<typeof setTimeout> | null });
    const setPressed = (pressed: boolean, delay = 0) => {
        if (!rowHighlightRef.current) {
            setFaded(pressed);
            return;
        }
        const state = highlight.current;
        if (state.timer !== null) clearTimeout(state.timer);
        state.timer = null;
        const apply = (next: boolean) => {
            if (state.shown === next) return;
            state.shown = next;
            latest.current.onPressedChange?.(next);
        };
        if (delay > 0) state.timer = setTimeout(() => { state.timer = null; apply(pressed); }, delay);
        else apply(pressed);
    };
    const release = () => {
        highlight.current.seen = highlight.current.shown;
        setPressed(false);
    };
    /** A quick tap, released before its highlight showed, still shows which row it opened. */
    const flashIfUnseen = () => {
        if (!rowHighlightRef.current || highlight.current.seen) return;
        setPressed(true);
        setPressed(false, TAP_FLASH_MS);
    };
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
            setPressed(true, HIGHLIGHT_DELAY_MS);
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
            const current = gesture.current;
            release();
            if (!current.active && !current.moved) flashIfUnseen();
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
        if (highlight.current.timer !== null) clearTimeout(highlight.current.timer);
        if (gesture.current.active) latest.current.drag?.cancel();
    }, []);

    const { children, style, accessibilityLabel, accessibilityHint, title, onPress, drag } = props;
    const webProps = Platform.OS === 'web' ? {
        title,
        dataSet: ROW_PRIMARY_DATA,
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
        <Pressable style={[style, faded && { opacity: PRESSED_OPACITY }]} onPress={() => { flashIfUnseen(); onPress(); }} accessibilityRole="button"
            onPressIn={() => setPressed(true, HIGHLIGHT_DELAY_MS)}
            onPressOut={release}
            accessibilityLabel={accessibilityLabel}
            {...(Platform.OS === 'web' ? { title, dataSet: ROW_PRIMARY_DATA } : {})}>
            {children}
        </Pressable>
    );

    return (
        <View {...responder.panHandlers} {...webProps} style={[style, faded && { opacity: PRESSED_OPACITY }]}
            accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint} onAccessibilityTap={onPress}>
            {children}
        </View>
    );
}
