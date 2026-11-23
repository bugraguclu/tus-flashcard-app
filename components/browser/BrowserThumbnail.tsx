import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { IconButton } from '../ui/Button';
import { Radius } from '../ui/tokens';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { longPressHaptic } from '../../lib/haptics';
import { BROWSER_THUMBNAIL_DISPLAY_SIZE } from '../../lib/browserThumbnail';
import {
    getCachedBrowserThumbnail,
    invalidateMediaThumbnails,
    loadBrowserThumbnail,
    onBrowserThumbnailsInvalidated,
} from '../../lib/mediaThumbnails';

interface BrowserThumbnailProps {
    filename: string;
    onOpen: () => void;
}

type ThumbnailState =
    | { status: 'loading'; uri: null }
    | { status: 'ready'; uri: string }
    | { status: 'fallback'; uri: null };

function initialStateFor(filename: string): ThumbnailState {
    const cached = getCachedBrowserThumbnail(filename);
    if (typeof cached === 'string') return { status: 'ready', uri: cached };
    return { status: cached === null ? 'fallback' : 'loading', uri: null };
}

/** A disposable derivative; opening it previews the card's question and answer above Browse. */
export const BrowserThumbnail = memo(function BrowserThumbnail({ filename, onOpen }: BrowserThumbnailProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const [state, setState] = useState<ThumbnailState>(() => initialStateFor(filename));
    const retriedRef = useRef(false);
    const [mediaRevision, setMediaRevision] = useState(0);
    const activeFilenameRef = useRef(filename);
    const mountedRef = useRef(true);
    activeFilenameRef.current = filename;

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        retriedRef.current = false;
        return onBrowserThumbnailsInvalidated((filenames) => {
            if (filenames === null || filenames.includes(filename)) setMediaRevision(v => v + 1);
        });
    }, [filename]);

    useEffect(() => {
        const cached = getCachedBrowserThumbnail(filename);
        if (cached !== undefined) {
            setState(cached ? { status: 'ready', uri: cached } : { status: 'fallback', uri: null });
            return;
        }
        setState({ status: 'loading', uri: null });
        const controller = new AbortController();
        let active = true;
        void loadBrowserThumbnail(filename, { signal: controller.signal }).then((uri) => {
            if (!active || controller.signal.aborted) return;
            setState(uri ? { status: 'ready', uri } : { status: 'fallback', uri: null });
        }).catch(() => {
            if (active && !controller.signal.aborted) setState({ status: 'fallback', uri: null });
        });
        return () => { active = false; controller.abort(); };
    }, [filename, mediaRevision]);

    const handleError = useCallback(() => {
        if (retriedRef.current) {
            setState({ status: 'fallback', uri: null });
            return;
        }
        retriedRef.current = true;
        setState({ status: 'loading', uri: null });
        void invalidateMediaThumbnails([filename]).catch(() => {
            if (mountedRef.current && activeFilenameRef.current === filename) setState({ status: 'fallback', uri: null });
        });
    }, [filename]);

    if (state.status === 'fallback') return null;
    const open = (event: Pick<GestureResponderEvent, 'stopPropagation'>, withHaptic: boolean) => {
        event.stopPropagation();
        if (state.status !== 'ready') return;
        if (withHaptic) longPressHaptic();
        onOpen();
    };
    return (
        <IconButton
            style={styles.button}
            accessibilityLabel={l('Kartı önizle', 'Preview card')}
            accessibilityHint={l('Soru ve cevabı görmek için dokunun veya basılı tutun', 'Tap or hold to preview the question and answer')}
            onPress={event => open(event, false)}
            onLongPress={event => open(event, true)}
            onContextMenu={event => { event.preventDefault(); open(event, true); }}
            disabled={state.status !== 'ready'}
        >
            <View style={[styles.frame, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
                {state.status === 'ready' ? (
                    <Image source={{ uri: state.uri }} style={styles.image} resizeMode="cover"
                        onError={handleError} onLoad={() => { retriedRef.current = false; }} accessible={false} />
                ) : null}
            </View>
        </IconButton>
    );
});

const styles = StyleSheet.create({
    button: { alignSelf: 'center', flexShrink: 0 },
    frame: {
        width: BROWSER_THUMBNAIL_DISPLAY_SIZE, height: BROWSER_THUMBNAIL_DISPLAY_SIZE,
        borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.control, overflow: 'hidden',
    },
    image: { width: '100%', height: '100%' },
});
