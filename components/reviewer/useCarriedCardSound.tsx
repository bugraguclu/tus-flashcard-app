import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type MutableRefObject, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import CardWebView from '../CardWebView';
import { shouldCarrySound, silencedCallbacks, type CarriedSoundGate } from '../../lib/reviewerCarriedSound';

type CardViewProps = ComponentProps<typeof CardWebView>;

interface CardView {
    key: string;
    props: CardViewProps;
}

interface Options {
    /** The card and side on screen, e.g. `42:answer`; null when no card is shown. */
    sideId: string | null;
    cardId: number | null;
    interruptAudioOnAnswer: boolean;
    /** Props of the card view on screen this render; null when no card document is shown. */
    liveProps: CardViewProps | null;
    /** Kept current by the live view's `onMediaPlayingChange`. */
    liveSoundPlayingRef: MutableRefObject<boolean>;
    gate: CarriedSoundGate;
}

/**
 * Settings › Reviewing › "Interrupt audio when answering", off: when the side or card changes
 * while a sound file plays, the view that plays it is kept mounted out of sight (same React key,
 * so the same web view and the same playing element) and a fresh view shows the new side. The
 * old view finishes the file now playing, skips the rest of its playlist, and is dropped when it
 * falls silent; the gate then releases the new side's audio. See lib/reviewerCarriedSound.ts.
 *
 * Render `carriedView` and the live view (keyed `liveKey`) as siblings in one parent, so the
 * view moves between the two places without being remounted.
 */
export function useCarriedCardSound({ sideId, cardId, interruptAudioOnAnswer, liveProps, liveSoundPlayingRef, gate }: Options) {
    const [renderedSideId, setRenderedSideId] = useState(sideId);
    const [generation, setGeneration] = useState(0);
    const [carried, setCarried] = useState<CardView | null>(null);
    const committedRef = useRef<CardView | null>(null);
    const liveKey = `card-webview-${cardId ?? 'none'}-${generation}`;

    // Decided while rendering the new side, before React commits it: by the time an effect runs
    // the old view would already be unmounted, and its sound with it.
    if (sideId !== renderedSideId) {
        setRenderedSideId(sideId);
        const previous = committedRef.current;
        if (previous && shouldCarrySound(interruptAudioOnAnswer, liveSoundPlayingRef.current)) {
            setCarried(previous);
            setGeneration((value) => value + 1);
        }
    }

    useLayoutEffect(() => {
        committedRef.current = liveProps ? { key: liveKey, props: liveProps } : null;
    });

    // Layout effects run before the new side's autoplay effects, so those find the gate closed.
    useLayoutEffect(() => {
        if (carried) gate.begin();
    }, [carried, gate]);

    useEffect(() => gate.subscribe((carrying) => {
        if (!carrying) setCarried(null);
    }), [gate]);

    useEffect(() => () => gate.stop(), [gate]);

    const handleCarriedPlaying = useCallback((playing: boolean) => {
        if (!playing) gate.finish();
    }, [gate]);

    const carriedView: ReactNode = carried ? (
        <View
            key={carried.key}
            style={styles.carried}
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <CardWebView
                {...silencedCallbacks(carried.props)}
                finishCurrentSoundOnly
                onMediaPlayingChange={handleCarriedPlaying}
            />
        </View>
    ) : null;

    return { liveKey, carriedView };
}

const styles = StyleSheet.create({
    // Out of sight and out of the card's layout, but full width so its document never reflows.
    carried: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
    },
});
