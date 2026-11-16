import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import {
    LatestSnapshotGeneration,
    ScreenSnapshotRepository,
    runAfterFrames,
    runAfterInteractionsWithin,
} from '../lib/screenSnapshotLoader';

/** The longest a snapshot waits for running animations before it is built anyway. */
const MAX_INTERACTION_WAIT_MS = 500;
/**
 * Frames a screen with nothing to show yet is given before its first snapshot is built: the
 * pushed screen is mounted in the first and has its safe-area insets by the second; the third
 * is margin.
 */
const LOADING_FRAMES = 3;

export interface DeferredScreenSnapshotOptions {
    /**
     * Draw the screen's loading state before its first snapshot is built. For a build that can
     * take long enough to notice (Statistics reads the whole review log): otherwise the build
     * starts in the turn that rendered the screen, React Native shows nothing of that turn until
     * it ends, and the learner is left on the screen they came from with no sign the tap was
     * taken. Later builds, which have the previous snapshot to show, keep their timing.
     */
    showLoadingFirst?: boolean;
}

export interface DeferredScreenSnapshot<T> {
    snapshot: T | null;
    loading: boolean;
    error: unknown;
}

/**
 * Build a cached synchronous snapshot outside the render that asked for it. The build starts as
 * soon as that render's turn allows (`InteractionManager` no longer waits for animations), unless
 * `showLoadingFirst` holds the first one back until the loading state is on screen.
 */
export function useDeferredScreenSnapshot<T>(
    key: string,
    load: () => T,
    { showLoadingFirst = false }: DeferredScreenSnapshotOptions = {},
): DeferredScreenSnapshot<T> {
    const generationRef = useRef<LatestSnapshotGeneration | null>(null);
    const repositoryRef = useRef<ScreenSnapshotRepository<T> | null>(null);
    /** Whether a snapshot is on screen, so a new build has something to show meanwhile. */
    const showingSnapshotRef = useRef(false);
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
            showingSnapshotRef.current = true;
            setState({ key, snapshot: cached, loading: false, error: null });
            return;
        }

        setState((prev) => ({
            key,
            snapshot: prev.snapshot,
            loading: true,
            error: null,
        }));

        const build = () => {
            try {
                const snapshot = repository.getOrCreate(key, load);
                generation.commit(token, () => {
                    showingSnapshotRef.current = true;
                    setState({ key, snapshot, loading: false, error: null });
                });
            } catch (error) {
                generation.commit(token, () => {
                    showingSnapshotRef.current = false;
                    setState({ key, snapshot: null, loading: false, error });
                });
            }
        };
        const task = runAfterInteractionsWithin(
            build,
            showLoadingFirst && !showingSnapshotRef.current
                ? (callback) => runAfterFrames(callback, LOADING_FRAMES)
                : (callback) => InteractionManager.runAfterInteractions(callback),
            MAX_INTERACTION_WAIT_MS,
        );

        return () => {
            task.cancel();
            if (generation.isCurrent(token)) generation.cancel();
        };
    }, [generation, key, load, repository, showLoadingFirst]);

    if (state.key !== key) {
        const cached = repository.get(key);
        if (cached !== undefined) {
            return { snapshot: cached, loading: false, error: null };
        }
        return { snapshot: state.snapshot, loading: true, error: null };
    }
    return state;
}
