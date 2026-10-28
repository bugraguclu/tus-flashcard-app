import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Platform,
    StyleSheet,
    View,
    type GestureResponderEvent,
    type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text, TextScaleProvider } from '../AppText';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    normalizeTextSizeLevel,
    TEXT_SIZE_LEVELS,
    textSizeLevelAt,
    textSizeLevelIndex,
    textSizeMultiplier,
    type TextSizeLevel,
} from '../../lib/textScale';

const THUMB_SIZE = 26;
const LAST_STEP = TEXT_SIZE_LEVELS.length - 1;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type Props = {
    value: TextSizeLevel | undefined;
    onChange: (level: TextSizeLevel) => void;
};

/**
 * The Settings text size control: drag (or tap) along the track and the thumb snaps to one of
 * four steps. While the finger is down only the preview redraws; the rest of the app takes the
 * new step on release, so the screen never re-lays out under the finger.
 */
export default function TextSizeSlider({ value, onChange }: Props) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const committed = normalizeTextSizeLevel(value);
    const [draft, setDraft] = useState<TextSizeLevel>(committed);
    const [trackWidth, setTrackWidth] = useState(0);
    const position = useRef(new Animated.Value(0)).current;
    const draggingRef = useRef(false);
    const draftRef = useRef(draft);
    // The last step handed to onChange. Two quick key presses can land before the parent
    // re-renders, so comparing against the `value` prop would drop the second one.
    const sentRef = useRef(committed);
    const gestureRef = useRef<{ originPageX: number } | null>(null);

    const labels: Record<TextSizeLevel, string> = {
        small: l('Küçük', 'Small'),
        default: l('Normal', 'Default'),
        large: l('Büyük', 'Large'),
        xlarge: l('Çok büyük', 'Extra large'),
    };

    const stopX = useCallback((level: TextSizeLevel) => (textSizeLevelIndex(level) / LAST_STEP) * trackWidth, [trackWidth]);

    const settle = useCallback((level: TextSizeLevel, animated: boolean) => {
        position.stopAnimation();
        if (!animated) {
            position.setValue(stopX(level));
            return;
        }
        Animated.spring(position, {
            toValue: stopX(level),
            useNativeDriver: USE_NATIVE_DRIVER,
            speed: 24,
            bounciness: 4,
        }).start();
    }, [position, stopX]);

    // A reset or discarded draft moves the thumb, unless the finger is holding it. The slider's
    // own commit arrives here too, and leaves the snap animation running.
    useEffect(() => {
        sentRef.current = committed;
        if (draggingRef.current || committed === draftRef.current) return;
        draftRef.current = committed;
        setDraft(committed);
        settle(committed, false);
    }, [committed, settle]);

    // The track is measured after the first frame and again on rotation or a resized window.
    useEffect(() => {
        if (!draggingRef.current) settle(draftRef.current, false);
    }, [settle]);

    const showDraft = useCallback((level: TextSizeLevel) => {
        if (level === draftRef.current) return;
        draftRef.current = level;
        setDraft(level);
        if (Platform.OS !== 'web') {
            try {
                void Haptics.selectionAsync().catch(() => undefined);
            } catch {
                // Haptics unavailable
            }
        }
    }, []);

    const commit = useCallback((level: TextSizeLevel) => {
        showDraft(level);
        settle(level, true);
        if (level === sentRef.current) return;
        sentRef.current = level;
        onChange(level);
    }, [onChange, settle, showDraft]);

    const step = useCallback((delta: number) => {
        const index = Math.max(0, Math.min(LAST_STEP, textSizeLevelIndex(draftRef.current) + delta));
        commit(TEXT_SIZE_LEVELS[index]);
    }, [commit]);

    // Track coordinates come from pageX against the point the touch began, which stays right
    // even when the finger leaves the control or the platform reports locationX for a child.
    const follow = useCallback((event: GestureResponderEvent) => {
        const gesture = gestureRef.current;
        if (!gesture || trackWidth <= 0) return;
        const x = Math.max(0, Math.min(trackWidth, event.nativeEvent.pageX - gesture.originPageX));
        position.setValue(x);
        showDraft(textSizeLevelAt(x / trackWidth));
    }, [position, showDraft, trackWidth]);

    const begin = useCallback((event: GestureResponderEvent) => {
        position.stopAnimation();
        draggingRef.current = true;
        // The touch area is padded by half a thumb on each side, so the track starts there.
        gestureRef.current = { originPageX: event.nativeEvent.pageX - event.nativeEvent.locationX + THUMB_SIZE / 2 };
        follow(event);
    }, [follow, position]);

    const end = useCallback(() => {
        draggingRef.current = false;
        gestureRef.current = null;
        commit(draftRef.current);
    }, [commit]);

    const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
        setTrackWidth(Math.max(0, event.nativeEvent.layout.width));
    }, []);

    const handleKeyDown = useCallback((event: { key: string; preventDefault: () => void }) => {
        const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Home: -LAST_STEP, End: LAST_STEP }[event.key];
        if (delta === undefined) return;
        event.preventDefault();
        step(delta);
    }, [step]);
    // react-native-web forwards keyboard handlers to the DOM; React Native's View has none.
    const keyboardProps = Platform.OS === 'web' ? ({ onKeyDown: handleKeyDown } as object) : {};

    const fillOffset = useMemo(() => Animated.add(position, -trackWidth), [position, trackWidth]);
    const draftIndex = textSizeLevelIndex(draft);

    return (
        <View style={styles.block}>
            <View style={styles.header}>
                <Text style={styles.label}>{l('Uygulama metinleri', 'App text')}</Text>
                <Text style={styles.value} numberOfLines={1}>{labels[draft]}</Text>
            </View>
            <Text style={styles.summary}>
                {l(
                    'Menüler, listeler ve düğmeler bu boyutta görünür. Kart içeriğinin boyutu Erişilebilirlik bölümündeki Kart yakınlaştırma ayarındadır.',
                    'Menus, lists and buttons use this size. Card content has its own size: Card zoom, under Accessibility.',
                )}
            </Text>

            {/* Sample copy, not content: screen readers hear the step from the slider itself. */}
            <View style={styles.preview} aria-hidden>
                <TextScaleProvider multiplier={textSizeMultiplier(draft)}>
                    <Text style={styles.previewTitle}>{l('Kardiyoloji', 'Cardiology')}</Text>
                    <Text style={styles.previewBody}>
                        {l('Bugün 12 tekrar ve 5 yeni kart seni bekliyor.', '12 reviews and 5 new cards are waiting for you today.')}
                    </Text>
                    <Text style={styles.previewMeta}>{l('Son çalışma: dün', 'Last studied: yesterday')}</Text>
                </TextScaleProvider>
            </View>

            <View style={styles.sliderRow}>
                <Text style={styles.glyphSmall} allowFontScaling={false} accessible={false}>A</Text>
                <View
                    {...keyboardProps}
                    style={styles.touchArea}
                    focusable
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={begin}
                    onResponderMove={follow}
                    onResponderRelease={end}
                    onResponderTerminate={end}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={l('Yazı boyutu', 'Text size')}
                    aria-valuemin={0}
                    aria-valuemax={LAST_STEP}
                    aria-valuenow={draftIndex}
                    aria-valuetext={labels[draft]}
                    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                    onAccessibilityAction={(event) => {
                        if (event.nativeEvent.actionName === 'increment') step(1);
                        if (event.nativeEvent.actionName === 'decrement') step(-1);
                    }}
                >
                    <View style={[styles.track, { pointerEvents: 'none' }]} onLayout={onTrackLayout}>
                        <Animated.View style={[styles.fill, { width: trackWidth, transform: [{ translateX: fillOffset }] }]} />
                    </View>
                    {TEXT_SIZE_LEVELS.map((level, index) => (
                        <View
                            key={level}
                            style={[
                                styles.tick,
                                index <= draftIndex && styles.tickReached,
                                { left: THUMB_SIZE / 2 + (index / LAST_STEP) * trackWidth - 1, pointerEvents: 'none' },
                            ]}
                        />
                    ))}
                    <Animated.View
                        style={[styles.thumb, { opacity: trackWidth > 0 ? 1 : 0, pointerEvents: 'none', transform: [{ translateX: position }] }]}
                    />
                </View>
                <Text style={styles.glyphLarge} allowFontScaling={false} accessible={false}>A</Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        block: { paddingTop: Spacing.xs, paddingBottom: Spacing.xs },
        header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
        label: { flexShrink: 1, fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
        value: { flexShrink: 0, fontSize: FontSize.md, fontWeight: '800', color: colors.accent, lineHeight: 20 },
        summary: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 18, marginTop: 3 },
        preview: {
            marginTop: Spacing.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.borderLight,
            backgroundColor: colors.bgSecondary,
            gap: 4,
        },
        previewTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, lineHeight: 22 },
        previewBody: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 20 },
        previewMeta: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 17 },
        sliderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, userSelect: 'none' },
        glyphSmall: { width: 18, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.textMuted },
        glyphLarge: { width: 26, textAlign: 'center', fontSize: 24, fontWeight: '700', color: colors.textMuted },
        touchArea: { flex: 1, height: 48, justifyContent: 'center', paddingHorizontal: THUMB_SIZE / 2, cursor: 'pointer' },
        track: { height: 4, borderRadius: BorderRadius.full, backgroundColor: colors.border, overflow: 'hidden' },
        fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
        tick: { position: 'absolute', top: 24 - 6, width: 2, height: 12, borderRadius: 1, backgroundColor: colors.border },
        tickReached: { backgroundColor: colors.accent },
        thumb: {
            position: 'absolute',
            left: 0,
            top: 24 - THUMB_SIZE / 2,
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            borderWidth: 2,
            borderColor: colors.accent,
            backgroundColor: colors.bgCard,
            ...Shadows.md,
        },
    });
}
