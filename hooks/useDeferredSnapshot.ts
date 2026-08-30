import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

export type DeferredSnapshot<T> = {
    /** Last successfully computed value, or `fallback` until the first run finishes. */
    data: T;
    /** False while a run for the current dependencies is still pending. */
    ready: boolean;
    /** Recompute with the current dependencies (used after a mutation on this screen). */
    reload: () => void;
};

/**
 * Runs an expensive synchronous read (SQL snapshot, queue build, aggregation) after the
 * navigation transition instead of during render, so the screen's chrome paints and the
 * scroll surface is interactive on the first frame.
 *
 * A generation token drops the result of any run whose dependencies have since changed,
 * so a slow load for an old filter can never overwrite a newer one.
 */
export function useDeferredSnapshot<T>(
    compute: () => T,
    deps: readonly unknown[],
    fallback: T,
): DeferredSnapshot<T> {
    const computeRef = useRef(compute);
    computeRef.current = compute;

    const generationRef = useRef(0);
    const [state, setState] = useState<{ data: T; generation: number }>({ data: fallback, generation: -1 });
    const [manualToken, setManualToken] = useState(0);

    useEffect(() => {
        const generation = ++generationRef.current;
        let cancelled = false;

        const handle = InteractionManager.runAfterInteractions(() => {
            if (cancelled || generation !== generationRef.current) return;
            let next: T;
            try {
                next = computeRef.current();
            } catch (error) {
                console.warn('[DeferredSnapshot] compute failed:', error);
                return;
            }
            if (cancelled || generation !== generationRef.current) return;
            setState({ data: next, generation });
        });

        return () => {
            cancelled = true;
            handle.cancel();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, manualToken]);

    const reload = useCallback(() => setManualToken((token) => token + 1), []);

    return { data: state.data, ready: state.generation === generationRef.current, reload };
}
