import { useMemo, useRef, type RefObject } from 'react';
import { Gesture as Gestures, type GestureTouchEvent } from 'react-native-gesture-handler';
import {
    applyPhotoEraserSweep,
    isPhotoShapeDragCommittable,
    type PhotoAnnotation,
    type PhotoImage,
    type PhotoPoint,
    type PhotoShape,
    type PhotoStroke,
    type PhotoText,
} from '../../lib/photoEditor';
import {
    HIGHLIGHTER_OPACITY,
    drawingObjectAt,
    drawingPointFromPage,
    drawingToolWidth,
    drawingTouchEvent,
    followedTouch,
    isDrawingShapeTool,
    keepDrawingObjectOnPage,
    moveDrawingObject,
    pageFinger,
    shouldAddDrawingPoint,
    type DrawingSize,
    type DrawingTool,
    type PageFinger,
} from '../../lib/drawingPad';
import { makeId } from '../photo-editor/editorModel';

/** What a touch on the page reads: the tool in hand and how it is set. */
export interface DrawingBrush {
    tool: DrawingTool;
    penColor: string;
    highlighterColor: string;
    sizes: Record<DrawingTool, DrawingSize>;
}

export interface DrawingGestureDeps {
    annotationsRef: RefObject<PhotoAnnotation[]>;
    canvasSizeRef: RefObject<{ width: number; height: number }>;
    brushRef: RefObject<DrawingBrush>;
    applyAnnotations: (next: PhotoAnnotation[]) => void;
    /** Records the page as it was before an edit, so the edit can be undone. */
    remember: (before: PhotoAnnotation[]) => void;
    setLiveAnnotation: (annotation: PhotoAnnotation | null) => void;
    setEraserRing: (ring: { x: number; y: number; radius: number } | null) => void;
    select: (id: string | null) => void;
    /** Opens the text card: for a new label at a point, or to change an existing one. */
    openText: (target: { point: PhotoPoint } | { id: string }) => void;
}

type Gesture =
    | { kind: 'stroke'; origin: PhotoPoint; last: PhotoPoint; stroke: PhotoStroke; before: PhotoAnnotation[] }
    | { kind: 'erase'; origin: PhotoPoint; last: PhotoPoint; erased: boolean; before: PhotoAnnotation[] }
    | { kind: 'shape'; origin: PhotoPoint; shape: PhotoShape; before: PhotoAnnotation[] }
    | { kind: 'drag'; origin: PhotoPoint; start: PhotoPoint; object: PhotoText | PhotoImage; moved: boolean; before: PhotoAnnotation[] }
    | { kind: 'tap'; origin: PhotoPoint; start: PhotoPoint; moved: boolean };

/** A finger that travels less than this is a tap, not a drag. */
const TAP_SLOP = 6;

/**
 * Every touch on the page: drawing, erasing, dragging out a shape, and picking up, moving or
 * opening a label or a picture.
 *
 * The page is a native gesture rather than a JS responder. React Native gives the whole screen a
 * single responder, so a finger resting on the toolbar held it and a stroke begun beside it was
 * lost; the page's own recognizer sees only the fingers on the page, whatever else is on the glass.
 *
 * Everything on the page ignores touches, so `location` is measured from the page itself and the
 * page's origin falls out of the very touch that starts a gesture. The gesture is rebuilt only when
 * `enabled` changes (the photo editor turns it off outside its Draw screen); the handlers read the
 * screen's current state through `deps`, which is refreshed every render.
 */
export function useDrawingGestures(deps: DrawingGestureDeps, enabled = true) {
    const depsRef = useRef(deps);
    depsRef.current = deps;
    const gestureRef = useRef<Gesture | null>(null);
    // The finger that began the gesture; any other on the glass is ignored until it lifts.
    const fingerRef = useRef<number | string | undefined>(undefined);

    const eraseAlong = (gesture: Extract<Gesture, { kind: 'erase' }>, from: PhotoPoint, to: PhotoPoint) => {
        const { canvasSizeRef, brushRef, annotationsRef, applyAnnotations, setEraserRing } = depsRef.current;
        const { width, height } = canvasSizeRef.current;
        const radius = drawingToolWidth('eraser', brushRef.current.sizes.eraser);
        setEraserRing({ x: to.x * width, y: to.y * height, radius });
        const result = applyPhotoEraserSweep(annotationsRef.current, from, to, width, height, radius, 'partial');
        if (!result.changed) return;
        gesture.erased = true;
        applyAnnotations(result.annotations);
    };

    const begin = (native: PageFinger) => {
        const { annotationsRef, canvasSizeRef, brushRef, setLiveAnnotation, select } = depsRef.current;
        fingerRef.current = native.identifier;
        const origin = { x: native.pageX - native.locationX, y: native.pageY - native.locationY };
        const point = drawingPointFromPage({ x: native.pageX, y: native.pageY }, origin, canvasSizeRef.current);
        const brush = brushRef.current;
        const before = annotationsRef.current;

        if (brush.tool === 'text' || brush.tool === 'image') {
            const object = drawingObjectAt(before, point, canvasSizeRef.current);
            if (object) {
                select(object.id);
                gestureRef.current = { kind: 'drag', origin, start: point, object, moved: false, before };
                return;
            }
            select(null);
            if (brush.tool === 'text') gestureRef.current = { kind: 'tap', origin, start: point, moved: false };
            return;
        }

        select(null);
        if (brush.tool === 'eraser') {
            const gesture: Gesture = { kind: 'erase', origin, last: point, erased: false, before };
            gestureRef.current = gesture;
            eraseAlong(gesture, point, point);
            return;
        }
        if (isDrawingShapeTool(brush.tool)) {
            const shape: PhotoShape = {
                id: makeId(),
                type: brush.tool,
                start: point,
                end: point,
                color: brush.penColor,
                width: brush.tool === 'cover' ? 2 : drawingToolWidth(brush.tool, brush.sizes[brush.tool]),
                opacity: 1,
            };
            gestureRef.current = { kind: 'shape', origin, shape, before };
            setLiveAnnotation(shape);
            return;
        }
        const highlighter = brush.tool === 'highlighter';
        const stroke: PhotoStroke = {
            id: makeId(),
            type: 'stroke',
            color: highlighter ? brush.highlighterColor : brush.penColor,
            width: drawingToolWidth(brush.tool, brush.sizes[brush.tool]),
            opacity: highlighter ? HIGHLIGHTER_OPACITY : 1,
            points: [point],
        };
        gestureRef.current = { kind: 'stroke', origin, last: point, stroke, before };
        setLiveAnnotation(stroke);
    };

    const extend = (event: GestureTouchEvent) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const { canvasSizeRef, annotationsRef, applyAnnotations, setLiveAnnotation } = depsRef.current;
        const canvas = canvasSizeRef.current;
        const finger = followedTouch(drawingTouchEvent(event), fingerRef.current);
        if (!finger) return;
        const point = drawingPointFromPage({ x: finger.pageX, y: finger.pageY }, gesture.origin, canvas);

        if (gesture.kind === 'tap' || gesture.kind === 'drag') {
            const travelled = Math.hypot((point.x - gesture.start.x) * canvas.width, (point.y - gesture.start.y) * canvas.height);
            if (!gesture.moved && travelled < TAP_SLOP) return;
            gesture.moved = true;
            if (gesture.kind === 'drag') {
                const moved = keepDrawingObjectOnPage(moveDrawingObject(gesture.object, gesture.start, point), canvas);
                applyAnnotations(annotationsRef.current.map((annotation) => (annotation.id === moved.id ? moved : annotation)));
            }
            return;
        }
        if (gesture.kind === 'shape') {
            gesture.shape = { ...gesture.shape, end: point };
            setLiveAnnotation(gesture.shape);
            return;
        }
        if (!shouldAddDrawingPoint(gesture.last, point, canvas)) return;
        const from = gesture.last;
        gesture.last = point;
        if (gesture.kind === 'erase') {
            eraseAlong(gesture, from, point);
            return;
        }
        gesture.stroke = { ...gesture.stroke, points: [...gesture.stroke.points, point] };
        setLiveAnnotation(gesture.stroke);
    };

    const finish = () => {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        fingerRef.current = undefined;
        const { annotationsRef, canvasSizeRef, applyAnnotations, remember, setLiveAnnotation, setEraserRing, openText } = depsRef.current;
        setEraserRing(null);
        setLiveAnnotation(null);
        if (!gesture) return;
        const canvas = canvasSizeRef.current;

        switch (gesture.kind) {
            case 'stroke': {
                const points = gesture.stroke.points;
                // A tap leaves a dot. The PNG is drawn as a polyline, and a one-point line draws
                // nothing, so the dot is given a second point a hair away.
                const finished = {
                    ...gesture.stroke,
                    points: points.length === 1 ? [points[0], { x: points[0].x + 0.0005, y: points[0].y }] : points,
                };
                remember(gesture.before);
                applyAnnotations([...annotationsRef.current, finished]);
                return;
            }
            case 'erase':
                if (gesture.erased) remember(gesture.before);
                return;
            case 'shape':
                // A tap with a shape tool is not a shape; nothing is added for it.
                if (!isPhotoShapeDragCommittable(gesture.shape.start, gesture.shape.end, canvas.width, canvas.height)) return;
                remember(gesture.before);
                applyAnnotations([...annotationsRef.current, gesture.shape]);
                return;
            case 'drag':
                if (gesture.moved) remember(gesture.before);
                else if (gesture.object.type === 'text') openText({ id: gesture.object.id });
                return;
            case 'tap':
                if (!gesture.moved) openText({ point: gesture.start });
        }
    };

    return useMemo(() => Gestures.Manual()
        .runOnJS(true)
        .enabled(enabled)
        // The page takes hold at once, so a stroke starts under the finger rather than after a
        // slop, and the toolbar button a resting finger was pressing lets go instead of firing.
        .onTouchesDown((event, manager) => {
            manager.activate();
            // A palm or second finger set down mid-stroke is not a new stroke.
            if (gestureRef.current || fingerRef.current !== undefined || !event.changedTouches.length) return;
            begin(pageFinger(event.changedTouches[0]));
        })
        .onTouchesMove(extend)
        .onTouchesUp((event, manager) => {
            // The lift can arrive with a position no move reported, so the gesture is taken that
            // far before it is finished; otherwise a quick flick ends short of where it left.
            if (event.changedTouches.some((touch) => touch.id === fingerRef.current)) {
                extend(event);
                finish();
            }
            if (event.numberOfTouches === 0) manager.end();
        })
        .onFinalize(() => {
            // Cancelled by the system, or the page going away mid-stroke: keep what was drawn.
            if (gestureRef.current) finish();
            fingerRef.current = undefined;
        }), [enabled]);
}
