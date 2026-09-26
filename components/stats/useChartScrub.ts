import { useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useChartScrollLock } from './ChartScrollLock';

interface ChartScrubOptions {
    enabled: boolean;
    /** The bucket at a horizontal position measured from the chart's left edge. */
    indexAt: (x: number) => number | null;
    selected: number | null;
    onSelect: (index: number | null) => void;
    /** Replaces the tap-to-select toggle; a sideways drag still selects. */
    onTap?: (index: number | null) => void;
}

/**
 * Touch handling shared by the statistics charts. A tap selects the bucket under the finger and
 * a second tap on it clears the selection, unless the chart hands taps to `onTap`; a sideways
 * drag scrubs from bucket to bucket, with a light tick on each, while the page holds still. A
 * drag that starts out vertical is left to the page, so a chart never traps the scroll that
 * passes over it.
 */
export function useChartScrub(options: ChartScrubOptions): GestureResponderHandlers {
    const latest = useRef(options);
    latest.current = options;
    const lockScroll = useChartScrollLock();
    const lockRef = useRef(lockScroll);
    lockRef.current = lockScroll;
    const gesture = useRef({ scrubbing: false, startX: 0 });

    const responder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.enabled,
        onMoveShouldSetPanResponder: (_event, state) => latest.current.enabled
            && Math.abs(state.dx) > 4
            && Math.abs(state.dx) > Math.abs(state.dy),
        onPanResponderGrant: (event) => {
            gesture.current = { scrubbing: false, startX: event.nativeEvent.locationX };
        },
        onPanResponderMove: (_event, state) => {
            const current = gesture.current;
            if (!current.scrubbing) {
                if (Math.abs(state.dx) < 6 || Math.abs(state.dx) < Math.abs(state.dy)) return;
                current.scrubbing = true;
                lockRef.current(true);
            }
            const index = latest.current.indexAt(current.startX + state.dx);
            if (index !== null && index !== latest.current.selected) {
                latest.current.onSelect(index);
                void Haptics.selectionAsync().catch(() => undefined);
            }
        },
        onPanResponderRelease: () => {
            const current = gesture.current;
            if (current.scrubbing) {
                current.scrubbing = false;
                lockRef.current(false);
                return;
            }
            const index = latest.current.indexAt(current.startX);
            if (latest.current.onTap) {
                latest.current.onTap(index);
                return;
            }
            latest.current.onSelect(index === null || index === latest.current.selected ? null : index);
        },
        onPanResponderTerminate: () => {
            if (gesture.current.scrubbing) lockRef.current(false);
            gesture.current.scrubbing = false;
        },
        onPanResponderTerminationRequest: () => !gesture.current.scrubbing,
        onShouldBlockNativeResponder: () => false,
    }), []);

    return responder.panHandlers;
}
