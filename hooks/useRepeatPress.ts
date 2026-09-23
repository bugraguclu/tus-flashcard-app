import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { RepeatPressController, type RepeatPressOptions } from '../lib/repeatPress';

export type UseRepeatPressOptions = RepeatPressOptions & {
    /** Whether to trigger tactile selection feedback on each step/repeat (default: true). */
    hapticFeedback?: boolean;
};

/**
 * Hook providing onPress, onPressIn, and onPressOut handlers for buttons with
 * rapid auto-repeat on hold.
 */
export function useRepeatPress(
    action: () => void,
    options?: UseRepeatPressOptions,
) {
    const actionRef = useRef(action);
    actionRef.current = action;

    const controllerRef = useRef<RepeatPressController | null>(null);

    const tick = useCallback(() => {
        actionRef.current();
        if (options?.hapticFeedback !== false && Platform.OS !== 'web') {
            try {
                void Haptics.selectionAsync().catch(() => undefined);
            } catch {
                // Haptics unavailable
            }
        }
    }, [options?.hapticFeedback]);

    if (!controllerRef.current) {
        controllerRef.current = new RepeatPressController(tick, options);
    } else {
        controllerRef.current.onTick = tick;
    }

    useEffect(() => {
        return () => {
            controllerRef.current?.stop();
        };
    }, []);

    const onPressIn = useCallback(() => {
        controllerRef.current?.onPressIn();
    }, []);

    const onPressOut = useCallback(() => {
        controllerRef.current?.onPressOut();
    }, []);

    const onPress = useCallback(() => {
        controllerRef.current?.onPress();
    }, []);

    return {
        onPress,
        onPressIn,
        onPressOut,
    };
}
