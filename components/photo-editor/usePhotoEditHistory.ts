import { useRef, useState } from 'react';
import { INITIAL_PHOTO_EDIT, type PhotoEdit } from '../../lib/photoEdit';

const HISTORY_LIMIT = 50;

/**
 * The photo's current state and the steps back and forward through it. Every kind of edit — a
 * stroke, a crop, a turn, a slider — is one step, so undo walks back through them in the order
 * they were made, whichever screen they were made on.
 *
 * History is read and written through refs rather than inside state updaters: an updater that
 * also pushed onto the other stack would push twice under StrictMode's double invocation.
 */
export function usePhotoEditHistory() {
    const [edit, setEdit] = useState<PhotoEdit>(INITIAL_PHOTO_EDIT);
    const [undoStack, setUndoStack] = useState<PhotoEdit[]>([]);
    const [redoStack, setRedoStack] = useState<PhotoEdit[]>([]);
    const editRef = useRef(edit);
    const undoRef = useRef(undoStack);
    const redoRef = useRef(redoStack);

    /** Show a state without recording it: a stroke or a rub-out still under the finger. */
    const apply = (next: PhotoEdit) => {
        editRef.current = next;
        setEdit(next);
    };

    /** Record a state the user can go back to, dropping the redo branch the new edit replaces. */
    const remember = (before: PhotoEdit) => {
        undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), before];
        setUndoStack(undoRef.current);
        redoRef.current = [];
        setRedoStack([]);
    };

    /** One step of history: remember where the photo was, then move it on. */
    const commit = (next: PhotoEdit) => {
        if (next === editRef.current) return;
        remember(editRef.current);
        apply(next);
    };

    /** Step back or forward; the state stepped to, or null when there is none. */
    const step = (from: typeof undoRef, to: typeof redoRef, setFrom: typeof setUndoStack, setTo: typeof setRedoStack) => {
        const stack = from.current;
        if (!stack.length) return null;
        const target = stack[stack.length - 1];
        to.current = [...to.current, editRef.current];
        from.current = stack.slice(0, -1);
        setTo(to.current);
        setFrom(from.current);
        apply(target);
        return target;
    };

    const undo = () => step(undoRef, redoRef, setUndoStack, setRedoStack);
    const redo = () => step(redoRef, undoRef, setRedoStack, setUndoStack);

    /** A fresh photo: nothing on it, nothing to undo or redo. */
    const reset = () => {
        undoRef.current = [];
        redoRef.current = [];
        setUndoStack([]);
        setRedoStack([]);
        apply(INITIAL_PHOTO_EDIT);
    };

    return {
        edit,
        editRef,
        apply,
        remember,
        commit,
        undo,
        redo,
        reset,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
    };
}
