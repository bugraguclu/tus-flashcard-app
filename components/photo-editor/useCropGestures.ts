import { useRef, type RefObject } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import type { PhotoCropRect, PhotoPoint } from '../../lib/photoEditor';
import { dragPhotoCrop, photoCropHandleAt, type PhotoCropHandle } from '../../lib/photoCrop';
import { followedTouch } from '../../lib/drawingPad';
import { samePhotoCrop, type PhotoSize } from '../../lib/photoGeometry';
import { tick } from './editorModel';

export interface CropGestureDeps {
    /** The canvas the whole turned photo is shown on. */
    canvasRef: RefObject<PhotoSize>;
    /** Where that canvas sits in the stage. */
    offsetRef: RefObject<PhotoPoint>;
    /** The crop as it stands. */
    cropRef: RefObject<PhotoCropRect>;
    /** Width over height to keep, or null for a free frame. */
    aspectRef: RefObject<number | null>;
    /** The frame while a finger moves it; null once the finger lifts. */
    setDraft: (crop: PhotoCropRect | null) => void;
    /** The frame a finger left changed, as one step of history. */
    commit: (crop: PhotoCropRect) => void;
}

type CropGesture = { handle: PhotoCropHandle; start: PhotoCropRect; startPage: PhotoPoint; draft: PhotoCropRect };

/**
 * Touches on the crop stage: a corner or an edge resizes the frame, the inside moves it. The
 * stage, not the photo, takes them, so a grip right on the photo's edge can be reached from
 * outside it. Everything on the stage ignores touches, which keeps `location` measured from the
 * stage itself.
 */
export function useCropGestures(deps: CropGestureDeps) {
    const depsRef = useRef(deps);
    depsRef.current = deps;
    const gestureRef = useRef<CropGesture | null>(null);
    // The finger that took hold of the frame; another one set down meanwhile is ignored.
    const fingerRef = useRef<number | string | undefined>(undefined);

    const begin = (event: GestureResponderEvent) => {
        const { canvasRef, offsetRef, cropRef, setDraft } = depsRef.current;
        const native = event.nativeEvent;
        fingerRef.current = native.identifier;
        const point = { x: native.locationX - offsetRef.current.x, y: native.locationY - offsetRef.current.y };
        const handle = photoCropHandleAt(point, cropRef.current, canvasRef.current);
        if (!handle) {
            gestureRef.current = null;
            return;
        }
        tick();
        const start = cropRef.current;
        gestureRef.current = { handle, start, startPage: { x: native.pageX, y: native.pageY }, draft: start };
        setDraft(start);
    };

    const extend = (event: GestureResponderEvent) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const finger = followedTouch(event.nativeEvent, fingerRef.current);
        if (!finger) return;
        const { canvasRef, aspectRef, setDraft } = depsRef.current;
        gesture.draft = dragPhotoCrop({
            start: gesture.start,
            handle: gesture.handle,
            delta: { x: finger.pageX - gesture.startPage.x, y: finger.pageY - gesture.startPage.y },
            aspect: aspectRef.current,
            canvas: canvasRef.current,
        });
        setDraft(gesture.draft);
    };

    const finish = () => {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        if (!gesture) return;
        const { setDraft, commit } = depsRef.current;
        if (!samePhotoCrop(gesture.draft, gesture.start)) commit(gesture.draft);
        setDraft(null);
    };

    return useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: begin,
        onPanResponderMove: extend,
        onPanResponderRelease: (event) => {
            extend(event);
            finish();
        },
        onPanResponderTerminate: () => {
            gestureRef.current = null;
            depsRef.current.setDraft(null);
        },
    })).current;
}
