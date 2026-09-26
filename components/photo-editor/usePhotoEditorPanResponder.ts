import { useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import {
    applyPhotoEraserSweep,
    clampCropRect,
    clampPhotoPoint,
    clampPhotoTextSize,
    findPhotoSelectionHandle,
    isPhotoShapeDragCommittable,
    isPointInPhotoImage,
    isPointInPhotoText,
    isPointInPhotoTrashZone,
    normalizePhotoRotation,
    photoHandleTouchRadius,
    photoRotateHandleSide,
    photoPointerAngle,
    photoSelectionHandlePoints,
    photoTrashZoneRect,
    resizePhotoImage,
    resizePhotoImageByHandle,
    resizePhotoTextByHandle,
    resolvePhotoDragSnap,
    resolvePhotoHandleRotation,
    resolvePhotoTextDragRelease,
    type PhotoAnnotation,
    type PhotoCornerHandle,
    type PhotoCropRect,
    type PhotoEraserMode,
    type PhotoImage,
    type PhotoPoint,
    type PhotoSelectionHandle,
    type PhotoShape,
    type PhotoText,
    type PhotoTextAlign,
    type PhotoTextStyle,
} from '../../lib/photoEditor';
import {
    DOUBLE_TAP_MS,
    PINCH_ACTIVATION_PX,
    makeId,
    objectById,
    selectionCentreOffset,
    selectionGeometryFor,
    tick,
    type EditorHistoryState,
    type EditorTool,
} from './editorModel';

/** The screen state and actions the canvas gestures read and drive. */
export interface PhotoEditorGestureDeps {
    annotationsRef: RefObject<PhotoAnnotation[]>;
    toolRef: RefObject<EditorTool>;
    colorRef: RefObject<string>;
    strokeWidthRef: RefObject<number>;
    selectedIdRef: RefObject<string | null>;
    cropBoxRef: RefObject<PhotoCropRect>;
    eraserRadiusRef: RefObject<number>;
    eraserModeRef: RefObject<PhotoEraserMode>;
    canvasSizeRef: RefObject<{ width: number; height: number }>;
    textDropPointRef: RefObject<PhotoPoint | null>;
    addPictureRef: RefObject<(at: PhotoPoint) => void>;
    editSelectedTextRef: RefObject<() => void>;
    setAnnotations: Dispatch<SetStateAction<PhotoAnnotation[]>>;
    setColor: Dispatch<SetStateAction<string>>;
    setFontSize: Dispatch<SetStateAction<number>>;
    setLiveAnnotation: Dispatch<SetStateAction<PhotoAnnotation | null>>;
    setTextModal: Dispatch<SetStateAction<boolean>>;
    setTextDraft: Dispatch<SetStateAction<string>>;
    setTextBgStyle: Dispatch<SetStateAction<PhotoTextStyle>>;
    setTextAlign: Dispatch<SetStateAction<PhotoTextAlign>>;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
    setEraserCursor: Dispatch<SetStateAction<{ x: number; y: number; radius: number } | null>>;
    setIsDraggingSelection: Dispatch<SetStateAction<boolean>>;
    setActiveHandle: Dispatch<SetStateAction<PhotoSelectionHandle | null>>;
    setRotationPreview: Dispatch<SetStateAction<number | null>>;
    setCropBox: Dispatch<SetStateAction<PhotoCropRect>>;
    updateTrashHovered: (next: boolean) => void;
    updateSnapGuides: (next: { x: boolean; y: boolean }) => void;
    pushHistory: (snapshot: EditorHistoryState) => void;
    snapshotEditor: () => EditorHistoryState;
    commitAnnotations: (next: PhotoAnnotation[]) => void;
    pointFromEvent: (event: GestureResponderEvent) => PhotoPoint;
    selectAnnotation: (id: string) => void;
}

/**
 * Every touch on the canvas: drawing, erasing, cropping, and moving, resizing, turning or
 * pinching a label or a picture.
 *
 * The responder is built once, on the first render, so everything it reads that changes is read
 * through a ref; the gesture-in-progress state below lives only here.
 */
export function usePhotoEditorPanResponder({
    annotationsRef,
    toolRef,
    colorRef,
    strokeWidthRef,
    selectedIdRef,
    cropBoxRef,
    eraserRadiusRef,
    eraserModeRef,
    canvasSizeRef,
    textDropPointRef,
    addPictureRef,
    editSelectedTextRef,
    setAnnotations,
    setColor,
    setFontSize,
    setLiveAnnotation,
    setTextModal,
    setTextDraft,
    setTextBgStyle,
    setTextAlign,
    setSelectedId,
    setEraserCursor,
    setIsDraggingSelection,
    setActiveHandle,
    setRotationPreview,
    setCropBox,
    updateTrashHovered,
    updateSnapGuides,
    pushHistory,
    snapshotEditor,
    commitAnnotations,
    pointFromEvent,
    selectAnnotation,
}: PhotoEditorGestureDeps) {
    const gestureRef = useRef<{ start: PhotoPoint; points: PhotoPoint[] } | null>(null);
    const erasedInCurrentGestureRef = useRef(false);
    const gestureStartAnnotationsRef = useRef<PhotoAnnotation[] | null>(null);
    const cropDragRef = useRef<{
        mode: 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'new';
        initialBox: PhotoCropRect;
        startPoint: PhotoPoint;
    } | null>(null);
    const dragRef = useRef<{
        id: string;
        startPoint: PhotoPoint;
        initialPoint: PhotoPoint;
        hasMoved: boolean;
        /**
         * Where the finger was last seen, so the release can re-run the bin's hit test on state
         * the responder owns instead of on a rendered value it cannot see.
         */
        lastPoint: PhotoPoint | null;
        /** Where the middle of the frame sits relative to the point being dragged. */
        centreOffset: { x: number; y: number };
    } | null>(null);
    /**
     * A corner of the frame being pulled. The annotation is kept as it was when the corner was
     * taken hold of, so every sample of the drag is measured from that one box rather than from
     * the box the previous sample produced — the same reason a pinch keeps its starting size.
     */
    const handleDragRef = useRef<{
        handle: PhotoCornerHandle;
        annotation: PhotoText | PhotoImage;
        beforeAnnotations: PhotoAnnotation[];
        applied: boolean;
    } | null>(null);
    /** The knob being turned, and how far round the finger was from the object when it grabbed. */
    const rotateDragRef = useRef<{
        id: string;
        grabOffset: number;
        beforeAnnotations: PhotoAnnotation[];
        applied: boolean;
        snapped: boolean;
    } | null>(null);
    /** The last tap on a label, so a second one on the same label opens it for editing. */
    const lastTapRef = useRef<{ id: string; at: number } | null>(null);
    const pinchRef = useRef<{
        id: string;
        startDistance: number;
        startAngle: number;
        /** Labels grow by their font size, pictures by their box; only one of these is used. */
        initialFontSize: number;
        initialBox: { width: number; height: number } | null;
        initialRotation: number;
        beforeAnnotations: PhotoAnnotation[];
        applied: boolean;
    } | null>(null);

    return useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
            const point = pointFromEvent(event);
            const currentTool = toolRef.current;

            if (currentTool === 'crop') {
                const box = cropBoxRef.current;
                const { width: cW, height: cH } = canvasSizeRef.current;
                const px = point.x * cW;
                const py = point.y * cH;
                const boxLeft = box.x * cW;
                const boxTop = box.y * cH;
                const boxRight = (box.x + box.width) * cW;
                const boxBottom = (box.y + box.height) * cH;
                const handleR = 30;
                const edgeR = 20;

                let mode: 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'new' = 'new';
                if (Math.hypot(px - boxLeft, py - boxTop) < handleR) mode = 'tl';
                else if (Math.hypot(px - boxRight, py - boxTop) < handleR) mode = 'tr';
                else if (Math.hypot(px - boxLeft, py - boxBottom) < handleR) mode = 'bl';
                else if (Math.hypot(px - boxRight, py - boxBottom) < handleR) mode = 'br';
                else if (Math.abs(py - boxTop) < edgeR && px >= boxLeft && px <= boxRight) mode = 't';
                else if (Math.abs(py - boxBottom) < edgeR && px >= boxLeft && px <= boxRight) mode = 'b';
                else if (Math.abs(px - boxLeft) < edgeR && py >= boxTop && py <= boxBottom) mode = 'l';
                else if (Math.abs(px - boxRight) < edgeR && py >= boxTop && py <= boxBottom) mode = 'r';
                else if (px > boxLeft && px < boxRight && py > boxTop && py < boxBottom) mode = 'move';

                cropDragRef.current = {
                    mode,
                    initialBox: { ...box },
                    startPoint: point,
                };
                return;
            }

            if (currentTool === 'eraser') {
                const radius = eraserRadiusRef.current;
                setEraserCursor({
                    x: point.x * canvasSizeRef.current.width,
                    y: point.y * canvasSizeRef.current.height,
                    radius,
                });
                gestureRef.current = { start: point, points: [point] };
                gestureStartAnnotationsRef.current = annotationsRef.current;
                erasedInCurrentGestureRef.current = false;

                const result = applyPhotoEraserSweep(
                    annotationsRef.current, point, point,
                    canvasSizeRef.current.width, canvasSizeRef.current.height,
                    radius, eraserModeRef.current,
                );
                if (result.changed) {
                    erasedInCurrentGestureRef.current = true;
                    annotationsRef.current = result.annotations;
                    setAnnotations(result.annotations);
                }
                return;
            }

            const { width: grantCanvasW, height: grantCanvasH } = canvasSizeRef.current;
            const grantPointer = { x: point.x * grantCanvasW, y: point.y * grantCanvasH };

            /** Start moving an object, with the frame the snap and the bin will be measured on. */
            const beginDrag = (target: PhotoText | PhotoImage) => {
                dragRef.current = {
                    id: target.id,
                    startPoint: point,
                    initialPoint: { ...target.point },
                    hasMoved: false,
                    lastPoint: null,
                    centreOffset: selectionCentreOffset(selectionGeometryFor(target, canvasSizeRef.current)),
                };
            };

            const selectedAnn = selectedIdRef.current
                ? annotationsRef.current.find((ann) => ann.id === selectedIdRef.current)
                : undefined;
            const selectedObject = selectedAnn && (selectedAnn.type === 'text' || selectedAnn.type === 'image')
                ? selectedAnn
                : null;

            // 1. The frame's own handles come before anything underneath them. A corner resizes
            // what the frame is around and the knob turns it; both sit out on the frame, where
            // nothing else is listening, so they are safe to claim whatever the tool in hand is.
            if (selectedObject) {
                const geometry = selectionGeometryFor(selectedObject, canvasSizeRef.current);
                const handle = findPhotoSelectionHandle(
                    grantPointer,
                    photoSelectionHandlePoints(geometry, photoRotateHandleSide(geometry, canvasSizeRef.current)),
                    photoHandleTouchRadius(geometry.bounds),
                );
                if (handle === 'rotate') {
                    rotateDragRef.current = {
                        id: selectedObject.id,
                        grabOffset: normalizePhotoRotation(
                            photoPointerAngle(grantPointer, geometry.anchor) - (selectedObject.rotation ?? 0),
                        ),
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                        snapped: false,
                    };
                    setActiveHandle('rotate');
                    setRotationPreview(Math.round(normalizePhotoRotation(selectedObject.rotation ?? 0)));
                    return;
                }
                if (handle) {
                    handleDragRef.current = {
                        handle,
                        annotation: selectedObject,
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                    };
                    setActiveHandle(handle);
                    return;
                }
            }

            /**
             * The object under the finger, taken in the order the page draws them: labels sit
             * over the ink and the ink over the pictures, so where a label overlaps a picture the
             * label is what the finger has reached for.
             */
            const objectUnderFinger = ((): PhotoText | PhotoImage | null => {
                const current = annotationsRef.current;
                for (let i = current.length - 1; i >= 0; i -= 1) {
                    const ann = current[i];
                    if (ann.type === 'text' && isPointInPhotoText(ann, point, grantCanvasW, grantCanvasH, 28)) return ann;
                }
                for (let i = current.length - 1; i >= 0; i -= 1) {
                    const ann = current[i];
                    if (ann.type === 'image' && isPointInPhotoImage(ann, point, grantCanvasW, grantCanvasH, 12)) return ann;
                }
                return null;
            })();

            // 2. A tap on what is already selected starts moving it, whichever tool happens to be
            // in hand. A second tap on a label opens it for editing, the way a text box does
            // everywhere else — the pencil on the pill is for the finger that would rather aim.
            if (selectedObject && objectUnderFinger?.id === selectedObject.id) {
                if (selectedObject.type === 'text') {
                    const now = Date.now();
                    const previous = lastTapRef.current;
                    lastTapRef.current = { id: selectedObject.id, at: now };
                    if (previous && previous.id === selectedObject.id && now - previous.at <= DOUBLE_TAP_MS) {
                        lastTapRef.current = null;
                        editSelectedTextRef.current();
                        return;
                    }
                }
                beginDrag(selectedObject);
                return;
            }

            // 3. The label and picture tools take hold of whatever object they land on, either
            // kind: a page is a page, and the user should not have to remember which tool made
            // the thing they are reaching for. Drawing tools deliberately grab neither, so a pen
            // stroke can cross a label or run over a picture instead of picking it up.
            if ((currentTool === 'text' || currentTool === 'image') && objectUnderFinger) {
                selectAnnotation(objectUnderFinger.id);
                if (objectUnderFinger.type === 'text') {
                    // The pickers follow the label that was picked up, so the next change to a
                    // colour or a size lands on the thing the user is looking at.
                    setColor(objectUnderFinger.color);
                    setFontSize(objectUnderFinger.fontSize);
                    setTextBgStyle(objectUnderFinger.bgStyle || 'badge');
                    setTextAlign(objectUnderFinger.textAlign || 'center');
                    lastTapRef.current = { id: objectUnderFinger.id, at: Date.now() };
                }
                beginDrag(objectUnderFinger);
                return;
            }

            // 4. The same tools on empty canvas: put the selection down if there is one, and
            // otherwise start a new label or a new picture.
            if (currentTool === 'text') {
                if (selectedIdRef.current) {
                    setSelectedId(null);
                    return;
                }
                textDropPointRef.current = point;
                setTextDraft('');
                setTextBgStyle('badge');
                setTextAlign('center');
                setTextModal(true);
                return;
            }

            if (currentTool === 'image') {
                if (selectedIdRef.current) {
                    setSelectedId(null);
                    return;
                }
                addPictureRef.current(point);
                return;
            }

            if (selectedIdRef.current) {
                setSelectedId(null);
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
            const currentTool = toolRef.current;
            const touches = event.nativeEvent.touches ?? [];

            // Two fingers on the selection scale and twist it, the way story editors do: a
            // label by its font size, a picture by its box. A corner or the knob already has the
            // gesture, though, so a second finger landing mid-drag must not take it over.
            if (touches.length >= 2 && selectedIdRef.current && !handleDragRef.current && !rotateDragRef.current) {
                const [first, second] = touches;
                const selected = annotationsRef.current.find(
                    (ann) => ann.id === selectedIdRef.current && (ann.type === 'text' || ann.type === 'image'),
                ) as PhotoText | PhotoImage | undefined;
                if (!selected) return;

                const distance = Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
                const angle = (Math.atan2(second.pageY - first.pageY, second.pageX - first.pageX) * 180) / Math.PI;

                if (!pinchRef.current || pinchRef.current.id !== selected.id) {
                    pinchRef.current = {
                        id: selected.id,
                        startDistance: Math.max(1, distance),
                        startAngle: angle,
                        initialFontSize: selected.type === 'text' ? selected.fontSize : 0,
                        initialBox: selected.type === 'image'
                            ? { width: selected.width, height: selected.height }
                            : null,
                        initialRotation: selected.rotation ?? 0,
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                    };
                    // A second finger ends any drag in progress so the label does not jump.
                    dragRef.current = null;
                    setIsDraggingSelection(false);
                    updateTrashHovered(false);
                    return;
                }

                const pinch = pinchRef.current;
                let turned = angle - pinch.startAngle;
                if (turned > 180) turned -= 360;
                else if (turned < -180) turned += 360;
                if (!pinch.applied
                    && Math.abs(distance - pinch.startDistance) < PINCH_ACTIVATION_PX
                    && Math.abs(turned) < 4) {
                    return;
                }
                pinch.applied = true;

                const rotation = normalizePhotoRotation(pinch.initialRotation + turned);
                const factor = distance / pinch.startDistance;
                setRotationPreview(Math.round(rotation));

                if (pinch.initialBox) {
                    // Sized from the box the pinch started on rather than from the current one,
                    // so the picture follows the fingers instead of compounding every sample.
                    const initialBox = pinch.initialBox;
                    const next = annotationsRef.current.map((ann) => {
                        if (ann.id !== pinch.id || ann.type !== 'image') return ann;
                        const resized = resizePhotoImage(
                            { ...ann, width: initialBox.width, height: initialBox.height },
                            factor,
                            canvasSizeRef.current,
                        );
                        return { ...resized, rotation };
                    });
                    annotationsRef.current = next;
                    setAnnotations(next);
                    return;
                }

                const scaled = Math.round(clampPhotoTextSize(pinch.initialFontSize * factor));
                const next = annotationsRef.current.map((ann) => (
                    ann.id === pinch.id && ann.type === 'text'
                        ? { ...ann, fontSize: scaled, rotation }
                        : ann
                ));
                annotationsRef.current = next;
                setAnnotations(next);
                setFontSize(scaled);
                return;
            }

            // Ignore the leftover single finger after a pinch: resuming a drag mid-gesture
            // would snap the label to wherever that finger happens to be.
            if (pinchRef.current) return;

            const point = pointFromEvent(event);
            const { width: moveCanvasW, height: moveCanvasH } = canvasSizeRef.current;
            const movePointer = { x: point.x * moveCanvasW, y: point.y * moveCanvasH };

            // A corner being pulled. Every sample is measured from the box the corner was taken
            // hold of, never from the box the last sample produced, so the picture follows the
            // finger instead of drifting away from it as the samples compound.
            const resize = handleDragRef.current;
            if (resize) {
                const resized = resize.annotation.type === 'image'
                    ? resizePhotoImageByHandle({
                        annotation: resize.annotation,
                        handle: resize.handle,
                        pointer: movePointer,
                        canvas: canvasSizeRef.current,
                    })
                    : resizePhotoTextByHandle({
                        annotation: resize.annotation,
                        handle: resize.handle,
                        pointer: movePointer,
                        canvas: canvasSizeRef.current,
                    });
                // A corner dragged back out to where it started asks for the size it was grabbed
                // at, and that is a real answer: the original has to go back on the page rather
                // than leaving the last sample's size standing.
                if (objectById(annotationsRef.current, resized.id) === resized) return;
                if (resized !== resize.annotation) resize.applied = true;
                const next = annotationsRef.current.map((ann) => (ann.id === resized.id ? resized : ann));
                annotationsRef.current = next;
                setAnnotations(next);
                // A label pulled bigger leaves the size picker holding its new size, so the next
                // label is written at the size the last one ended up.
                if (resized.type === 'text') setFontSize(resized.fontSize);
                return;
            }

            // The knob being turned.
            const turn = rotateDragRef.current;
            if (turn) {
                const target = annotationsRef.current.find((ann) => ann.id === turn.id);
                if (!target || (target.type !== 'text' && target.type !== 'image')) return;
                const geometry = selectionGeometryFor(target, canvasSizeRef.current);
                const turned = resolvePhotoHandleRotation({
                    pointer: movePointer,
                    anchor: geometry.anchor,
                    grabOffset: turn.grabOffset,
                });
                if (turned.snapped !== turn.snapped) {
                    if (turned.snapped) tick();
                    turn.snapped = turned.snapped;
                }
                if ((target.rotation ?? 0) === turned.rotation) return;
                turn.applied = true;
                const next = annotationsRef.current.map((ann) => (
                    ann.id === turn.id ? { ...ann, rotation: turned.rotation } : ann
                ));
                annotationsRef.current = next;
                setAnnotations(next);
                setRotationPreview(Math.round(turned.rotation));
                return;
            }

            if (currentTool === 'crop') {
                const drag = cropDragRef.current;
                if (!drag) return;
                const dx = point.x - drag.startPoint.x;
                const dy = point.y - drag.startPoint.y;
                const init = drag.initialBox;

                let nextBox = { ...init };
                if (drag.mode === 'move') {
                    nextBox.x = Math.max(0, Math.min(1 - init.width, init.x + dx));
                    nextBox.y = Math.max(0, Math.min(1 - init.height, init.y + dy));
                } else if (drag.mode === 'new') {
                    const minX = Math.min(drag.startPoint.x, point.x);
                    const minY = Math.min(drag.startPoint.y, point.y);
                    const maxX = Math.max(drag.startPoint.x, point.x);
                    const maxY = Math.max(drag.startPoint.y, point.y);
                    nextBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                } else {
                    let left = init.x;
                    let top = init.y;
                    let right = init.x + init.width;
                    let bottom = init.y + init.height;

                    if (drag.mode.includes('l')) left = Math.min(right - 0.05, Math.max(0, init.x + dx));
                    if (drag.mode.includes('r')) right = Math.max(left + 0.05, Math.min(1, init.x + init.width + dx));
                    if (drag.mode.includes('t')) top = Math.min(bottom - 0.05, Math.max(0, init.y + dy));
                    if (drag.mode.includes('b')) bottom = Math.max(top + 0.05, Math.min(1, init.y + init.height + dy));

                    nextBox = { x: left, y: top, width: right - left, height: bottom - top };
                }

                const clamped = clampCropRect(nextBox);
                setCropBox(clamped);
                return;
            }

            if (currentTool === 'eraser') {
                const prevPoint = gestureRef.current?.points[gestureRef.current.points.length - 1] || point;
                gestureRef.current?.points.push(point);

                const radius = eraserRadiusRef.current;
                setEraserCursor({
                    x: point.x * canvasSizeRef.current.width,
                    y: point.y * canvasSizeRef.current.height,
                    radius,
                });

                const result = applyPhotoEraserSweep(
                    annotationsRef.current, prevPoint, point,
                    canvasSizeRef.current.width, canvasSizeRef.current.height,
                    radius, eraserModeRef.current,
                );
                if (result.changed) {
                    erasedInCurrentGestureRef.current = true;
                    annotationsRef.current = result.annotations;
                    setAnnotations(result.annotations);
                }
                return;
            }

            if (dragRef.current) {
                const drag = dragRef.current;
                const dx = point.x - drag.startPoint.x;
                const dy = point.y - drag.startPoint.y;
                drag.lastPoint = point;
                if (Math.hypot(dx, dy) > 0.003) {
                    drag.hasMoved = true;
                    setIsDraggingSelection(true);
                }

                const freePoint = clampPhotoPoint({
                    x: Math.max(0.04, Math.min(0.96, drag.initialPoint.x + dx)),
                    y: Math.max(0.04, Math.min(0.96, drag.initialPoint.y + dy)),
                });
                // Give way to the middle of the page when the drag comes within a fingertip of
                // it, and show the guide it caught. Centring by eye on a phone is a fiddle.
                const snap = resolvePhotoDragSnap({
                    point: freePoint,
                    centreOffset: drag.centreOffset,
                    canvas: canvasSizeRef.current,
                });
                const newPoint = snap.point;
                updateSnapGuides(drag.hasMoved ? snap.guides : { x: false, y: false });

                // Highlight the bin from the same rect the release hit-tests against, so what the
                // finger lights up is always what letting go will do. The bin is only on screen
                // once the drag has started, so it cannot claim a release that never moved.
                const { width: dragCanvasW, height: dragCanvasH } = canvasSizeRef.current;
                updateTrashHovered(drag.hasMoved && isPointInPhotoTrashZone(
                    point,
                    photoTrashZoneRect(dragCanvasW, dragCanvasH),
                    dragCanvasW,
                    dragCanvasH,
                ));

                const next = annotationsRef.current.map((ann) => (
                    ann.id === drag.id && (ann.type === 'text' || ann.type === 'image')
                        ? { ...ann, point: newPoint }
                        : ann
                ));
                annotationsRef.current = next;
                setAnnotations(next);
                return;
            }

            const gesture = gestureRef.current;
            if (!gesture || !Array.isArray(gesture.points)) return;
            if (currentTool === 'pen' || currentTool === 'highlighter') {
                gesture.points.push(point);
                const strokePoints = [...gesture.points];
                setLiveAnnotation((current) => current && current.type === 'stroke'
                    ? { ...current, points: strokePoints }
                    : current);
            } else {
                // The release commits from the gesture record, not from the live preview it
                // cannot read, so the shape tools must leave their moving end there too. Keeping
                // only the latest sample is enough — a shape is defined by its two corners — and
                // without it letting go would commit `start` twice: an arrow collapsed into its
                // own head, a rectangle and an ellipse with no size at all.
                gesture.points[1] = point;
                setLiveAnnotation((current) => current && current.type !== 'stroke' && current.type !== 'text'
                    ? { ...current, end: point }
                    : current);
            }
        },
        onPanResponderRelease: () => {
            const pinch = pinchRef.current;
            if (pinch) {
                pinchRef.current = null;
                setRotationPreview(null);
                if (pinch.applied) {
                    pushHistory({ ...snapshotEditor(), annotations: pinch.beforeAnnotations });
                }
                gestureRef.current = null;
                dragRef.current = null;
                setLiveAnnotation(null);
                return;
            }
            // A corner or the knob just let go. One history entry covers the whole gesture, taken
            // from the state it started on, exactly as a pinch records itself.
            const releasedResize = handleDragRef.current;
            if (releasedResize) {
                handleDragRef.current = null;
                setActiveHandle(null);
                // A pull that ended at the size it started on leaves nothing to undo: the object
                // put back on the page is the very one the gesture began with.
                const settledSize = objectById(annotationsRef.current, releasedResize.annotation.id);
                if (releasedResize.applied && settledSize !== releasedResize.annotation) {
                    pushHistory({ ...snapshotEditor(), annotations: releasedResize.beforeAnnotations });
                }
                return;
            }
            const releasedTurn = rotateDragRef.current;
            if (releasedTurn) {
                rotateDragRef.current = null;
                setActiveHandle(null);
                setRotationPreview(null);
                const settledAngle = objectById(annotationsRef.current, releasedTurn.id);
                const startingAngle = objectById(releasedTurn.beforeAnnotations, releasedTurn.id);
                if (releasedTurn.applied && (settledAngle?.rotation ?? 0) !== (startingAngle?.rotation ?? 0)) {
                    pushHistory({ ...snapshotEditor(), annotations: releasedTurn.beforeAnnotations });
                }
                return;
            }
            if (toolRef.current === 'crop') {
                cropDragRef.current = null;
                setCropBox((curr) => clampCropRect(curr));
                return;
            }
            if (toolRef.current === 'eraser') {
                setEraserCursor(null);
                if (erasedInCurrentGestureRef.current && gestureStartAnnotationsRef.current) {
                    const snapshot: EditorHistoryState = {
                        ...snapshotEditor(),
                        annotations: gestureStartAnnotationsRef.current,
                    };
                    pushHistory(snapshot);
                }
                gestureRef.current = null;
                gestureStartAnnotationsRef.current = null;
                erasedInCurrentGestureRef.current = false;
                return;
            }
            if (dragRef.current) {
                const drag = dragRef.current;
                const { width: releaseCanvasW, height: releaseCanvasH } = canvasSizeRef.current;
                // Decided from the drag record, which the responder owns, rather than from the
                // `trashHovered` state: this handler was created on the first render and would
                // read that variable's initial `false` no matter what the user just dragged over.
                const outcome = resolvePhotoTextDragRelease({
                    point: drag.lastPoint,
                    zone: photoTrashZoneRect(releaseCanvasW, releaseCanvasH),
                    canvasWidth: releaseCanvasW,
                    canvasHeight: releaseCanvasH,
                    hasMoved: drag.hasMoved,
                });
                setIsDraggingSelection(false);
                updateTrashHovered(false);
                updateSnapGuides({ x: false, y: false });

                if (outcome === 'delete') {
                    const next = annotationsRef.current.filter((ann) => ann.id !== drag.id);
                    commitAnnotations(next);
                    setSelectedId(null);
                } else if (outcome === 'reposition') {
                    const initialPt = drag.initialPoint;
                    const dragId = drag.id;
                    const previousAnnotations = annotationsRef.current.map((ann) => (
                        ann.id === dragId && (ann.type === 'text' || ann.type === 'image')
                            ? { ...ann, point: initialPt }
                            : ann
                    ));
                    const snapshot: EditorHistoryState = {
                        ...snapshotEditor(),
                        annotations: previousAnnotations,
                    };
                    pushHistory(snapshot);
                }
                dragRef.current = null;
                return;
            }
            const gesture = gestureRef.current;
            const currentTool = toolRef.current;
            if (gesture && Array.isArray(gesture.points) && gesture.points.length > 0) {
                const base = {
                    id: makeId(),
                    color: colorRef.current,
                    width: currentTool === 'highlighter' ? Math.max(14, strokeWidthRef.current * 3) : strokeWidthRef.current,
                    opacity: currentTool === 'highlighter' ? 0.32 : 1,
                };
                if (currentTool === 'pen' || currentTool === 'highlighter') {
                    commitAnnotations([
                        ...annotationsRef.current,
                        { ...base, type: 'stroke', points: [...gesture.points] },
                    ]);
                } else if (currentTool !== 'text') {
                    const lastPoint = gesture.points[gesture.points.length - 1] ?? gesture.start;
                    const { width: shapeCanvasW, height: shapeCanvasH } = canvasSizeRef.current;
                    // A tap with a shape tool selected is not a drawing; committing it would
                    // leave a stray mark the user then has to hunt down and erase.
                    if (isPhotoShapeDragCommittable(gesture.start, lastPoint, shapeCanvasW, shapeCanvasH)) {
                        commitAnnotations([
                            ...annotationsRef.current,
                            { ...base, type: currentTool, start: gesture.start, end: lastPoint } as PhotoShape,
                        ]);
                    }
                }
            }
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
        onPanResponderTerminate: () => {
            pinchRef.current = null;
            handleDragRef.current = null;
            rotateDragRef.current = null;
            setActiveHandle(null);
            setRotationPreview(null);
            updateSnapGuides({ x: false, y: false });
            if (toolRef.current === 'eraser') {
                setEraserCursor(null);
                if (erasedInCurrentGestureRef.current && gestureStartAnnotationsRef.current) {
                    const snapshot: EditorHistoryState = {
                        ...snapshotEditor(),
                        annotations: gestureStartAnnotationsRef.current,
                    };
                    pushHistory(snapshot);
                }
                gestureStartAnnotationsRef.current = null;
                erasedInCurrentGestureRef.current = false;
            }
            setIsDraggingSelection(false);
            updateTrashHovered(false);
            cropDragRef.current = null;
            dragRef.current = null;
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
    })).current;
}
