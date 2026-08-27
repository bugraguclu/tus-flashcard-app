// Transparent reviewer whiteboard with a compact mobile toolbar and undoable ink history.

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, PanResponder, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { saveMediaBytes } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import { useI18n } from '../hooks/useI18n';
import {
    EMPTY_WHITEBOARD_HISTORY,
    strokeHitByEraser,
    toSmoothWhiteboardPath,
    whiteboardHistoryReducer,
    type WhiteboardPoint,
    type WhiteboardStroke,
} from '../lib/whiteboardGeometry';

export interface WhiteboardHandle {
    /** Reset ink and history immediately (used when advancing to another card). */
    clear: () => void;
    /** Ask before clearing the current drawing; the operation remains undoable. */
    requestClear: () => void;
    undo: () => void;
    redo: () => void;
    save: () => Promise<void>;
    hasContent: () => boolean;
}

interface WhiteboardOverlayProps {
    /** When false, ink remains visible while all touches pass through to the reviewer. */
    active: boolean;
    /** Best-effort stylus-only input. Native PanResponder does not expose pointer type reliably. */
    stylusOnly: boolean;
    onContentChange?: (hasContent: boolean) => void;
    onToolbarHeightChange?: (height: number) => void;
    /** Height of reviewer chrome that sits above the drawable card area. */
    toolbarTopOffset?: number;
    /** Close drawing mode without discarding the ink. */
    onDone?: () => void;
}

const STROKE_COLORS = ['#e0393e', '#2f7fd6', '#2ea043', '#e8a33d', '#8e44ad', '#111111'];
const STROKE_WIDTHS = [2.5, 5, 9];
const MIN_POINT_DISTANCE_SQUARED = 2.25;
const MAX_POINTS_PER_STROKE = 6000;

type DrawingTool = 'pen' | 'eraser';

/** Web save path: replay the strokes onto a high-resolution white PNG. */
async function rasterizeStrokesToPng(strokes: WhiteboardStroke[], width: number, height: number): Promise<Uint8Array> {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d context unavailable');
    context.scale(scale, scale);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of strokes) {
        const { points } = stroke;
        if (points.length === 0) continue;
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.width;
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        if (points.length === 1) {
            context.lineTo(points[0].x + 0.01, points[0].y);
        } else {
            for (let index = 1; index < points.length - 1; index++) {
                const midpointX = (points[index].x + points[index + 1].x) / 2;
                const midpointY = (points[index].y + points[index + 1].y) / 2;
                context.quadraticCurveTo(points[index].x, points[index].y, midpointX, midpointY);
            }
            const last = points[points.length - 1];
            context.lineTo(last.x, last.y);
        }
        context.stroke();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encode failed'))), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
}

function isStylusEvent(event: any): boolean {
    const pointerType = event?.nativeEvent?.pointerType;
    if (typeof pointerType === 'string') return pointerType === 'pen';
    return true;
}

export const WhiteboardOverlay = forwardRef<WhiteboardHandle, WhiteboardOverlayProps>(
    function WhiteboardOverlay({ active, stylusOnly, onContentChange, onToolbarHeightChange, toolbarTopOffset = 0, onDone }, ref) {
        const { t, l } = useI18n();
        const colors = useThemeColors();
        const styles = useMemo(() => createStyles(colors), [colors]);
        const canvasRef = useRef<View>(null);
        const [board, dispatch] = useReducer(whiteboardHistoryReducer, EMPTY_WHITEBOARD_HISTORY);
        const [livePath, setLivePath] = useState('');
        const [tool, setTool] = useState<DrawingTool>('pen');
        const [color, setColor] = useState(STROKE_COLORS[0]);
        const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
        const [paletteOpen, setPaletteOpen] = useState(false);
        const [saving, setSaving] = useState(false);
        const [size, setSize] = useState({ width: 0, height: 0 });

        const boardRef = useRef(board);
        boardRef.current = board;
        const toolRef = useRef(tool);
        toolRef.current = tool;
        const colorRef = useRef(color);
        colorRef.current = color;
        const widthRef = useRef(strokeWidth);
        widthRef.current = strokeWidth;
        const stylusOnlyRef = useRef(stylusOnly);
        stylusOnlyRef.current = stylusOnly;
        const activeRef = useRef(active);
        activeRef.current = active;
        const pointsRef = useRef<WhiteboardPoint[]>([]);
        const livePathRef = useRef('');

        useEffect(() => { onContentChange?.(board.strokes.length > 0); }, [board.strokes.length, onContentChange]);
        useEffect(() => {
            if (!active) {
                setPaletteOpen(false);
                onToolbarHeightChange?.(0);
            }
        }, [active, onToolbarHeightChange]);

        const commitTrail = (trail: WhiteboardPoint[]) => {
            if (trail.length === 0) return;
            const current = boardRef.current.strokes;
            if (toolRef.current === 'eraser') {
                const radius = Math.max(14, widthRef.current * 3.5);
                const remaining = current.filter((stroke) => !strokeHitByEraser(stroke, trail, radius));
                if (remaining.length !== current.length) dispatch({ type: 'commit', strokes: remaining });
                return;
            }
            dispatch({
                type: 'commit',
                strokes: [...current, { points: trail, color: colorRef.current, width: widthRef.current }],
            });
        };

        const finishGesture = (commit: boolean) => {
            const trail = pointsRef.current;
            if (commit) commitTrail(trail);
            pointsRef.current = [];
            livePathRef.current = '';
            setLivePath('');
        };

        const panResponder = useRef(PanResponder.create({
            onStartShouldSetPanResponder: (event) => activeRef.current && (!stylusOnlyRef.current || isStylusEvent(event)),
            onMoveShouldSetPanResponder: (event) => activeRef.current && (!stylusOnlyRef.current || isStylusEvent(event)),
            onPanResponderGrant: (event) => {
                const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
                pointsRef.current = [point];
                livePathRef.current = `M${point.x.toFixed(1)},${point.y.toFixed(1)}`;
                setLivePath(livePathRef.current);
            },
            onPanResponderMove: (event) => {
                if (pointsRef.current.length >= MAX_POINTS_PER_STROKE) return;
                const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
                const last = pointsRef.current.at(-1);
                if (last) {
                    const dx = point.x - last.x;
                    const dy = point.y - last.y;
                    if (dx * dx + dy * dy < MIN_POINT_DISTANCE_SQUARED) return;
                }
                pointsRef.current.push(point);
                // A cheap polyline keeps long live strokes responsive. The committed stroke is
                // replaced with the smooth quadratic path when the pointer is released.
                livePathRef.current += ` L${point.x.toFixed(1)},${point.y.toFixed(1)}`;
                setLivePath(livePathRef.current);
            },
            onPanResponderRelease: () => finishGesture(true),
            onPanResponderTerminate: () => finishGesture(false),
        })).current;

        const reset = () => {
            dispatch({ type: 'reset' });
            pointsRef.current = [];
            livePathRef.current = '';
            setLivePath('');
        };
        const undo = () => dispatch({ type: 'undo' });
        const redo = () => dispatch({ type: 'redo' });
        const requestClear = () => {
            if (boardRef.current.strokes.length === 0) return;
            confirm(
                l('Yazı tahtası temizlensin mi?', 'Clear the whiteboard?'),
                l('Çizim kaldırılacak. İsterseniz işlemi geri alabilirsiniz.', 'The drawing will be removed. You can still undo it.'),
                () => dispatch({ type: 'commit', strokes: [] }),
                { destructive: true },
            );
        };
        const save = async () => {
            const strokes = boardRef.current.strokes;
            if (strokes.length === 0) {
            alert(l('Kaydedilecek bir şey yok', 'Nothing to save'), l('Önce yazı tahtasına bir şeyler çizin.', 'Draw something on the whiteboard first.'));
                return;
            }
            if (saving) return;
            setSaving(true);
            try {
                const filename = sanitizeMediaFilename(`${Date.now()}_yazitahtasi.png`);
                if (Platform.OS === 'web') {
                    const bytes = await rasterizeStrokesToPng(strokes, size.width || 420, size.height || 480);
                    await saveMediaBytes(filename, bytes, 'image/png');
                } else {
                    const uri = await captureRef(canvasRef, { format: 'png', result: 'tmpfile' });
                    await saveMediaBytes(filename, await readUriBytes(uri), 'image/png');
                }
                alert(l('Çizim kaydedildi', 'Drawing saved'), l(`Medya klasörüne kaydedildi: ${filename}`, `Saved to media: ${filename}`));
            } catch (error) {
                console.warn('[Whiteboard] save failed:', error);
                alert(t('common.error'), l('Yazı tahtası kaydedilemedi.', 'Could not save the whiteboard.'));
            } finally {
                setSaving(false);
            }
        };

        useImperativeHandle(ref, () => ({
            clear: reset,
            requestClear,
            undo,
            redo,
            save,
            hasContent: () => boardRef.current.strokes.length > 0,
        }));

        const liveColor = tool === 'eraser' ? 'rgba(110,125,118,0.38)' : color;
        const liveWidth = tool === 'eraser' ? Math.max(28, strokeWidth * 7) : strokeWidth;
        const cycleStrokeWidth = () => {
            const currentIndex = STROKE_WIDTHS.indexOf(strokeWidth);
            setStrokeWidth(STROKE_WIDTHS[(currentIndex + 1) % STROKE_WIDTHS.length]);
        };

        return (
            <View style={StyleSheet.absoluteFill} pointerEvents={active ? 'box-none' : 'none'}>
                <View
                    ref={canvasRef}
                    collapsable={false}
                    style={StyleSheet.absoluteFill}
                    onLayout={(event) => setSize({
                        width: event.nativeEvent.layout.width,
                        height: event.nativeEvent.layout.height,
                    })}
                    {...panResponder.panHandlers}
                >
                    <Svg width={size.width} height={size.height}>
                        {board.strokes.map((stroke, index) => (
                            <Path
                                key={index}
                                d={toSmoothWhiteboardPath(stroke.points)}
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
                                stroke={liveColor}
                                strokeWidth={liveWidth}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray={tool === 'eraser' ? '4 5' : undefined}
                            />
                        )}
                    </Svg>
                </View>

                {active && (
                    <View style={[styles.toolbar, { top: toolbarTopOffset + Spacing.sm }]} pointerEvents="box-none">
                        <View
                            style={styles.toolbarPanel}
                            onLayout={(event) => onToolbarHeightChange?.(event.nativeEvent.layout.height)}
                        >
                            <View style={styles.toolbarRow}>
                                <TouchableOpacity
                                    style={[styles.toolButton, tool === 'pen' && styles.toolButtonActive]}
                                    onPress={() => { setTool('pen'); setPaletteOpen(false); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Kalem', 'Pen')}
                                    accessibilityState={{ selected: tool === 'pen' }}
                                >
                                    <Text style={[styles.toolSymbol, tool === 'pen' && styles.toolSymbolActive]}>✎</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toolButton, tool === 'eraser' && styles.toolButtonActive]}
                                    onPress={() => { setTool('eraser'); setPaletteOpen(false); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Silgi', 'Eraser')}
                                    accessibilityState={{ selected: tool === 'eraser' }}
                                >
                                    <Text style={[styles.eraserSymbol, tool === 'eraser' && styles.toolSymbolActive]}>▱</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.toolButton, paletteOpen && styles.toolButtonActive]}
                                    onPress={() => { setTool('pen'); setPaletteOpen((open) => !open); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Renk paleti', 'Color palette')}
                                    accessibilityState={{ expanded: paletteOpen }}
                                >
                                    <View style={[styles.currentColor, { backgroundColor: color }]} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.toolButton}
                                    onPress={cycleStrokeWidth}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Çizgi kalınlığını değiştir', 'Change stroke width')}
                                    accessibilityHint={l('İnce, orta ve kalın arasında geçiş yapar', 'Cycles through thin, medium, and thick')}
                                >
                                    <View style={[styles.widthPreview, {
                                        height: strokeWidth,
                                        backgroundColor: tool === 'pen' ? color : colors.textSecondary,
                                    }]} />
                                </TouchableOpacity>

                                <View style={styles.divider} />
                                <TouchableOpacity
                                    style={[styles.toolButton, board.past.length === 0 && styles.toolButtonDisabled]}
                                    onPress={undo}
                                    disabled={board.past.length === 0}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Geri al', 'Undo')}
                                >
                                    <Text style={styles.historySymbol}>↶</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toolButton, board.future.length === 0 && styles.toolButtonDisabled]}
                                    onPress={redo}
                                    disabled={board.future.length === 0}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Yinele', 'Redo')}
                                >
                                    <Text style={styles.historySymbol}>↷</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toolButton, board.strokes.length === 0 && styles.toolButtonDisabled]}
                                    onPress={requestClear}
                                    disabled={board.strokes.length === 0}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Yazı tahtasını temizle', 'Clear whiteboard')}
                                >
                                    <Text style={styles.clearSymbol}>×</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.doneButton, saving && styles.toolButtonDisabled]}
                                    onPress={onDone}
                                    disabled={saving}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Çizimi bitir', 'Finish drawing')}
                                >
                                    {saving
                                        ? <ActivityIndicator size="small" color={colors.white} />
                                        : <Text style={styles.doneSymbol}>✓</Text>}
                                </TouchableOpacity>
                            </View>

                            {paletteOpen && (
                                <View style={styles.palette} accessibilityRole="toolbar">
                                    <Text style={styles.paletteLabel}>{l('Renk', 'Color')}</Text>
                                    {STROKE_COLORS.map((swatchColor) => (
                                        <TouchableOpacity
                                            key={swatchColor}
                                            style={[
                                                styles.swatchButton,
                                                color === swatchColor && styles.swatchButtonActive,
                                            ]}
                                            onPress={() => { setColor(swatchColor); setTool('pen'); }}
                                            accessibilityRole="button"
                                            accessibilityLabel={l(`Kalem rengi ${swatchColor}`, `Pen color ${swatchColor}`)}
                                            accessibilityState={{ selected: color === swatchColor }}
                                        >
                                            <View style={[styles.swatch, { backgroundColor: swatchColor }]} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
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
            left: Spacing.sm,
            right: Spacing.sm,
            alignItems: 'center',
        },
        toolbarPanel: {
            maxWidth: '100%',
            borderRadius: BorderRadius.xl,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 6,
            ...Shadows.md,
        },
        toolbarRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
        },
        toolButton: {
            width: 38,
            height: 38,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgInput,
            borderWidth: 1,
            borderColor: colors.transparent,
        },
        toolButtonActive: {
            backgroundColor: colors.accentLight,
            borderColor: colors.accent,
        },
        toolButtonDisabled: { opacity: 0.34 },
        toolSymbol: { color: colors.textPrimary, fontSize: 24, lineHeight: 26, fontWeight: '600' },
        eraserSymbol: { color: colors.textPrimary, fontSize: 22, lineHeight: 24, transform: [{ rotate: '-18deg' }] },
        toolSymbolActive: { color: colors.accent },
        historySymbol: { color: colors.textPrimary, fontSize: 25, lineHeight: 27 },
        clearSymbol: { color: colors.btnAgain, fontSize: 26, lineHeight: 27, fontWeight: '400' },
        currentColor: {
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: colors.bgCard,
            ...Shadows.sm,
        },
        widthPreview: { width: 21, minHeight: 2.5, maxHeight: 9, borderRadius: BorderRadius.full },
        divider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: 1 },
        doneButton: {
            width: 40,
            height: 38,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
            marginLeft: 1,
        },
        doneSymbol: { color: colors.white, fontSize: 21, lineHeight: 23, fontWeight: '800' },
        palette: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingTop: 7,
            marginTop: 6,
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
        },
        paletteLabel: { color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', marginHorizontal: 3 },
        swatchButton: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.transparent,
        },
        swatchButtonActive: { borderColor: colors.accent },
        swatch: { width: 22, height: 22, borderRadius: 11 },
    });
}
