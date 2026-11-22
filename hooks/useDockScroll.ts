import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
    DOCK_SCROLL_START,
    dockScrollStep,
    type DockScrollSample,
    type DockScrollState,
} from '../lib/dockScroll';

export interface DockScrollBinding {
    /** Whether the dock is out of the way now. */
    hidden: boolean;
    /** Call with each scroll event of the list under the dock. */
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    /** Call when the list's content height changes (a deck folded away may leave nothing to scroll). */
    onContentSizeChange: (contentHeight: number) => void;
    /** Brings the dock back, e.g. when the screen is shown again. */
    reveal: () => void;
}

/**
 * Follows a list's scrolling and says when the dock over it should get out of the way
 * (lib/dockScroll.ts). While `enabled` is false (a wide window, a running screen reader, a deck
 * being dragged) the dock stays, and the list's position is still followed so that it picks up from
 * the right place once it is enabled again.
 */
export function useDockScroll(enabled: boolean): DockScrollBinding {
    const [hidden, setHidden] = useState(false);
    const state = useRef<DockScrollState>(DOCK_SCROLL_START);
    const sample = useRef<DockScrollSample | null>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    const apply = useCallback((next: DockScrollState) => {
        const changed = next.hidden !== state.current.hidden;
        state.current = next;
        if (changed) setHidden(next.hidden);
    }, []);

    const step = useCallback(() => {
        const current = sample.current;
        if (!current) return;
        apply(enabledRef.current
            ? dockScrollStep(state.current, current)
            : { ...DOCK_SCROLL_START, offset: Math.max(0, current.offset) });
    }, [apply]);

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        sample.current = {
            offset: contentOffset.y,
            contentHeight: contentSize.height,
            viewportHeight: layoutMeasurement.height,
        };
        step();
    }, [step]);

    const onContentSizeChange = useCallback((contentHeight: number) => {
        if (!sample.current) return;
        sample.current = { ...sample.current, contentHeight };
        step();
    }, [step]);

    const reveal = useCallback(() => {
        apply({ ...DOCK_SCROLL_START, offset: Math.max(0, sample.current?.offset ?? 0) });
    }, [apply]);

    useEffect(() => {
        if (!enabled) reveal();
    }, [enabled, reveal]);

    return { hidden: enabled && hidden, onScroll, onContentSizeChange, reveal };
}
