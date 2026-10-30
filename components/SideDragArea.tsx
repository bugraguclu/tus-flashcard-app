import React, { useRef, useState } from 'react';
import { Animated, Platform, ScrollView, View, type ViewProps } from 'react-native';

/** A sideways drag: where it started, measured from the area's left edge, and how far it has moved. */
export interface SideDrag {
    x0: number;
    dx: number;
}

export interface SideDragHandlers {
    onDragStart?: (drag: SideDrag) => void;
    onDragMove?: (drag: SideDrag) => void;
    onDragEnd?: (drag: SideDrag) => void;
}

/**
 * Any other View prop (style, layout or accessibility props) applies to the area itself; responder
 * props (a PanResponder's handlers) go on the content, see below.
 */
interface SideDragAreaProps extends SideDragHandlers, ViewProps {
    children: React.ReactNode;
    /** False while the content takes no drags (a chart without data), so the back swipe works there too. */
    enabled?: boolean;
}

// How far a drag can travel before the hidden scroll view would reach one of its ends.
const RANGE = 10000;
// The scroll view starts to move only once the finger has gone about this far (UIKit's pan slop),
// so the distance it reports is that much short of the finger's.
const MAX_LEAD = 12;

/** True where SideDragArea reports sideways drags itself, so the content must not track them too. */
export const SIDE_DRAG_IS_NATIVE = Platform.OS === 'ios';

/** Splits off React Native's responder props (onStartShouldSetResponder, onResponderMove, ...). */
function splitResponderProps(props: ViewProps): [ViewProps, ViewProps] {
    const responder: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        const isResponderProp = /^on(Responder|StartShouldSetResponder|MoveShouldSetResponder)/.test(key);
        (isResponderProp ? responder : rest)[key] = value;
    }
    return [responder as ViewProps, rest as ViewProps];
}

/**
 * Content that is dragged sideways (a chart scrub, a slider, a week strip) on a screen that can be
 * swiped back.
 *
 * From iOS 26 a pushed screen goes back on a rightward swipe that starts anywhere on it. That swipe
 * gives way only to a native horizontal scroll view under the finger, the way a carousel keeps its
 * swipes in other apps, and on its way it cancels the touch JavaScript was tracking. A PanResponder
 * cannot hold a sideways drag on such a screen: either the screen leaves or the drag is dropped.
 *
 * On iOS the content therefore sits in a horizontal scroll view that never visibly moves (the
 * content is shifted back by every point it scrolls), and the drag is read from the scroll position
 * rather than from touches. Taps still reach the content as before. Elsewhere the content renders
 * as it is and keeps its own responders.
 *
 * On iOS a responder passed to the area (a chart that takes taps claims every touch as it starts)
 * is put on the content inside the scroll view: React Native's iOS scroll view will not start
 * scrolling while one of its ancestors is the JS responder, so on the area itself it would hold
 * every drag and leave the swipe to the back gesture.
 */
export default function SideDragArea({
    children,
    enabled = true,
    onDragStart,
    onDragMove,
    onDragEnd,
    ...viewProps
}: SideDragAreaProps) {
    const [width, setWidth] = useState(0);
    const scrollRef = useRef<ScrollView>(null);
    const frameRef = useRef<View>(null);
    const scrollX = useRef(new Animated.Value(RANGE)).current;
    const shift = useRef(Animated.subtract(scrollX, RANGE)).current;
    const touch = useRef({ startX: 0, lastX: 0, frameX: 0 });
    const drag = useRef<(SideDrag & { lead: number }) | null>(null);
    const report = (offset: number) => {
        const current = drag.current;
        if (!current) return null;
        current.dx = current.lead + RANGE - offset;
        return { x0: current.x0, dx: current.dx };
    };
    const handlers = useRef<SideDragHandlers>({});
    handlers.current = { onDragStart, onDragMove, onDragEnd };

    if (!SIDE_DRAG_IS_NATIVE || !enabled) return <View {...viewProps}>{children}</View>;

    // Scrolling back to where the view rests emits no scroll event when it is already there (a
    // re-render can put it back first), so the content's counter-shift is reset as well.
    const rest = () => {
        scrollRef.current?.scrollTo({ x: RANGE, animated: false });
        scrollX.setValue(RANGE);
    };
    const [responderProps, frameProps] = splitResponderProps(viewProps);

    return (
        <View
            {...frameProps}
            ref={frameRef}
            onLayout={(event) => {
                setWidth(event.nativeEvent.layout.width);
                viewProps.onLayout?.(event);
            }}
            onTouchStart={(event) => {
                touch.current.startX = event.nativeEvent.pageX;
                touch.current.lastX = event.nativeEvent.pageX;
                frameRef.current?.measureInWindow((x) => { touch.current.frameX = x; });
                viewProps.onTouchStart?.(event);
            }}
            onTouchMove={(event) => {
                touch.current.lastX = event.nativeEvent.pageX;
                viewProps.onTouchMove?.(event);
            }}
        >
            <Animated.ScrollView
                ref={scrollRef}
                horizontal
                contentOffset={{ x: RANGE, y: 0 }}
                contentContainerStyle={{ width: width + 2 * RANGE }}
                bounces={false}
                showsHorizontalScrollIndicator={false}
                scrollsToTop={false}
                scrollEventThrottle={16}
                decelerationRate="fast"
                // The page's scroll view must not take the touch from the content when this one moves.
                disableScrollViewPanResponder
                onScrollBeginDrag={() => {
                    const moved = touch.current.lastX - touch.current.startX;
                    const lead = Math.max(-MAX_LEAD, Math.min(MAX_LEAD, moved));
                    drag.current = { x0: touch.current.startX - touch.current.frameX, dx: lead, lead };
                    handlers.current.onDragStart?.({ x0: drag.current.x0, dx: lead });
                }}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                    useNativeDriver: true,
                    listener: (event: { nativeEvent: { contentOffset: { x: number } } }) => {
                        const moved = report(event.nativeEvent.contentOffset.x);
                        if (moved) handlers.current.onDragMove?.(moved);
                    },
                })}
                onScrollEndDrag={(event) => {
                    // Read where the drag ended from this event: the scroll events are throttled
                    // and the last one can be dropped.
                    const ended = report(event.nativeEvent.contentOffset.x);
                    drag.current = null;
                    if (ended) handlers.current.onDragEnd?.(ended);
                    rest();
                }}
                onMomentumScrollEnd={rest}
            >
                <Animated.View
                    {...responderProps}
                    style={{ width, marginLeft: RANGE, transform: [{ translateX: shift }] }}
                >
                    {children}
                </Animated.View>
            </Animated.ScrollView>
        </View>
    );
}
