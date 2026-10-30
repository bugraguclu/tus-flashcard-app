import { useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, type GestureResponderEvent } from 'react-native';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { PHOTO_ADJUSTMENT_LIMIT, clampPhotoAdjustment } from '../../lib/photoAdjustments';
import { tick } from './editorModel';

interface AdjustmentSliderProps {
    /** What the slider sets, for a screen reader. */
    label: string;
    value: number;
    /** Every step while a finger moves the slider. */
    onChange: (value: number) => void;
    /** Where the slider was left, once per gesture. */
    onChangeEnd: (value: number) => void;
    disabled?: boolean;
}

const THUMB = 24;
/** A finger left this close to the middle is taken to mean no change at all. */
const ZERO_SNAP = 3;
const STEP = 10;

/**
 * A slider from −100 to +100 that fills outwards from its middle, where it leaves the photo as it
 * was. It catches on zero with a tick, and the number beside it puts it back there.
 */
export function AdjustmentSlider({ label, value, onChange, onChangeEnd, disabled }: AdjustmentSliderProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [trackWidth, setTrackWidth] = useState(1);
    const lastRef = useRef(value);

    const valueAt = (event: GestureResponderEvent) => {
        const ratio = Math.min(1, Math.max(0, (event.nativeEvent.locationX - THUMB / 2) / trackWidth));
        const raw = clampPhotoAdjustment(ratio * PHOTO_ADJUSTMENT_LIMIT * 2 - PHOTO_ADJUSTMENT_LIMIT);
        return Math.abs(raw) <= ZERO_SNAP ? 0 : raw;
    };

    const follow = (next: number) => {
        // Crossing or landing on zero is worth a tick: it is the one value with a meaning of its own.
        if (next === 0 && lastRef.current !== 0) tick();
        lastRef.current = next;
        onChange(next);
    };

    const ratio = (clampPhotoAdjustment(value) + PHOTO_ADJUSTMENT_LIMIT) / (PHOTO_ADJUSTMENT_LIMIT * 2);
    const fillStart = Math.min(ratio, 0.5);
    const fillWidth = Math.abs(ratio - 0.5);
    const shown = value > 0 ? `+${value}` : `${value}`;

    return (
        <View style={[styles.row, disabled && styles.disabled]}>
            <View
                style={styles.touchArea}
                onStartShouldSetResponder={() => !disabled}
                onMoveShouldSetResponder={() => !disabled}
                onResponderTerminationRequest={() => false}
                onResponderGrant={(event) => {
                    lastRef.current = value;
                    follow(valueAt(event));
                }}
                onResponderMove={(event) => follow(valueAt(event))}
                onResponderRelease={(event) => onChangeEnd(valueAt(event))}
                onResponderTerminate={() => onChangeEnd(lastRef.current)}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={label}
                accessibilityValue={{ min: -PHOTO_ADJUSTMENT_LIMIT, max: PHOTO_ADJUSTMENT_LIMIT, now: value, text: shown }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'increment') onChangeEnd(clampPhotoAdjustment(value + STEP));
                    if (event.nativeEvent.actionName === 'decrement') onChangeEnd(clampPhotoAdjustment(value - STEP));
                }}
            >
                <View
                    style={[styles.track, { pointerEvents: 'none' }]}
                    onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                >
                    <View style={[styles.fill, { left: `${fillStart * 100}%`, width: `${fillWidth * 100}%` }]} />
                    <View style={styles.middle} />
                    <View style={[styles.thumb, { left: `${ratio * 100}%` }]} />
                </View>
            </View>
            <TouchableOpacity
                style={styles.valueButton}
                onPress={() => onChangeEnd(0)}
                disabled={disabled || value === 0}
                accessibilityRole="button"
                accessibilityLabel={l(`${label}: sıfırla`, `${label}: reset`)}
            >
                <Text style={[styles.value, value !== 0 && styles.valueChanged]}>{shown}</Text>
            </TouchableOpacity>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
        disabled: { opacity: 0.4 },
        touchArea: { flex: 1, height: 44, justifyContent: 'center', paddingHorizontal: THUMB / 2 },
        track: { height: 4, borderRadius: 2, backgroundColor: colors.border },
        fill: { position: 'absolute', top: 0, height: 4, borderRadius: 2, backgroundColor: colors.accent },
        middle: { position: 'absolute', left: '50%', top: -4, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.textMuted },
        thumb: {
            position: 'absolute',
            top: 2 - THUMB / 2,
            width: THUMB,
            height: THUMB,
            marginLeft: -THUMB / 2,
            borderRadius: THUMB / 2,
            backgroundColor: colors.white,
            borderWidth: 2,
            borderColor: colors.accent,
            ...Shadows.sm,
        },
        valueButton: {
            minWidth: 48,
            height: 32,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        value: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },
        valueChanged: { color: colors.accent },
    });
}
