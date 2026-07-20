// Freehand drawing modal. Strokes are stored as point lists and rendered as smoothed
// SVG paths (midpoint quadratics). Saving rasterizes to PNG: native captures the canvas
// view, web replays the strokes onto a 2D canvas — so the feature works on both.

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, PanResponder, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { saveMediaBytes } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';

interface DrawingCanvasModalProps {
    visible: boolean;
    onClose: () => void;
    /** Called with the saved media filename once a drawing is kept. */
    onSaved: (filename: string) => void;
}

const CANVAS_HEIGHT = 320;
const CANVAS_BG = '#ffffff';
const STROKE_COLORS = ['#1a1a1a', '#e0393e', '#2f7fd6', '#2ea043', '#e8a33d', '#8e44ad'];
const STROKE_WIDTHS = [
    { label: 'İnce', width: 2.5 },
    { label: 'Orta', width: 5 },
    { label: 'Kalın', width: 9 },
];
const ERASER = 'ERASER';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

/** Smooth a raw pointer trail with midpoint quadratic curves (classic ink smoothing). */
function toSmoothPath(points: Point[]): string {
    if (points.length === 0) return '';
    const first = points[0];
    if (points.length === 1) {
        // A tap leaves a dot: zero-length lines vanish, so nudge the endpoint.
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
    const scale = 2; // crisp on high-DPI screens
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    ctx.scale(scale, scale);
    ctx.fillStyle = CANVAS_BG;
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

export default function DrawingCanvasModal({ visible, onClose, onSaved }: DrawingCanvasModalProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const canvasRef = useRef<View>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [livePath, setLivePath] = useState('');
    const [color, setColor] = useState(STROKE_COLORS[0]);
    const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1].width);
    const [saving, setSaving] = useState(false);
    const [canvasWidth, setCanvasWidth] = useState(0);

    // The pan responder is created once, so its callbacks would close over the first
    // render's color/width and every stroke would commit thin and black no matter what
    // the toolbar shows (the old "kalın çiziyor ama ince kaydediyor" bug). Route all
    // reads through refs that each render keeps current.
    const colorRef = useRef(color);
    colorRef.current = color;
    const widthRef = useRef(strokeWidth);
    widthRef.current = strokeWidth;
    const pointsRef = useRef<Point[]>([]);

    const strokeColor = color === ERASER ? CANVAS_BG : color;
    const liveWidth = color === ERASER ? strokeWidth * 2.5 : strokeWidth;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
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
                if (pointsRef.current.length > 0) {
                    const isEraser = colorRef.current === ERASER;
                    const stroke: Stroke = {
                        points: pointsRef.current,
                        color: isEraser ? CANVAS_BG : colorRef.current,
                        width: isEraser ? widthRef.current * 2.5 : widthRef.current,
                    };
                    setStrokes((all) => [...all, stroke]);
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

    const reset = () => {
        setStrokes([]);
        setLivePath('');
        pointsRef.current = [];
    };

    const closeAndReset = () => {
        reset();
        onClose();
    };

    const undo = () => setStrokes((all) => all.slice(0, -1));

    const handleSave = async () => {
        if (strokes.length === 0) {
            alert('Uyarı', 'Kaydetmeden önce bir şeyler çizin.');
            return;
        }
        setSaving(true);
        try {
            const filename = sanitizeMediaFilename(`${Date.now()}_cizim.png`);
            if (Platform.OS === 'web') {
                const bytes = await rasterizeStrokesToPng(strokes, canvasWidth || 420, CANVAS_HEIGHT);
                await saveMediaBytes(filename, bytes, 'image/png');
            } else {
                const uri = await captureRef(canvasRef, { format: 'png', result: 'tmpfile' });
                const bytes = await readUriBytes(uri);
                await saveMediaBytes(filename, bytes, 'image/png');
            }
            onSaved(filename);
            closeAndReset();
        } catch (e) {
            console.warn('[DrawingCanvasModal] save failed:', e);
            alert('Hata', 'Çizim kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={closeAndReset}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>✏️ Çizim</Text>

                    <View
                        ref={canvasRef}
                        collapsable={false}
                        style={styles.canvas}
                        onLayout={(e) => setCanvasWidth(e.nativeEvent.layout.width)}
                        {...panResponder.panHandlers}
                    >
                        <Svg width={canvasWidth} height={CANVAS_HEIGHT}>
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

                    <View style={styles.toolRow}>
                        {STROKE_COLORS.map((c) => (
                            <TouchableOpacity
                                key={c}
                                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
                                onPress={() => setColor(c)}
                                accessibilityRole="button"
                                accessibilityLabel={`Renk ${c}`}
                            />
                        ))}
                        <TouchableOpacity
                            style={[styles.eraserBtn, color === ERASER && styles.swatchActive]}
                            onPress={() => setColor(ERASER)}
                            accessibilityRole="button"
                            accessibilityLabel="Silgi"
                        >
                            <Text style={styles.eraserText}>🧽</Text>
                        </TouchableOpacity>

                        <View style={styles.toolSpacer} />

                        {STROKE_WIDTHS.map((option) => (
                            <TouchableOpacity
                                key={option.label}
                                style={[styles.widthBtn, strokeWidth === option.width && styles.widthBtnActive]}
                                onPress={() => setStrokeWidth(option.width)}
                                accessibilityRole="button"
                                accessibilityLabel={`Kalınlık: ${option.label}`}
                                {...(Platform.OS === 'web' ? { title: option.label } : {})}
                            >
                                <View
                                    style={{
                                        width: Math.max(6, option.width * 1.6),
                                        height: Math.max(6, option.width * 1.6),
                                        borderRadius: 999,
                                        backgroundColor: strokeWidth === option.width
                                            ? colors.accent
                                            : colors.textMuted,
                                    }}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.smallBtn} onPress={undo} disabled={strokes.length === 0}>
                            <Text style={styles.smallBtnText}>↩️ Geri Al</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smallBtn} onPress={reset} disabled={strokes.length === 0}>
                            <Text style={styles.smallBtnText}>🗑️ Temizle</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footerRow}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeAndReset} disabled={saving}>
                            <Text style={styles.cancelText}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                            <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor…' : '💾 Kaydet'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.lg,
        },
        card: {
            width: '100%',
            maxWidth: 520,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.sm,
            ...Shadows.lg,
        },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        canvas: {
            height: CANVAS_HEIGHT,
            backgroundColor: CANVAS_BG,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? ({ cursor: 'crosshair', touchAction: 'none', userSelect: 'none' } as object) : null),
        },
        toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.xs },
        toolSpacer: { flex: 1 },
        swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
        swatchActive: { borderColor: colors.accent },
        eraserBtn: {
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: 'transparent',
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        eraserText: { fontSize: 14 },
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
        actionRow: { flexDirection: 'row', gap: Spacing.sm },
        smallBtn: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: 8,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
        },
        smallBtnText: { fontSize: FontSize.sm, color: colors.textSecondary },
        footerRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
        cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
        saveBtn: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
        },
        saveBtnText: { color: colors.white, fontWeight: '700' },
    });
}
