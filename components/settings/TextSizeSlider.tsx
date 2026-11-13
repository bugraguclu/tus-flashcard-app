import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Platform,
    StyleSheet,
    View,
    type GestureResponderEvent,
    type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text, TextScaleProvider } from '../AppText';
import { FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { KNOB_STRETCH, MotionSpring } from '../../constants/motion';
import { useI18n } from '../../hooks/useI18n';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { areaPreservingStretch, keyframes, MotionCurve, rubberBandClamp } from '../../lib/motion';
import { Radius, Type } from '../ui/tokens';
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
// Past either end the thumb gives a little and no more than half its width, then springs back.
const OVERDRAG_LIMIT = THUMB_SIZE / 2;
// While it travels to a step the thumb stretches along the track and narrows across it: quickly
// as it sets off, easing back to round as it lands. One native clock plays both halves, so the
// app redrawing at the new text size cannot leave the thumb stretched.
const KNOB = areaPreservingStretch(KNOB_STRETCH);
const STRETCH_MS = 260;
const STRETCH = keyframes(0, [
    { at: 70 / STRETCH_MS, value: 1 },
    { at: 1, value: 0, curve: MotionCurve.easeInOut },
]);

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
    const reduceMotion = useReduceMotion();
    const position = useRef(new Animated.Value(0)).current;
    // The stretch's clock; at rest it sits at the end, where the thumb is round.
    const stretchClock = useRef(new Animated.Value(1)).current;
    // Where the thumb was last put, so a snap knows how far it travels.
    const thumbXRef = useRef(0);
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
        stretchClock.stopAnimation();
        stretchClock.setValue(1);
        const target = stopX(level);
        const travel = Math.abs(target - thumbXRef.current);
        thumbXRef.current = target;
        if (!animated) {
            position.setValue(target);
            return;
        }
        // The thumb lands on its step without overshooting it.
        Animated.spring(position, {
            toValue: target,
            useNativeDriver: USE_NATIVE_DRIVER,
            isInteraction: false,
            ...MotionSpring.snap,
        }).start();
        // A thumb that hardly moves (a release next to its step) keeps its shape.
        if (reduceMotion || travel < THUMB_SIZE / 4) return;
        stretchClock.setValue(0);
        Animated.timing(stretchClock, {
            toValue: 1,
            duration: STRETCH_MS,
            easing: Easing.linear,
            useNativeDriver: USE_NATIVE_DRIVER,
            isInteraction: false,
        }).start();
    }, [position, reduceMotion, stopX, stretchClock]);

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
        const x = event.nativeEvent.pageX - gesture.originPageX;
        // Past either end the thumb meets growing resistance instead of a wall.
        thumbXRef.current = rubberBandClamp(x, 0, trackWidth, OVERDRAG_LIMIT);
        position.setValue(thumbXRef.current);
        showDraft(textSizeLevelAt(Math.max(0, Math.min(trackWidth, x)) / trackWidth));
    }, [position, showDraft, trackWidth]);

    const begin = useCallback((event: GestureResponderEvent) => {
        position.stopAnimation();
        stretchClock.stopAnimation();
        stretchClock.setValue(1);
        draggingRef.current = true;
        // The touch area is padded by half a thumb on each side, so the track starts there.
        gestureRef.current = { originPageX: event.nativeEvent.pageX - event.nativeEvent.locationX + THUMB_SIZE / 2 };
        follow(event);
    }, [follow, position, stretchClock]);

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

    // The fill ends under the thumb and stays whole while the thumb gives past either end.
    const fillOffset = useMemo(() => position.interpolate({
        inputRange: [0, Math.max(trackWidth, 1)],
        outputRange: [-trackWidth, 0],
        extrapolate: 'clamp',
    }), [position, trackWidth]);
    const thumbStretch = useMemo(() => {
        const stretch = stretchClock.interpolate({ ...STRETCH, extrapolate: 'clamp' });
        return [
            { scaleX: stretch.interpolate({ inputRange: [0, 1], outputRange: [1, KNOB.scaleX] }) },
            { scaleY: stretch.interpolate({ inputRange: [0, 1], outputRange: [1, KNOB.scaleY] }) },
        ];
    }, [stretchClock]);
    const draftIndex = textSizeLevelIndex(draft);

    return (
        <View>
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
                        style={[styles.thumb, { opacity: trackWidth > 0 ? 1 : 0, pointerEvents: 'none', transform: [{ translateX: position }, ...thumbStretch] }]}
                    />
                </View>
                <Text style={styles.glyphLarge} allowFontScaling={false} accessible={false}>A</Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
        label: { ...Type.rowTitle, flexShrink: 1, color: colors.textPrimary, lineHeight: 20 },
        value: { ...Type.bodyStrong, flexShrink: 0, color: colors.accent, lineHeight: 20 },
        summary: { ...Type.caption, color: colors.textMuted, marginTop: 3 },
        preview: {
            marginTop: Spacing.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.md,
            borderRadius: Radius.inset,
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
        track: { height: 4, borderRadius: Radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
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
