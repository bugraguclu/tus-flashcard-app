// Anki-style whiteboard: a transparent drawing surface laid over the reviewer card. Strokes
// are point lists rendered as smoothed SVG paths (the same midpoint-quadratic ink smoothing the
// drawing modal uses). The pencil button in the top bar toggles it; clear/undo/save are exposed
// imperatively so the ⋯ menu can drive them exactly like AnkiDroid's whiteboard entries.

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { saveMediaBytes } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import { useI18n } from '../hooks/useI18n';

export interface WhiteboardHandle {
    clear: () => void;
    undo: () => void;
    save: () => Promise<void>;
    hasContent: () => boolean;
}

interface WhiteboardOverlayProps {
    /** Pen mode. When false the ink stays visible but drawing/toolbar are off and touches pass
     *  through to the card — so toggling the pencil hides the tools without losing the drawing. */
    active: boolean;
    /** When true, only stylus/pen pointers draw (finger touches are ignored). Best-effort: the
     *  pointer type is only reliably known on web. */
    stylusOnly: boolean;
    /** Announces whether there is anything drawn, so the parent can enable/disable menu rows. */
    onContentChange?: (hasContent: boolean) => void;
}

const STROKE_COLORS = ['#e0393e', '#2f7fd6', '#2ea043', '#e8a33d', '#8e44ad', '#111111'];
const STROKE_WIDTHS = [2.5, 5, 9];
const ERASER = 'ERASER';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

/** True when the eraser trail passes within `radius` of any point in the stroke. */
function strokeHitByEraser(stroke: Stroke, eraserPts: Point[], radius: number): boolean {
    const r2 = radius * radius;
    for (const sp of stroke.points) {
        for (const ep of eraserPts) {
            const dx = sp.x - ep.x;
            const dy = sp.y - ep.y;
            if (dx * dx + dy * dy <= r2) return true;
        }
    }
    return false;
}

/** Smooth a raw pointer trail with midpoint quadratic curves (classic ink smoothing). */
function toSmoothPath(points: Point[]): string {
    if (points.length === 0) return '';
    const first = points[0];
    if (points.length === 1) {
        return `M${first.x.toFixed(1)},${first.y.toFixed(1)} L${(first.x + 0.01).toFixed(1)},${first.y.toFixed(1)}`;
    }
    let d = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
    for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        d += ` Q${points[i].x.toFixed(1)},${points[i].y.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)}`;
    }
    const last = points[points.length - 1];
    d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
    return d;
}

/** Web save path: replay the strokes onto a 2D canvas and encode a PNG. */
async function rasterizeStrokesToPng(strokes: Stroke[], width: number, height: number): Promise<Uint8Array> {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes) {
        const { points } = stroke;
        if (points.length === 0) continue;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        if (points.length === 1) {
            ctx.lineTo(points[0].x + 0.01, points[0].y);
        } else {
            for (let i = 1; i < points.length - 1; i++) {
                const midX = (points[i].x + points[i + 1].x) / 2;
                const midY = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
            }
            const last = points[points.length - 1];
            ctx.lineTo(last.x, last.y);
        }
        ctx.stroke();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encode failed'))), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

/** True when the pointer that started the gesture is a stylus (only knowable on web). */
function isStylusEvent(event: any): boolean {
    const pointerType = event?.nativeEvent?.pointerType;
    if (typeof pointerType === 'string') return pointerType === 'pen';
    // Native has no reliable finger/stylus signal here, so treat every touch as allowed.
    return true;
}

export const WhiteboardOverlay = forwardRef<WhiteboardHandle, WhiteboardOverlayProps>(
    function WhiteboardOverlay({ active, stylusOnly, onContentChange }, ref) {
        const { t, l } = useI18n();
        const colors = useThemeColors();
        const styles = useMemo(() => createStyles(colors), [colors]);
        const canvasRef = useRef<View>(null);
        const [strokes, setStrokes] = useState<Stroke[]>([]);
        const [livePath, setLivePath] = useState('');
        const [color, setColor] = useState(STROKE_COLORS[0]);
        const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
        const [size, setSize] = useState({ width: 0, height: 0 });

        // The pan responder is created once; route live toolbar values through refs so a stroke
        // never commits with a stale colour/width.
        const colorRef = useRef(color);
        colorRef.current = color;
        const widthRef = useRef(strokeWidth);
        widthRef.current = strokeWidth;
        const stylusOnlyRef = useRef(stylusOnly);
        stylusOnlyRef.current = stylusOnly;
        const activeRef = useRef(active);
        activeRef.current = active;
        const pointsRef = useRef<Point[]>([]);

        // Report content changes from an effect, never from inside a setState updater — updating
        // the parent during this component's render is what React's "setState while rendering"
        // warning flags.
        useEffect(() => { onContentChange?.(strokes.length > 0); }, [strokes.length, onContentChange]);

        const panResponder = useRef(
            PanResponder.create({
                onStartShouldSetPanResponder: (event) => activeRef.current && (!stylusOnlyRef.current || isStylusEvent(event)),
                onMoveShouldSetPanResponder: (event) => activeRef.current && (!stylusOnlyRef.current || isStylusEvent(event)),
                onPanResponderGrant: (event) => {
                    const { locationX, locationY } = event.nativeEvent;
                    pointsRef.current = [{ x: locationX, y: locationY }];
                    setLivePath(toSmoothPath(pointsRef.current));
                },
                onPanResponderMove: (event) => {
                    const { locationX, locationY } = event.nativeEvent;
                    pointsRef.current.push({ x: locationX, y: locationY });
                    setLivePath(toSmoothPath(pointsRef.current));
                },
                onPanResponderRelease: () => {
                    const trail = pointsRef.current;
                    if (trail.length > 0) {
                        if (colorRef.current === ERASER) {
                            // The board is transparent over the card, so a white "eraser stroke" would
                            // just smear white onto the dark panel. Instead, drop whole strokes the
                            // eraser passed over — that truly reveals the card underneath, like Anki.
                            const radius = widthRef.current * 3;
                            setStrokes((all) => all.filter((stroke) => !strokeHitByEraser(stroke, trail, radius)));
                        } else {
                            const stroke: Stroke = {
                                points: trail,
                                color: colorRef.current,
                                width: widthRef.current,
                            };
                            setStrokes((all) => [...all, stroke]);
                        }
                    }
                    pointsRef.current = [];
                    setLivePath('');
                },
                onPanResponderTerminate: () => {
                    pointsRef.current = [];
                    setLivePath('');
                },
            }),
        ).current;

        const clear = () => {
            setStrokes([]);
            setLivePath('');
            pointsRef.current = [];
        };
        const undo = () => setStrokes((all) => all.slice(0, -1));
        const save = async () => {
            if (strokes.length === 0) {
                alert(l('Kaydedilecek bir şey yok', 'Nothing to save'), l('Önce beyaz tahtaya bir şeyler çizin.', 'Draw something on the whiteboard first.'));
                return;
            }
            try {
                const filename = sanitizeMediaFilename(`${Date.now()}_beyaztahta.png`);
                if (Platform.OS === 'web') {
                    const bytes = await rasterizeStrokesToPng(strokes, size.width || 420, size.height || 480);
                    await saveMediaBytes(filename, bytes, 'image/png');
                } else {
                    const uri = await captureRef(canvasRef, { format: 'png', result: 'tmpfile' });
                    const bytes = await readUriBytes(uri);
                    await saveMediaBytes(filename, bytes, 'image/png');
                }
                alert(l('Beyaz tahta kaydedildi', 'Whiteboard saved'), l(`Çizim medya olarak kaydedildi: ${filename}`, `Saved to media as ${filename}.`));
            } catch (e) {
                console.warn('[Whiteboard] save failed:', e);
                alert(t('common.error'), l('Beyaz tahta kaydedilemedi.', 'Could not save the whiteboard.'));
            }
        };

        useImperativeHandle(ref, () => ({ clear, undo, save, hasContent: () => strokes.length > 0 }), [strokes, size]);

        // While erasing, the trail is only a hint (a translucent grey brush) — the actual strokes
        // it crosses are removed on release, so nothing white is ever painted onto the card.
        const strokeColor = color === ERASER ? 'rgba(140,140,140,0.45)' : color;
        const liveWidth = color === ERASER ? strokeWidth * 3 : strokeWidth;

        return (
            // Pen off: ignore touches entirely so the card/answer buttons work while the ink stays
            // visible. Pen on: box-none lets the canvas and toolbar capture, not the empty margins.
            <View style={StyleSheet.absoluteFill} pointerEvents={active ? 'box-none' : 'none'}>
                <View
                    ref={canvasRef}
                    collapsable={false}
                    style={StyleSheet.absoluteFill}
                    onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                    {...panResponder.panHandlers}
                >
                    <Svg width={size.width} height={size.height}>
                        {strokes.map((stroke, i) => (
                            <Path
                                key={i}
                                d={toSmoothPath(stroke.points)}
                                stroke={stroke.color}
                                strokeWidth={stroke.width}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ))}
                        {livePath !== '' && (
                            <Path
                                d={livePath}
                                stroke={strokeColor}
                                strokeWidth={liveWidth}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        )}
                    </Svg>
                </View>

                {active && (
                <View style={styles.toolbar} pointerEvents="box-none">
                    <View style={styles.toolbarInner}>
                        {STROKE_COLORS.map((c) => (
                            <TouchableOpacity
                                key={c}
                                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
                                onPress={() => setColor(c)}
                                accessibilityRole="button"
                                accessibilityLabel={l(`Kalem rengi ${c}`, `Pen color ${c}`)}
                            />
                        ))}
                        <TouchableOpacity
                            style={[styles.toolBtn, color === ERASER && styles.toolBtnActive]}
                            onPress={() => setColor(ERASER)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Silgi', 'Eraser')}
                        >
                            <Text style={styles.toolIcon}>🧽</Text>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        {STROKE_WIDTHS.map((w) => (
                            <TouchableOpacity
                                key={w}
                                style={[styles.widthBtn, strokeWidth === w && styles.widthBtnActive]}
                                onPress={() => setStrokeWidth(w)}
                                accessibilityRole="button"
                                accessibilityLabel={l(`Kalem kalınlığı ${w}`, `Pen width ${w}`)}
                            >
                                <View style={{ width: Math.max(6, w * 1.6), height: Math.max(6, w * 1.6), borderRadius: 999, backgroundColor: strokeWidth === w ? colors.accent : colors.textMuted }} />
                            </TouchableOpacity>
                        ))}
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.toolBtn} onPress={undo} accessibilityRole="button" accessibilityLabel={l('Geri al', 'Undo')}>
                            <Text style={styles.toolIcon}>↩︎</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolBtn} onPress={clear} accessibilityRole="button" accessibilityLabel={l('Temizle', 'Clear')}>
                            <Text style={styles.toolIcon}>🗑️</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                )}
            </View>
        );
    },
);

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        toolbar: {
            position: 'absolute',
            top: Spacing.sm,
            left: 0,
            right: 0,
            alignItems: 'center',
        },
        toolbarInner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            ...Shadows.md,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: '96%',
        },
        swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
        swatchActive: { borderColor: colors.accent },
        toolBtn: {
            minWidth: 34,
            height: 34,
            paddingHorizontal: 6,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        toolBtnActive: { backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent },
        toolIcon: { fontSize: 16 },
        widthBtn: {
            width: 34,
            height: 34,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        widthBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        divider: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 2 },
    });
}
