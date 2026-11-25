import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../../lib/colorMath';
import { TextField } from './Fields';
import { useI18n } from '../../hooks/useI18n';
import { CheckIcon, PlusIcon } from './icons';
import { Radius } from './tokens';

/** The rainbow under the hue slider: the six pure hues, back round to red. */
const HUE_STOPS = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];

const PAD_HEIGHT = 168;
const HUE_HEIGHT = 30;
const THUMB = 26;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A full colour picker: a saturation × brightness field for the chosen hue, a rainbow hue slider
 * under it, and the hex code to type or paste. The thumbs follow the finger at once; `onChange`
 * fires as the finger lifts (and for a typed code), so a whole-app recolour does not run on every
 * frame of a drag. Both fields are adjustable for VoiceOver (swipe up or down).
 */
export function ColorPicker({ value, onChange, accessibilityLabel, onDragChange }: {
    value: string;
    onChange: (hex: string) => void;
    accessibilityLabel: string;
    /**
     * Told when a finger lands on and leaves the picker. On iOS 26 a sideways drag anywhere on a
     * page is also the back swipe, which a JS responder cannot refuse: the screen turns its back
     * gesture off while this says true.
     */
    onDragChange?: (dragging: boolean) => void;
}) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
    const [padWidth, setPadWidth] = useState(0);
    const [hexText, setHexText] = useState(value.toUpperCase());
    const hsvRef = useRef(hsv);
    hsvRef.current = hsv;
    const widthRef = useRef(0);
    const padStart = useRef({ x: 0, y: 0 });
    const hueStart = useRef(0);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const dragRef = useRef(onDragChange);
    dragRef.current = onDragChange;

    // A new value from outside (a swatch, the other gradient stop) moves the thumbs, unless it is
    // the colour the thumbs already show.
    useEffect(() => {
        if (normalizeHex(value) === hsvToHex(hsvRef.current)) return;
        const next = hexToHsv(value);
        // Black and greys have no hue of their own: keep the slider where it was.
        setHsv((previous) => (next.s === 0 || next.v === 0 ? { ...next, h: previous.h } : next));
        setHexText(value.toUpperCase());
    }, [value]);

    const current = hsvToHex(hsv);
    const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

    const commit = (next: Hsv) => {
        dragRef.current?.(false);
        const hex = hsvToHex(next);
        setHexText(hex.toUpperCase());
        onChangeRef.current(hex);
    };
    const update = (patch: Partial<Hsv>, done: boolean) => {
        const next = { ...hsvRef.current, ...patch };
        hsvRef.current = next;
        setHsv(next);
        setHexText(hsvToHex(next).toUpperCase());
        if (done) commit(next);
    };

    // Claimed on touch start and never handed back, so the page's scroll view and the back swipe
    // leave a drag inside the picker alone.
    const padResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
            const { locationX, locationY } = event.nativeEvent;
            padStart.current = { x: locationX, y: locationY };
            dragRef.current?.(true);
            update({ s: clamp01(locationX / Math.max(1, widthRef.current)), v: 1 - clamp01(locationY / PAD_HEIGHT) }, false);
        },
        // From where the finger landed plus how far it moved: `locationX` is relative to whatever is
        // under the pointer, which in a browser is not the pad once the drag leaves it.
        onPanResponderMove: (_event, gesture) => {
            const x = padStart.current.x + gesture.dx; const y = padStart.current.y + gesture.dy;
            update({ s: clamp01(x / Math.max(1, widthRef.current)), v: 1 - clamp01(y / PAD_HEIGHT) }, false);
        },
        onPanResponderRelease: () => commit(hsvRef.current),
        onPanResponderTerminate: () => commit(hsvRef.current),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);
    const hueResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
            hueStart.current = event.nativeEvent.locationX;
            dragRef.current?.(true);
            update({ h: clamp01(hueStart.current / Math.max(1, widthRef.current)) * 359.9 }, false);
        },
        onPanResponderMove: (_event, gesture) => update({ h: clamp01((hueStart.current + gesture.dx) / Math.max(1, widthRef.current)) * 359.9 }, false),
        onPanResponderRelease: () => commit(hsvRef.current),
        onPanResponderTerminate: () => commit(hsvRef.current),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    const onLayout = (event: LayoutChangeEvent) => {
        widthRef.current = event.nativeEvent.layout.width;
        setPadWidth(event.nativeEvent.layout.width);
    };

    const hueStep = (delta: number) => update({ h: (hsvRef.current.h + delta + 360) % 360 }, true);
    const brightnessStep = (delta: number) => update({ v: clamp01(hsvRef.current.v + delta), s: Math.max(hsvRef.current.s, 0.35) }, true);
    const thumbBorder = hsv.v > 0.6 && hsv.s < 0.4 ? colors.textPrimary : colors.white;

    return (
        <View style={styles.root} onLayout={onLayout}>
            <View
                style={[styles.pad, { backgroundColor: pureHue }]}
                {...padResponder.panHandlers}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`${accessibilityLabel}: ${current.toUpperCase()}`}
                accessibilityHint={l('Parlaklığı değiştirmek için yukarı veya aşağı kaydırın', 'Swipe up or down to change brightness')}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => brightnessStep(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
            >
                {padWidth > 0 && (
                    <Svg width={padWidth} height={PAD_HEIGHT} pointerEvents="none">
                        <Defs>
                            <LinearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="0">
                                <Stop offset="0" stopColor={colors.white} stopOpacity={1} />
                                <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
                            </LinearGradient>
                            <LinearGradient id={`v${uid}`} x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={PICKER_BLACK} stopOpacity={0} />
                                <Stop offset="1" stopColor={PICKER_BLACK} stopOpacity={1} />
                            </LinearGradient>
                        </Defs>
                        <Rect x={0} y={0} width={padWidth} height={PAD_HEIGHT} rx={Radius.button} fill={`url(#s${uid})`} />
                        <Rect x={0} y={0} width={padWidth} height={PAD_HEIGHT} rx={Radius.button} fill={`url(#v${uid})`} />
                    </Svg>
                )}
                <View
                    pointerEvents="none"
                    style={[styles.thumb, {
                        left: hsv.s * padWidth - THUMB / 2,
                        top: (1 - hsv.v) * PAD_HEIGHT - THUMB / 2,
                        backgroundColor: current,
                        borderColor: thumbBorder,
                    }]}
                />
            </View>

            <View
                style={styles.hue}
                {...hueResponder.panHandlers}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`${accessibilityLabel}: ${l('ton', 'hue')} ${Math.round(hsv.h)}°`}
                accessibilityHint={l('Tonu değiştirmek için yukarı veya aşağı kaydırın', 'Swipe up or down to change the hue')}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => hueStep(event.nativeEvent.actionName === 'increment' ? 12 : -12)}
            >
                {padWidth > 0 && (
                    <Svg width={padWidth} height={HUE_HEIGHT} pointerEvents="none">
                        <Defs>
                            <LinearGradient id={`h${uid}`} x1="0" y1="0" x2="1" y2="0">
                                {HUE_STOPS.map((stop, index) => (
                                    <Stop key={index} offset={index / (HUE_STOPS.length - 1)} stopColor={stop} />
                                ))}
                            </LinearGradient>
                        </Defs>
                        <Rect x={0} y={0} width={padWidth} height={HUE_HEIGHT} rx={HUE_HEIGHT / 2} fill={`url(#h${uid})`} />
                    </Svg>
                )}
                <View
                    pointerEvents="none"
                    style={[styles.hueThumb, { left: Math.min(Math.max((hsv.h / 360) * padWidth - (THUMB + 6) / 2, 0), Math.max(0, padWidth - THUMB - 6)), backgroundColor: pureHue }]}
                />
            </View>

            <View style={styles.hexRow}>
                <View style={[styles.chosen, { backgroundColor: current, borderColor: colors.border }]} />
                <TextField
                    value={hexText}
                    onChangeText={(text) => {
                        setHexText(text.toUpperCase());
                        const hex = normalizeHex(text);
                        if (hex && text.replace('#', '').length === 6) {
                            const next = hexToHsv(hex);
                            hsvRef.current = next.s === 0 ? { ...next, h: hsvRef.current.h } : next;
                            setHsv(hsvRef.current);
                            onChangeRef.current(hex);
                        }
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={7}
                    accessibilityLabel={`${accessibilityLabel}, hex`}
                    placeholder="#14998A"
                    style={styles.hexField}
                />
                <Text style={[styles.hexHint, { color: colors.textMuted }]}>HEX</Text>
            </View>
        </View>
    );
}

/** The black the brightness field fades into: a colour picker's own ink, not a theme colour. */
const PICKER_BLACK = '#000000';
/** The hue thumb's ring: white on every hue of the rainbow track. */
const PICKER_WHITE = '#ffffff';

const styles = StyleSheet.create({
    root: { gap: Spacing.md },
    pad: { height: PAD_HEIGHT, borderRadius: Radius.button, overflow: 'visible' },
    thumb: {
        position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3,
    },
    hue: { height: HUE_HEIGHT, justifyContent: 'center' },
    hueThumb: {
        position: 'absolute', top: (HUE_HEIGHT - THUMB - 6) / 2, width: THUMB + 6, height: THUMB + 6,
        borderRadius: (THUMB + 6) / 2, borderWidth: 4, borderColor: PICKER_WHITE,
    },
    hexRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    chosen: { width: 44, height: 44, borderRadius: Radius.button, borderWidth: StyleSheet.hairlineWidth },
    hexField: { flex: 1 },
    hexHint: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },
});

export interface AccentSwatch {
    /** What choosing the swatch stores. */
    value: string;
    /** The colour drawn: the accent as it will look in the current theme. */
    color: string;
    /** The colour's name, for VoiceOver and the caption under the grid. */
    label: string;
}

/**
 * The accent colours to choose from, five to a row, and after them the learner's own colour. The
 * chosen one wears a ring of its own colour and a tick. `custom` is null until a colour has been
 * picked: the last cell is then an empty circle with a plus that opens the picker.
 */
export function AccentSwatches({ swatches, value, onSelect, custom, customLabel, onPressCustom }: {
    swatches: readonly AccentSwatch[];
    value: string;
    onSelect: (value: string) => void;
    custom: { color: string; selected: boolean } | null;
    customLabel: string;
    onPressCustom: () => void;
}) {
    const colors = useThemeColors();
    const dot = (color: string, selected: boolean) => (
        <View style={[swatchStyles.ring, selected && { borderColor: color }]}>
            <View style={[swatchStyles.dot, { backgroundColor: color }]}>
                {selected ? <CheckIcon color={colors.onAccent} size={18} /> : null}
            </View>
        </View>
    );
    return (
        <View style={swatchStyles.row} accessibilityRole="radiogroup">
            {swatches.map((swatch) => {
                const selected = swatch.value === value;
                return (
                    <TouchableOpacity
                        key={swatch.value}
                        style={swatchStyles.target}
                        onPress={() => onSelect(swatch.value)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityLabel={swatch.label}
                        accessibilityState={{ checked: selected }}
                        aria-checked={selected}
                    >
                        {dot(swatch.color, selected)}
                    </TouchableOpacity>
                );
            })}
            <TouchableOpacity
                style={swatchStyles.target}
                onPress={onPressCustom}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={customLabel}
                accessibilityState={{ checked: custom?.selected ?? false }}
                aria-checked={custom?.selected ?? false}
            >
                {custom ? dot(custom.color, custom.selected) : (
                    <View style={swatchStyles.ring}>
                        <View style={[swatchStyles.dot, swatchStyles.empty, { borderColor: colors.border }]}>
                            <PlusIcon color={colors.textSecondary} size={18} />
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
}

const swatchStyles = StyleSheet.create({
    // Five to a row: nine colours and the custom one make two even rows. The cap keeps the cells
    // together in a wide window instead of spreading ten dots across a desktop card.
    row: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: 340, marginHorizontal: -Spacing.xs },
    target: { width: '20%', height: 52, alignItems: 'center', justifyContent: 'center' },
    ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    empty: { borderWidth: 1.5 },
});
