import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import {
    LatestSnapshotGeneration,
    ScreenSnapshotRepository,
} from '../lib/screenSnapshotLoader';

export interface DeferredScreenSnapshot<T> {
    snapshot: T | null;
    loading: boolean;
    error: unknown;
}

/** Build a cached synchronous snapshot only after the current native interactions finish. */
export function useDeferredScreenSnapshot<T>(
    key: string,
    load: () => T,
): DeferredScreenSnapshot<T> {
    const generationRef = useRef<LatestSnapshotGeneration | null>(null);
    const repositoryRef = useRef<ScreenSnapshotRepository<T> | null>(null);
    if (!generationRef.current) generationRef.current = new LatestSnapshotGeneration();
    if (!repositoryRef.current) repositoryRef.current = new ScreenSnapshotRepository<T>();

    const generation = generationRef.current;
    const repository = repositoryRef.current;
    const [state, setState] = useState<{
        key: string;
        snapshot: T | null;
        loading: boolean;
        error: unknown;
    }>(() => {
        const cached = repository.get(key);
        return {
            key,
            snapshot: cached ?? null,
            loading: cached === undefined,
            error: null,
        };
    });

    useEffect(() => {
        const token = generation.begin();
        const cached = repository.get(key);
        if (cached !== undefined) {
            setState({ key, snapshot: cached, loading: false, error: null });
            return;
        }

        setState((prev) => ({
            key,
            snapshot: prev.snapshot,
            loading: true,
            error: null,
        }));

        const task = InteractionManager.runAfterInteractions(() => {
            try {
                const snapshot = repository.getOrCreate(key, load);
                generation.commit(token, () => {
                    setState({ key, snapshot, loading: false, error: null });
                });
            } catch (error) {
                generation.commit(token, () => {
                    setState({ key, snapshot: null, loading: false, error });
                });
            }
        });

        return () => {
            task.cancel();
            if (generation.isCurrent(token)) generation.cancel();
        };
    }, [generation, key, load, repository]);

    if (state.key !== key) {
        const cached = repository.get(key);
        if (cached !== undefined) {
            return { snapshot: cached, loading: false, error: null };
        }
        return { snapshot: state.snapshot, loading: true, error: null };
    }
    return state;
}
