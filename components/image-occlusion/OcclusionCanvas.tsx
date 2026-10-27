import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, TouchableOpacity, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { occlusionGeometry, type OcclusionShape } from '../../lib/imageOcclusion';
import OcclusionShapesSvg, { type OcclusionDraft } from './OcclusionShapesSvg';
import {
    CLOSE_POLYGON_POINTS,
    HANDLE_POINTS,
    boxBetween,
    clampView,
    fitImage,
    hitTest,
    isDrawableBox,
    resizeHandle,
    resizedBox,
    toImagePoint,
    zoomView,
    type Box,
    type OcclusionTool,
    type Point,
    type Size,
    type View as CanvasView,
} from './occlusionEditorModel';

const TAP_POINTS = 6;

interface Props {
    uri: string;
    natural: Size;
    shapes: readonly OcclusionShape[];
    selected: ReadonlySet<number>;
    tool: OcclusionTool;
    /** Taps add to and take from the selection instead of replacing it. */
    multiSelect: boolean;
    /** The polygon being drawn, in image fractions. */
    polygon: Point[];
    accent: string;
    surface: string;
    onSelectionChange: (next: Set<number>) => void;
    onCreateBox: (kind: 'rect' | 'ellipse', box: Box) => void;
    onPolygonPoint: (point: Point, closes: boolean) => void;
    onTextAt: (point: Point) => void;
    onMove: (indexes: ReadonlySet<number>, dx: number, dy: number) => void;
    onResize: (index: number, box: Box) => void;
    zoomLabels: { zoomIn: string; zoomOut: string; fit: string };
}

type Gesture =
    | { mode: 'idle' }
    | { mode: 'pinch'; distance: number; mid: Point; view: CanvasView }
    | { mode: 'pan'; start: Point; view: CanvasView; tap: boolean }
    | { mode: 'move'; start: Point; indexes: Set<number>; tapped: number; wasSelected: boolean; moved: boolean }
    | { mode: 'resize'; index: number }
    | { mode: 'draw'; kind: 'rect' | 'ellipse'; start: Point }
    | { mode: 'tap'; start: Point; view: CanvasView; moved: boolean };

/**
 * The picture with its masks, under the learner's finger: draw a box or an ellipse by dragging,
 * tap out a polygon or place a label, tap a mask to select it and drag it to move it, pull the
 * corner handle to resize. Two fingers (or the zoom buttons) zoom and pan the picture.
 */
export default function OcclusionCanvas(props: Props) {
    const { uri, natural, shapes, selected, polygon, accent, surface, zoomLabels } = props;
    const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
    const [view, setView] = useState<CanvasView>({ x: 0, y: 0, scale: 1 });
    const [offset, setOffset] = useState<Point | null>(null);
    const [dragSelection, setDragSelection] = useState<Set<number> | null>(null);
    const [draftBox, setDraftBox] = useState<{ kind: 'rect' | 'ellipse'; box: Box } | null>(null);
    const stageRef = useRef<View>(null);
    const originRef = useRef({ x: 0, y: 0 });
    const gestureRef = useRef<Gesture>({ mode: 'idle' });

    const fitted = useMemo(() => fitImage(stage, natural), [stage, natural]);
    const shown = useMemo(() => ({ width: fitted.width * view.scale, height: fitted.height * view.scale }), [fitted, view.scale]);

    // Every gesture reads the newest props and view through this ref; the responder is made once.
    const live = useRef({ props, view, fitted, shown, stage });
    live.current = { props, view, fitted, shown, stage };

    const measure = () => {
        stageRef.current?.measureInWindow((x, y) => {
            if (Number.isFinite(x) && Number.isFinite(y)) originRef.current = { x, y };
        });
    };

    const onLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setStage({ width, height });
        const box = fitImage({ width, height }, natural);
        setView((current) => clampView(current.scale === 1 ? { x: box.left, y: box.top, scale: 1 } : current, box, { width, height }));
        measure();
    };

    const responder = useMemo(() => {
        const stagePoint = (event: GestureResponderEvent): Point => ({
            x: event.nativeEvent.pageX - originRef.current.x,
            y: event.nativeEvent.pageY - originRef.current.y,
        });
        const touches = (event: GestureResponderEvent) => event.nativeEvent.touches ?? [];
        const pinchOf = (event: GestureResponderEvent) => {
            const [a, b] = touches(event);
            return {
                distance: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY),
                mid: { x: (a.pageX + b.pageX) / 2 - originRef.current.x, y: (a.pageY + b.pageY) / 2 - originRef.current.y },
            };
        };
        const reset = () => {
            setOffset(null);
            setDragSelection(null);
            setDraftBox(null);
        };
        const startPinch = (event: GestureResponderEvent) => {
            reset();
            gestureRef.current = { mode: 'pinch', ...pinchOf(event), view: live.current.view };
        };

        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (event) => {
                measure();
                if (touches(event).length >= 2) {
                    startPinch(event);
                    return;
                }
                const { props: current, view: currentView, fitted: box, shown: size } = live.current;
                const point = stagePoint(event);
                const image = toImagePoint(point, currentView, box);
                const local = { x: point.x - currentView.x, y: point.y - currentView.y };
                if (current.tool === 'rect' || current.tool === 'ellipse') {
                    gestureRef.current = { mode: 'draw', kind: current.tool, start: image };
                    return;
                }
                if (current.tool === 'polygon' || current.tool === 'text') {
                    gestureRef.current = { mode: 'tap', start: point, view: currentView, moved: false };
                    return;
                }
                const single = current.selected.size === 1 ? [...current.selected][0] : -1;
                const handle = resizeHandle(current.shapes[single], size, current.natural);
                if (handle && Math.hypot(handle.x - local.x, handle.y - local.y) <= HANDLE_POINTS) {
                    gestureRef.current = { mode: 'resize', index: single };
                    return;
                }
                const hit = hitTest(current.shapes, local, size, current.natural);
                if (hit < 0) {
                    gestureRef.current = { mode: 'pan', start: point, view: currentView, tap: true };
                    return;
                }
                const wasSelected = current.selected.has(hit);
                const indexes = new Set(wasSelected || current.multiSelect ? current.selected : []);
                indexes.add(hit);
                if (!wasSelected) current.onSelectionChange(new Set(indexes));
                gestureRef.current = { mode: 'move', start: image, indexes, tapped: hit, wasSelected, moved: false };
            },
            onPanResponderMove: (event, state) => {
                const gesture = gestureRef.current;
                if (touches(event).length >= 2 && gesture.mode !== 'pinch') {
                    startPinch(event);
                    return;
                }
                const { view: currentView, fitted: box, stage: stageSize, props: current } = live.current;
                if (gesture.mode === 'pinch') {
                    if (touches(event).length < 2) return;
                    const now = pinchOf(event);
                    const zoomed = zoomView(gesture.view, now.distance / Math.max(1, gesture.distance), gesture.mid, box, stageSize);
                    setView(clampView({ ...zoomed, x: zoomed.x + now.mid.x - gesture.mid.x, y: zoomed.y + now.mid.y - gesture.mid.y }, box, stageSize));
                    return;
                }
                const point = stagePoint(event);
                const image = toImagePoint(point, currentView, box);
                const far = Math.hypot(state.dx, state.dy) > TAP_POINTS;
                switch (gesture.mode) {
                    case 'pan':
                    case 'tap':
                        if (!far) return;
                        if (gesture.mode === 'pan') gesture.tap = false;
                        else gesture.moved = true;
                        setView(clampView({ ...gesture.view, x: gesture.view.x + state.dx, y: gesture.view.y + state.dy }, box, stageSize));
                        return;
                    case 'draw':
                        setDraftBox({ kind: gesture.kind, box: boxBetween(gesture.start, image) });
                        return;
                    case 'move':
                        if (!far && !gesture.moved) return;
                        gesture.moved = true;
                        setDragSelection(gesture.indexes);
                        setOffset({ x: image.x - gesture.start.x, y: image.y - gesture.start.y });
                        return;
                    case 'resize': {
                        const shape = current.shapes[gesture.index];
                        const resized = shape ? resizedBox(shape, image) : null;
                        const geometry = shape ? occlusionGeometry(shape) : null;
                        if (resized && geometry && (geometry.kind === 'rect' || geometry.kind === 'ellipse')) {
                            setDraftBox({ kind: geometry.kind, box: resized });
                        }
                        return;
                    }
                }
            },
            onPanResponderRelease: (event) => {
                const gesture = gestureRef.current;
                gestureRef.current = { mode: 'idle' };
                const { props: current, view: currentView, fitted: box, shown: size } = live.current;
                const point = stagePoint(event);
                const image = toImagePoint(point, currentView, box);
                const inside = image.x >= 0 && image.x <= 1 && image.y >= 0 && image.y <= 1;
                reset();
                switch (gesture.mode) {
                    case 'pan':
                        if (gesture.tap && !current.multiSelect) current.onSelectionChange(new Set());
                        return;
                    case 'tap': {
                        if (gesture.moved || !inside) return;
                        if (current.tool === 'text') {
                            current.onTextAt(image);
                            return;
                        }
                        const first = current.polygon[0];
                        const closes = current.polygon.length >= 3 && first !== undefined
                            && Math.hypot((first.x - image.x) * size.width, (first.y - image.y) * size.height) <= CLOSE_POLYGON_POINTS;
                        current.onPolygonPoint(image, closes);
                        return;
                    }
                    case 'draw': {
                        const drawn = boxBetween(gesture.start, image);
                        if (isDrawableBox(drawn, size)) current.onCreateBox(gesture.kind, drawn);
                        return;
                    }
                    case 'move':
                        if (gesture.moved) {
                            current.onMove(gesture.indexes, image.x - gesture.start.x, image.y - gesture.start.y);
                        } else if (current.multiSelect && gesture.wasSelected) {
                            const next = new Set(current.selected);
                            next.delete(gesture.tapped);
                            current.onSelectionChange(next);
                        } else if (!current.multiSelect && gesture.wasSelected && current.selected.size > 1) {
                            current.onSelectionChange(new Set([gesture.tapped]));
                        }
                        return;
                    case 'resize': {
                        const shape = current.shapes[gesture.index];
                        const resized = shape ? resizedBox(shape, image) : null;
                        if (resized && isDrawableBox(resized, size)) current.onResize(gesture.index, resized);
                    }
                }
            },
            onPanResponderTerminate: () => {
                gestureRef.current = { mode: 'idle' };
                reset();
            },
        });
    }, []);

    const zoomBy = (factor: number) => {
        const about = { x: stage.width / 2, y: stage.height / 2 };
        setView((current) => zoomView(current, factor, about, fitted, stage));
    };

    const draft: OcclusionDraft | null = draftBox ?? (polygon.length ? { kind: 'polygon', points: polygon } : null);

    return (
        <View ref={stageRef} style={[styles.stage, { backgroundColor: surface }]} onLayout={onLayout} {...responder.panHandlers}>
            {fitted.width > 0 && (
                <View style={[styles.picture, { left: view.x, top: view.y, width: shown.width, height: shown.height }]}>
                    <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" accessibilityIgnoresInvertColors />
                    <OcclusionShapesSvg
                        shapes={shapes}
                        size={shown}
                        natural={natural}
                        accent={accent}
                        selected={dragSelection ?? selected}
                        offset={offset ?? undefined}
                        draft={draft}
                    />
                </View>
            )}
            <View style={styles.zoom}>
                <ZoomButton label="−" accessibilityLabel={zoomLabels.zoomOut} onPress={() => zoomBy(1 / 1.5)} />
                <ZoomButton label="+" accessibilityLabel={zoomLabels.zoomIn} onPress={() => zoomBy(1.5)} />
                {view.scale > 1 && (
                    <ZoomButton label="⤢" accessibilityLabel={zoomLabels.fit}
                        onPress={() => setView({ x: fitted.left, y: fitted.top, scale: 1 })} />
                )}
            </View>
        </View>
    );
}

function ZoomButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.zoomButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
            <Text style={styles.zoomText}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    stage: { flex: 1, overflow: 'hidden' },
    // Kept in the stylesheet: react-native-web applies pointerEvents only from styles.
    picture: { position: 'absolute', pointerEvents: 'none' },
    zoom: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
    zoomButton: {
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    zoomText: { color: '#ffffff', fontSize: 22, fontWeight: '600', lineHeight: 26 },
});
