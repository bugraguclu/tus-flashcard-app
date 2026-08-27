import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image as NativeImage,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Pressable,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
    Ellipse,
    Line,
    Path,
    Polygon,
    Rect,
    Text as SvgText,
} from 'react-native-svg';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import { saveMediaBytes } from '../lib/mediaStore';
import {
    clampPhotoPoint,
    findPhotoAnnotationAtPoint,
    normalizedRect,
    photoArrowHead,
    rotatePhotoAnnotationClockwise,
    type PhotoAnnotation,
    type PhotoPoint,
    type PhotoShape,
    type PhotoStroke,
} from '../lib/photoEditor';
import { useI18n } from '../hooks/useI18n';

export interface EditablePhoto {
    uri: string;
    name: string;
    width?: number;
    height?: number;
}

interface PhotoEditorModalProps {
    visible: boolean;
    photo: EditablePhoto | null;
    onClose: () => void;
    onSaved: (filename: string) => void;
}

type EditorTool = 'pen' | 'highlighter' | 'arrow' | 'rect' | 'ellipse' | 'cover' | 'text' | 'eraser';

const TOOL_ITEMS: { id: EditorTool; icon: string }[] = [
    { id: 'pen', icon: '✏️' },
    { id: 'highlighter', icon: '🖍️' },
    { id: 'arrow', icon: '↗️' },
    { id: 'rect', icon: '▭' },
    { id: 'ellipse', icon: '◯' },
    { id: 'cover', icon: '■' },
    { id: 'text', icon: 'T' },
    { id: 'eraser', icon: '⌫' },
];

const DRAW_COLORS = ['#111827', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#8b5cf6'];
const WIDTHS = [3, 6, 10];
const FONT_SIZES = [20, 30, 42];

function makeId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readUriBytes(uri: string): Promise<Uint8Array> {
    return fetch(uri).then((response) => response.arrayBuffer()).then((buffer) => new Uint8Array(buffer));
}

function smoothPath(points: PhotoPoint[], width: number, height: number): string {
    if (!points.length) return '';
    const px = (point: PhotoPoint) => ({ x: point.x * width, y: point.y * height });
    const first = px(points[0]);
    if (points.length === 1) return `M${first.x},${first.y} L${first.x + 0.01},${first.y}`;
    let path = `M${first.x},${first.y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
        const current = px(points[index]);
        const next = px(points[index + 1]);
        path += ` Q${current.x},${current.y} ${(current.x + next.x) / 2},${(current.y + next.y) / 2}`;
    }
    const last = px(points[points.length - 1]);
    return `${path} L${last.x},${last.y}`;
}

function renderAnnotation(annotation: PhotoAnnotation, width: number, height: number) {
    if (annotation.type === 'stroke') {
        return (
            <Path
                key={annotation.id}
                d={smoothPath(annotation.points, width, height)}
                stroke={annotation.color}
                strokeWidth={annotation.width}
                strokeOpacity={annotation.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        );
    }

    if (annotation.type === 'text') {
        const x = annotation.point.x * width;
        const y = annotation.point.y * height;
        const textAnchor = annotation.point.x > 0.65 ? 'end' : annotation.point.x < 0.35 ? 'start' : 'middle';
        return (
            <React.Fragment key={annotation.id}>
                <SvgText
                    x={x}
                    y={y}
                    fill={annotation.color === '#ffffff' ? '#111827' : '#ffffff'}
                    stroke={annotation.color === '#ffffff' ? '#111827' : '#ffffff'}
                    strokeWidth={Math.max(3, annotation.fontSize * 0.16)}
                    strokeLinejoin="round"
                    fontSize={annotation.fontSize}
                    fontWeight="700"
                    textAnchor={textAnchor}
                >
                    {annotation.text}
                </SvgText>
                <SvgText
                    x={x} y={y} fill={annotation.color} fontSize={annotation.fontSize}
                    fontWeight="700" textAnchor={textAnchor}
                >
                    {annotation.text}
                </SvgText>
            </React.Fragment>
        );
    }

    const start = { x: annotation.start.x * width, y: annotation.start.y * height };
    const end = { x: annotation.end.x * width, y: annotation.end.y * height };
    if (annotation.type === 'arrow') {
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 12 + annotation.width * 1.5);
        return (
            <React.Fragment key={annotation.id}>
                <Line
                    x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                    stroke={annotation.color} strokeWidth={annotation.width}
                    strokeOpacity={annotation.opacity} strokeLinecap="round"
                />
                <Polygon
                    points={head.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill={annotation.color}
                    fillOpacity={annotation.opacity}
                />
            </React.Fragment>
        );
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    if (annotation.type === 'ellipse') {
        return (
            <Ellipse
                key={annotation.id}
                cx={(rect.x + rect.width / 2) * width}
                cy={(rect.y + rect.height / 2) * height}
                rx={rect.width * width / 2}
                ry={rect.height * height / 2}
                stroke={annotation.color}
                strokeWidth={annotation.width}
                strokeOpacity={annotation.opacity}
                fill="none"
            />
        );
    }
    return (
        <Rect
            key={annotation.id}
            x={rect.x * width}
            y={rect.y * height}
            width={rect.width * width}
            height={rect.height * height}
            stroke={annotation.color}
            strokeWidth={annotation.width}
            strokeOpacity={annotation.opacity}
            fill={annotation.type === 'cover' ? annotation.color : 'none'}
            fillOpacity={annotation.type === 'cover' ? 0.96 : 0}
        />
    );
}

function drawAnnotationOnCanvas(
    ctx: CanvasRenderingContext2D,
    annotation: PhotoAnnotation,
    width: number,
    height: number,
) {
    ctx.save();
    ctx.globalAlpha = annotation.opacity;
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = annotation.width * (width / 500);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (annotation.type === 'stroke') {
        if (!annotation.points.length) return ctx.restore();
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x * width, annotation.points[0].y * height);
        for (let index = 1; index < annotation.points.length; index += 1) {
            ctx.lineTo(annotation.points[index].x * width, annotation.points[index].y * height);
        }
        ctx.stroke();
        return ctx.restore();
    }

    if (annotation.type === 'text') {
        const fontSize = annotation.fontSize * (width / 500);
        const x = annotation.point.x * width;
        const y = annotation.point.y * height;
        ctx.globalAlpha = 1;
        ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = annotation.point.x > 0.65 ? 'right' : annotation.point.x < 0.35 ? 'left' : 'center';
        ctx.strokeStyle = annotation.color === '#ffffff' ? '#111827' : '#ffffff';
        ctx.lineWidth = Math.max(3, fontSize * 0.16);
        ctx.strokeText(annotation.text, x, y);
        ctx.fillStyle = annotation.color;
        ctx.fillText(annotation.text, x, y);
        return ctx.restore();
    }

    const start = { x: annotation.start.x * width, y: annotation.start.y * height };
    const end = { x: annotation.end.x * width, y: annotation.end.y * height };
    if (annotation.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 18 + ctx.lineWidth * 1.5);
        ctx.beginPath();
        ctx.moveTo(head[0].x, head[0].y);
        ctx.lineTo(head[1].x, head[1].y);
        ctx.lineTo(head[2].x, head[2].y);
        ctx.closePath();
        ctx.fill();
        return ctx.restore();
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    if (annotation.type === 'rect') {
        ctx.strokeRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else if (annotation.type === 'cover') {
        ctx.globalAlpha = 0.96;
        ctx.fillRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else {
        ctx.beginPath();
        ctx.ellipse(
            (rect.x + rect.width / 2) * width,
            (rect.y + rect.height / 2) * height,
            rect.width * width / 2,
            rect.height * height / 2,
            0, 0, Math.PI * 2,
        );
        ctx.stroke();
    }
    ctx.restore();
}

async function rasterizePhotoWeb(
    uri: string,
    annotations: PhotoAnnotation[],
    sourceWidth: number,
    sourceHeight: number,
): Promise<Uint8Array> {
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Photo could not be loaded'));
        element.src = uri;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(image, 0, 0, width, height);
    annotations.forEach((annotation) => drawAnnotationOnCanvas(ctx, annotation, width, height));
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

export default function PhotoEditorModal({ visible, photo, onClose, onSaved }: PhotoEditorModalProps) {
    const { t, l } = useI18n();
    const toolItems = useMemo(() => [
        { ...TOOL_ITEMS[0], label: l('Kalem', 'Pen') },
        { ...TOOL_ITEMS[1], label: l('Vurgula', 'Highlighter') },
        { ...TOOL_ITEMS[2], label: l('Ok', 'Arrow') },
        { ...TOOL_ITEMS[3], label: l('Dikdörtgen', 'Rectangle') },
        { ...TOOL_ITEMS[4], label: l('Elips', 'Ellipse') },
        { ...TOOL_ITEMS[5], label: l('Ört', 'Cover') },
        { ...TOOL_ITEMS[6], label: l('Metin', 'Text') },
        { ...TOOL_ITEMS[7], label: l('Silgi', 'Eraser') },
    ], [l]);
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const canvasRef = useRef<View>(null);
    const [sourceUri, setSourceUri] = useState('');
    const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 });
    const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
    const [undoStack, setUndoStack] = useState<PhotoAnnotation[][]>([]);
    const [redoStack, setRedoStack] = useState<PhotoAnnotation[][]>([]);
    const [tool, setTool] = useState<EditorTool>('pen');
    const [color, setColor] = useState(DRAW_COLORS[2]);
    const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);
    const [fontSize, setFontSize] = useState(FONT_SIZES[1]);
    const [liveAnnotation, setLiveAnnotation] = useState<PhotoAnnotation | null>(null);
    const [textModal, setTextModal] = useState(false);
    const [textDraft, setTextDraft] = useState('');
    const [pendingText, setPendingText] = useState('');
    const [saving, setSaving] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [imageReady, setImageReady] = useState(false);

    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;
    const toolRef = useRef(tool);
    toolRef.current = tool;
    const colorRef = useRef(color);
    colorRef.current = color;
    const strokeWidthRef = useRef(strokeWidth);
    strokeWidthRef.current = strokeWidth;
    const fontSizeRef = useRef(fontSize);
    fontSizeRef.current = fontSize;
    const pendingTextRef = useRef(pendingText);
    pendingTextRef.current = pendingText;
    const gestureRef = useRef<{ start: PhotoPoint; points: PhotoPoint[] } | null>(null);

    useEffect(() => {
        if (!visible || !photo) return;
        setSourceUri(photo.uri);
        setImageReady(false);
        setAnnotations([]);
        setUndoStack([]);
        setRedoStack([]);
        setLiveAnnotation(null);
        setPendingText('');
        if (photo.width && photo.height) {
            setSourceSize({ width: photo.width, height: photo.height });
        } else {
            NativeImage.getSize(
                photo.uri,
                (width, height) => setSourceSize({ width, height }),
                () => setSourceSize({ width: 4, height: 3 }),
            );
        }
    }, [visible, photo?.uri]);

    const compact = screenHeight < 760;
    const maxCanvasWidth = Math.min(screenWidth - 16, 940);
    const maxCanvasHeight = Math.max(220, screenHeight - (compact ? 244 : 286));
    const ratio = sourceSize.width / sourceSize.height;
    const canvasSize = useMemo(() => {
        if (maxCanvasWidth / maxCanvasHeight > ratio) {
            return { width: maxCanvasHeight * ratio, height: maxCanvasHeight };
        }
        return { width: maxCanvasWidth, height: maxCanvasWidth / ratio };
    }, [maxCanvasWidth, maxCanvasHeight, ratio]);
    const canvasSizeRef = useRef(canvasSize);
    canvasSizeRef.current = canvasSize;

    const commitAnnotations = (next: PhotoAnnotation[]) => {
        setUndoStack((stack) => [...stack.slice(-29), annotationsRef.current]);
        setRedoStack([]);
        annotationsRef.current = next;
        setAnnotations(next);
    };

    const pointFromEvent = (event: any): PhotoPoint => {
        const { width, height } = canvasSizeRef.current;
        return clampPhotoPoint({
            x: event.nativeEvent.locationX / Math.max(1, width),
            y: event.nativeEvent.locationY / Math.max(1, height),
        });
    };

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
            const point = pointFromEvent(event);
            const currentTool = toolRef.current;
            if (currentTool === 'eraser') {
                const index = findPhotoAnnotationAtPoint(
                    annotationsRef.current, point, canvasSizeRef.current.width, canvasSizeRef.current.height,
                );
                if (index >= 0) commitAnnotations(annotationsRef.current.filter((_, itemIndex) => itemIndex !== index));
                return;
            }
            if (currentTool === 'text') {
                if (!pendingTextRef.current) {
                    setTextDraft('');
                    setTextModal(true);
                    return;
                }
                const safePoint = {
                    ...point,
                    y: Math.max(point.y, (fontSizeRef.current + 6) / canvasSizeRef.current.height),
                };
                const annotation: PhotoAnnotation = {
                    id: makeId(), type: 'text', point: safePoint, text: pendingTextRef.current,
                    color: colorRef.current, width: 1, opacity: 1, fontSize: fontSizeRef.current,
                };
                commitAnnotations([...annotationsRef.current, annotation]);
                setPendingText('');
                setTool('pen');
                return;
            }
            gestureRef.current = { start: point, points: [point] };
            const base = {
                id: 'live', color: colorRef.current,
                width: currentTool === 'highlighter' ? Math.max(14, strokeWidthRef.current * 3) : strokeWidthRef.current,
                opacity: currentTool === 'highlighter' ? 0.32 : 1,
            };
            if (currentTool === 'pen' || currentTool === 'highlighter') {
                setLiveAnnotation({ ...base, type: 'stroke', points: [point] });
            } else {
                setLiveAnnotation({ ...base, type: currentTool, start: point, end: point } as PhotoShape);
            }
        },
        onPanResponderMove: (event) => {
            if (!gestureRef.current) return;
            const point = pointFromEvent(event);
            const currentTool = toolRef.current;
            if (currentTool === 'pen' || currentTool === 'highlighter') {
                gestureRef.current.points.push(point);
                setLiveAnnotation((current) => current && current.type === 'stroke'
                    ? { ...current, points: [...gestureRef.current!.points] }
                    : current);
            } else {
                setLiveAnnotation((current) => current && current.type !== 'stroke' && current.type !== 'text'
                    ? { ...current, end: point }
                    : current);
            }
        },
        onPanResponderRelease: () => {
            setLiveAnnotation((current) => {
                if (current) commitAnnotations([...annotationsRef.current, { ...current, id: makeId() }]);
                return null;
            });
            gestureRef.current = null;
        },
        onPanResponderTerminate: () => {
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
    })).current;

    const undo = () => {
        setUndoStack((stack) => {
            if (!stack.length) return stack;
            const previous = stack[stack.length - 1];
            setRedoStack((redo) => [...redo.slice(-29), annotationsRef.current]);
            annotationsRef.current = previous;
            setAnnotations(previous);
            return stack.slice(0, -1);
        });
    };

    const redo = () => {
        setRedoStack((stack) => {
            if (!stack.length) return stack;
            const next = stack[stack.length - 1];
            setUndoStack((undoItems) => [...undoItems.slice(-29), annotationsRef.current]);
            annotationsRef.current = next;
            setAnnotations(next);
            return stack.slice(0, -1);
        });
    };

    const closeEditor = () => {
        if (saving || rotating) return;
        onClose();
    };

    const rotate = async () => {
        if (!sourceUri || !imageReady || rotating) return;
        setRotating(true);
        try {
            const result = await manipulateAsync(sourceUri, [{ rotate: 90 }], {
                compress: 1,
                format: SaveFormat.PNG,
            });
            setImageReady(false);
            setSourceUri(result.uri);
            setSourceSize({ width: result.width, height: result.height });
            const rotated = annotationsRef.current.map(rotatePhotoAnnotationClockwise);
            annotationsRef.current = rotated;
            setAnnotations(rotated);
            setUndoStack([]);
            setRedoStack([]);
        } catch (error) {
            console.warn('[PhotoEditor] rotate failed:', error);
            alert(t('common.error'), l('Fotoğraf döndürülemedi.', 'Could not rotate the photo.'));
        } finally {
            setRotating(false);
        }
    };

    const save = async () => {
        if (!sourceUri || !canvasRef.current || !imageReady) return;
        setSaving(true);
        try {
            const filename = sanitizeMediaFilename(`${Date.now()}_duzenlenmis.png`);
            let bytes: Uint8Array;
            if (Platform.OS === 'web') {
                bytes = await rasterizePhotoWeb(
                    sourceUri, annotationsRef.current, sourceSize.width, sourceSize.height,
                );
            } else {
                const scale = Math.min(3, 1800 / Math.max(canvasSize.width, canvasSize.height));
                const uri = await captureRef(canvasRef, {
                    format: 'png',
                    quality: 1,
                    result: 'tmpfile',
                    width: Math.round(canvasSize.width * scale),
                    height: Math.round(canvasSize.height * scale),
                });
                bytes = await readUriBytes(uri);
            }
            await saveMediaBytes(filename, bytes, 'image/png');
            onSaved(filename);
            onClose();
        } catch (error) {
            console.warn('[PhotoEditor] save failed:', error);
            alert(t('common.error'), l('Düzenlenen fotoğraf kaydedilemedi.', 'Could not save the edited photo.'));
        } finally {
            setSaving(false);
        }
    };

    const chooseTool = (nextTool: EditorTool) => {
        if (nextTool === 'text') {
            setTextDraft('');
            setTextModal(true);
        } else {
            setPendingText('');
            setTool(nextTool);
        }
    };

    const confirmText = () => {
        const value = textDraft.trim();
        if (!value) return;
        setPendingText(value);
        setTool('text');
        setTextModal(false);
    };

    const allAnnotations = liveAnnotation ? [...annotations, liveAnnotation] : annotations;
    const activeToolLabel = pendingText
        ? l('Metni yerleştirmek için fotoğrafa dokunun', 'Tap the photo to place the text')
        : tool === 'eraser'
            ? l('Silmek istediğiniz öğeye dokunun', 'Tap an item to erase it')
            : l(`${toolItems.find((item) => item.id === tool)?.label ?? 'Kalem'} seçili`, `${toolItems.find((item) => item.id === tool)?.label ?? 'Pen'} selected`);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeEditor}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={closeEditor}
                        disabled={saving || rotating}
                        accessibilityRole="button"
                        accessibilityLabel={l('Fotoğraf düzenlemeyi iptal et', 'Cancel photo editing')}
                    >
                        <Text style={styles.headerButtonText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.title}>{l('Fotoğrafı düzenle', 'Edit Photo')}</Text>
                        <Text style={styles.subtitle} numberOfLines={1}>{activeToolLabel}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.saveButton, !imageReady && styles.saveButtonDisabled]}
                        onPress={save}
                        disabled={saving || rotating || !imageReady}
                        accessibilityRole="button"
                        accessibilityLabel={l('Düzenlenen fotoğrafı kullan', 'Use edited photo')}
                    >
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.completed')}</Text>}
                    </TouchableOpacity>
                </View>

                <View style={styles.stage}>
                    <View
                        ref={canvasRef}
                        collapsable={false}
                        style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}
                        {...panResponder.panHandlers}
                    >
                        {sourceUri ? (
                            <NativeImage
                                source={{ uri: sourceUri }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="stretch"
                                onLoad={() => setImageReady(true)}
                                onError={() => {
                                    setImageReady(false);
                                    alert(t('common.error'), l('Fotoğraf editörde açılamadı.', 'Could not open the photo in the editor.'));
                                }}
                            />
                        ) : <ActivityIndicator color={colors.accent} />}
                        <Svg width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
                            {allAnnotations.map((annotation) => renderAnnotation(annotation, canvasSize.width, canvasSize.height))}
                        </Svg>
                    </View>
                </View>

                <View style={styles.controls}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolList}>
                        {toolItems.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.toolButton, tool === item.id && styles.toolButtonActive]}
                                onPress={() => chooseTool(item.id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: tool === item.id }}
                                accessibilityLabel={item.label}
                            >
                                <Text style={[styles.toolIcon, item.id === 'text' && styles.textToolIcon]}>{item.icon}</Text>
                                <Text style={[styles.toolLabel, tool === item.id && styles.toolLabelActive]}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={styles.toolButton}
                            onPress={rotate}
                            disabled={rotating || !imageReady}
                            accessibilityRole="button"
                            accessibilityLabel={l('Saat yönünde döndür', 'Rotate clockwise')}
                        >
                            {rotating ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.toolIcon}>↻</Text>}
                            <Text style={styles.toolLabel}>{l('Döndür', 'Rotate')}</Text>
                        </TouchableOpacity>
                    </ScrollView>

                    <View style={styles.optionsRow}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.colorScroll}
                            contentContainerStyle={styles.colorList}
                        >
                            {DRAW_COLORS.map((itemColor) => (
                                <TouchableOpacity
                                    key={itemColor}
                                    style={[styles.colorButton, color === itemColor && styles.colorButtonActive]}
                                    onPress={() => setColor(itemColor)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l(`Renk ${itemColor}`, `Color ${itemColor}`)}
                                >
                                    <View style={[styles.colorDot, { backgroundColor: itemColor }]} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <View style={styles.sizeGroup}>
                            {(tool === 'text' ? FONT_SIZES : WIDTHS).map((size) => (
                                <TouchableOpacity
                                    key={size}
                                    style={[
                                        styles.sizeButton,
                                        (tool === 'text' ? fontSize === size : strokeWidth === size) && styles.sizeButtonActive,
                                    ]}
                                    onPress={() => tool === 'text' ? setFontSize(size) : setStrokeWidth(size)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l(`Boyut ${size}`, `Size ${size}`)}
                                >
                                    <View style={[
                                        styles.sizeDot,
                                        {
                                            width: tool === 'text' ? Math.max(7, size / 3) : Math.max(6, size * 1.1),
                                            height: tool === 'text' ? Math.max(7, size / 3) : Math.max(6, size * 1.1),
                                            backgroundColor: colors.textPrimary,
                                        },
                                    ]} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={styles.historyButton}
                            onPress={undo}
                            disabled={!undoStack.length}
                            accessibilityRole="button"
                            accessibilityLabel={l('Geri al', 'Undo')}
                        >
                            <Text style={[styles.historyIcon, !undoStack.length && styles.disabledText]}>↶</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.historyButton}
                            onPress={redo}
                            disabled={!redoStack.length}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yinele', 'Redo')}
                        >
                            <Text style={[styles.historyIcon, !redoStack.length && styles.disabledText]}>↷</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.historyButton}
                            onPress={() => commitAnnotations([])}
                            disabled={!annotations.length}
                            accessibilityRole="button"
                            accessibilityLabel={l('Tüm düzenlemeleri temizle', 'Clear all edits')}
                        >
                            <Text style={[styles.historyIcon, !annotations.length && styles.disabledText]}>🗑</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.textOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setTextModal(false)}
                            accessibilityLabel={l('Metin penceresini kapat', 'Close text dialog')}
                        />
                        <View style={styles.textCard}>
                            <Text style={styles.textTitle}>{l('Fotoğrafa metin ekle', 'Add Text to Photo')}</Text>
                            <TextInput
                                style={styles.textInput}
                                value={textDraft}
                                onChangeText={setTextDraft}
                                placeholder={l('Örn. Aort, önemli, dikkat…', 'E.g. Aorta, important, note…')}
                                placeholderTextColor={colors.textMuted}
                                autoFocus
                                maxLength={80}
                                returnKeyType="done"
                                onSubmitEditing={confirmText}
                            />
                            <Text style={styles.textHint}>{l('Devam ettikten sonra metnin yerini fotoğrafa dokunarak seçin.', 'After continuing, tap the photo where you want to place the text.')}</Text>
                            <View style={styles.textActions}>
                                <TouchableOpacity
                                    style={styles.textCancel}
                                    onPress={() => setTextModal(false)}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.textCancelLabel}>{t('common.cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.textConfirm, !textDraft.trim() && styles.textConfirmDisabled]}
                                    onPress={confirmText}
                                    disabled={!textDraft.trim()}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.textConfirmLabel}>{l('Yerleştir', 'Place')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            </SafeAreaView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: '#111827' },
        header: {
            minHeight: 62,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: '#374151',
        },
        headerButton: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
        headerButtonText: { color: '#d1d5db', fontSize: FontSize.md, fontWeight: '600' },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
        title: { color: '#ffffff', fontSize: FontSize.lg, fontWeight: '800' },
        subtitle: { color: '#9ca3af', fontSize: FontSize.sm, marginTop: 2 },
        saveButton: {
            minWidth: 64,
            minHeight: 44,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        saveButtonText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },
        saveButtonDisabled: { opacity: 0.5 },
        stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
        canvas: { backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
        controls: {
            backgroundColor: '#1f2937',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: '#374151',
            paddingBottom: Platform.OS === 'ios' ? 8 : 12,
        },
        toolList: { paddingHorizontal: Spacing.sm, paddingVertical: 7, gap: 5 },
        toolButton: {
            width: 58,
            minHeight: 52,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
        },
        toolButtonActive: { backgroundColor: '#374151' },
        toolIcon: { color: '#f9fafb', fontSize: 21, lineHeight: 24 },
        textToolIcon: { fontWeight: '900' },
        toolLabel: { color: '#9ca3af', fontSize: 10, fontWeight: '600' },
        toolLabelActive: { color: '#ffffff' },
        optionsRow: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
            gap: 4,
        },
        colorList: { alignItems: 'center', gap: 4, paddingRight: 4 },
        colorScroll: { flex: 1 },
        colorButton: {
            width: 36,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
        },
        colorButtonActive: { backgroundColor: '#4b5563' },
        colorDot: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: '#6b7280' },
        sizeGroup: { flexDirection: 'row', alignItems: 'center' },
        sizeButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
        sizeButtonActive: { backgroundColor: '#4b5563' },
        sizeDot: { borderRadius: 999 },
        historyButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
        historyIcon: { color: '#f9fafb', fontSize: 23 },
        disabledText: { color: '#4b5563' },
        textOverlay: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: Spacing.lg,
        },
        textCard: {
            width: '100%',
            maxWidth: 460,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
        },
        textTitle: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
        textInput: {
            minHeight: 52,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgInput,
            color: colors.textPrimary,
            paddingHorizontal: Spacing.md,
            fontSize: FontSize.lg,
        },
        textHint: { color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 18 },
        textActions: { flexDirection: 'row', gap: Spacing.sm },
        textCancel: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
        textCancelLabel: { color: colors.textMuted, fontWeight: '700' },
        textConfirm: {
            flex: 1,
            minHeight: 48,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
        },
        textConfirmDisabled: { opacity: 0.45 },
        textConfirmLabel: { color: '#fff', fontWeight: '800' },
    });
}
