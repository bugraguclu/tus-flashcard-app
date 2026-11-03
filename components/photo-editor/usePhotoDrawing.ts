import { useMemo, useRef, useState, type RefObject } from 'react';
import {
    HIGHLIGHTER_INKS,
    TEXT_SIZES,
    keepDrawingObjectOnPage,
    type DrawingShapeTool,
    type DrawingSize,
    type DrawingTool,
} from '../../lib/drawingPad';
import type { PhotoAnnotation, PhotoPoint, PhotoText, PhotoTextStyle } from '../../lib/photoEditor';
import { DEFAULT_PHOTO_LABEL_STYLE, PHOTO_PEN_INKS } from '../../lib/photoMarkup';
import { useDrawingGestures, type DrawingBrush } from '../drawing/useDrawingGestures';
import { makeId } from './editorModel';

const DEFAULT_SIZES: Record<DrawingTool, DrawingSize> = {
    pen: 1, highlighter: 1, eraser: 1, text: 1, arrow: 1, rect: 1, ellipse: 1, cover: 1, image: 1,
};

interface PhotoDrawingDeps {
    annotations: PhotoAnnotation[];
    annotationsRef: RefObject<PhotoAnnotation[]>;
    canvasSizeRef: RefObject<{ width: number; height: number }>;
    /** Shows markup without recording it, while a finger is still on the photo. */
    applyAnnotations: (next: PhotoAnnotation[]) => void;
    /** Records the markup as it was before an edit, so the edit can be undone. */
    remember: (before: PhotoAnnotation[]) => void;
    /** Whether the photo takes drawing touches: only on the draw screen. */
    enabled: boolean;
}

type TextTarget = { point: PhotoPoint } | { id: string };

/**
 * The photo editor's draw screen: the drawing pad's tools, inks, sizes and gestures, and its
 * label card with a choice of how a label stands off the photo, on the canvas showing the
 * cropped photo.
 */
export function usePhotoDrawing({ annotations, annotationsRef, canvasSizeRef, applyAnnotations, remember, enabled }: PhotoDrawingDeps) {
    const [tool, setTool] = useState<DrawingTool>('pen');
    const [penColor, setPenColor] = useState<string>(PHOTO_PEN_INKS[0]);
    const [highlighterColor, setHighlighterColor] = useState<string>(HIGHLIGHTER_INKS[0]);
    const [sizes, setSizes] = useState<Record<DrawingTool, DrawingSize>>(DEFAULT_SIZES);
    const [labelStyle, setLabelStyle] = useState<PhotoTextStyle>(DEFAULT_PHOTO_LABEL_STYLE);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [liveAnnotation, setLiveAnnotation] = useState<PhotoAnnotation | null>(null);
    const [eraserRing, setEraserRing] = useState<{ x: number; y: number; radius: number } | null>(null);
    const [textEntry, setTextEntry] = useState<TextTarget | null>(null);
    const [moreSheet, setMoreSheet] = useState(false);

    const brushRef = useRef<DrawingBrush>({ tool, penColor, highlighterColor, sizes });
    brushRef.current = { tool, penColor, highlighterColor, sizes };

    /** Change one label, as one step of history. */
    const updateLabel = (id: string, change: (label: PhotoText) => PhotoText) => {
        const before = annotationsRef.current;
        let changed = false;
        const next = before.map((annotation) => {
            if (annotation.id !== id || annotation.type !== 'text') return annotation;
            changed = true;
            return change(annotation);
        });
        if (!changed) return;
        remember(before);
        applyAnnotations(next);
    };

    // A label opened again brings its own style into the card.
    const openText = (target: TextTarget) => {
        if ('id' in target) {
            const label = annotationsRef.current.find((annotation) => annotation.id === target.id);
            if (label?.type === 'text' && label.bgStyle) setLabelStyle(label.bgStyle);
        }
        setTextEntry(target);
    };

    const gesture = useDrawingGestures({
        annotationsRef,
        canvasSizeRef,
        brushRef,
        applyAnnotations,
        remember,
        setLiveAnnotation,
        setEraserRing,
        select: setSelectedId,
        openText,
    }, enabled);

    const selectedLabel = useMemo(() => {
        const found = selectedId ? annotations.find((annotation) => annotation.id === selectedId) : undefined;
        return found?.type === 'text' ? found : null;
    }, [annotations, selectedId]);

    const chooseTool = (next: DrawingTool) => {
        setSelectedId(null);
        setTool(next);
    };

    const changeColor = (color: string) => {
        if (tool === 'highlighter') {
            setHighlighterColor(color);
            return;
        }
        setPenColor(color);
        // A label in hand takes the colour too, the way selected text does everywhere else.
        if (selectedLabel && selectedLabel.color !== color) updateLabel(selectedLabel.id, (label) => ({ ...label, color }));
    };

    const changeSize = (size: DrawingSize) => {
        setSizes((current) => ({ ...current, [tool]: size }));
        if (selectedLabel && tool === 'text') {
            updateLabel(selectedLabel.id, (label) => keepDrawingObjectOnPage({ ...label, fontSize: TEXT_SIZES[size] }, canvasSizeRef.current));
        }
    };

    const deleteSelected = () => {
        if (!selectedLabel) return;
        remember(annotationsRef.current);
        applyAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== selectedLabel.id));
        setSelectedId(null);
    };

    const pickMoreTool = (next: DrawingShapeTool | 'image') => {
        setMoreSheet(false);
        if (next !== 'image') chooseTool(next);
    };

    const editingText = textEntry && 'id' in textEntry
        ? annotations.find((annotation): annotation is PhotoText => annotation.id === textEntry.id && annotation.type === 'text') ?? null
        : null;

    const submitText = (text: string) => {
        const entry = textEntry;
        setTextEntry(null);
        if (!entry) return;
        if ('id' in entry) {
            if (!text) {
                remember(annotationsRef.current);
                applyAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== entry.id));
                setSelectedId(null);
            } else {
                updateLabel(entry.id, (label) => keepDrawingObjectOnPage({ ...label, text, bgStyle: labelStyle }, canvasSizeRef.current));
            }
            return;
        }
        if (!text) return;
        const label = keepDrawingObjectOnPage<PhotoText>({
            id: makeId(),
            type: 'text',
            text,
            point: entry.point,
            fontSize: TEXT_SIZES[brushRef.current.sizes.text],
            bgStyle: labelStyle,
            // Placed by its middle, so it stays centred on what it names through a turn or a mirror.
            textAlign: 'center',
            color: brushRef.current.penColor,
            width: 1,
            opacity: 1,
        }, canvasSizeRef.current);
        remember(annotationsRef.current);
        applyAnnotations([...annotationsRef.current, label]);
        setSelectedId(label.id);
    };

    /** The pen in hand and nothing selected, as a new photo opens. */
    const reset = () => {
        setTool('pen');
        setPenColor(PHOTO_PEN_INKS[0]);
        setSelectedId(null);
        setLiveAnnotation(null);
        setEraserRing(null);
        setTextEntry(null);
        setMoreSheet(false);
    };

    /** Let go of a label that an undo or a reset has taken off the photo. */
    const keepSelectionIn = (next: PhotoAnnotation[]) => {
        setSelectedId((id) => (id && next.some((annotation) => annotation.id === id) ? id : null));
    };

    return {
        tool,
        chooseTool,
        color: tool === 'highlighter' ? highlighterColor : penColor,
        penColor,
        sizes,
        changeColor,
        changeSize,
        labelStyle,
        setLabelStyle,
        selectedLabel,
        select: setSelectedId,
        deleteSelected,
        keepSelectionIn,
        liveAnnotation,
        eraserRing,
        gesture,
        textEntry,
        closeText: () => setTextEntry(null),
        editingText,
        submitText,
        moreSheet,
        openMore: () => setMoreSheet(true),
        closeMore: () => setMoreSheet(false),
        pickMoreTool,
        reset,
    };
}
