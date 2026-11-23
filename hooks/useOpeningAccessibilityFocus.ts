import { useEffect, type RefObject } from 'react';
import * as RN from 'react-native';

/**
 * Moves VoiceOver focus onto a newly opened screen heading or bottom-sheet title on iOS
 * when a screen reader is active, so VoiceOver starts in the visual order instead of staying
 * behind an overlay or at an arbitrary element. No-op on web and when screen reader is off.
 */
export function useOpeningAccessibilityFocus(
    targetRef: RefObject<any>,
    active: boolean = true,
    delayMs: number = 220,
): void {
    useEffect(() => {
        if (!active) return undefined;
        let a11y: typeof RN.AccessibilityInfo | undefined;
        let findHandle: typeof RN.findNodeHandle | undefined;
        try {
            if (RN.Platform?.OS !== 'ios') return undefined;
            a11y = RN.AccessibilityInfo;
            findHandle = RN.findNodeHandle;
        } catch {
            // Partial react-native mocks in unit tests may omit AccessibilityInfo / findNodeHandle.
            return undefined;
        }
        if (
            typeof a11y?.isScreenReaderEnabled !== 'function'
            || typeof a11y?.setAccessibilityFocus !== 'function'
            || typeof findHandle !== 'function'
        ) {
            return undefined;
        }
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const resolvedA11y = a11y;
        const resolvedFindHandle = findHandle;

        void resolvedA11y.isScreenReaderEnabled()
            .then((enabled) => {
                if (!enabled || cancelled) return;
                timer = setTimeout(() => {
                    if (cancelled || !targetRef.current) return;
                    const tag = resolvedFindHandle(targetRef.current);
                    if (typeof tag === 'number') {
                        resolvedA11y.setAccessibilityFocus(tag);
                    }
                }, delayMs);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [active, delayMs, targetRef]);
}
