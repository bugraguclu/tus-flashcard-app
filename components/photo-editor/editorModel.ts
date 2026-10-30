import * as Haptics from 'expo-haptics';
import type { BlankCanvasPaper, BlankCanvasRuling } from '../../lib/blankCanvas';

/** Longest edge an exported PNG may reach. A card image past this is weight, not detail. */
export const EXPORT_MAX_DIMENSION = 2000;

/** The off-screen surface an export is rendered on: its size, and its ratio to the live canvas. */
export type ExportSurface = { width: number; height: number; scale: number };

/** A drawn page's paper, in the page's own export pixels. */
export type EditorPage = { background: string; paper: BlankCanvasPaper; ruling: BlankCanvasRuling };

/**
 * A label in one of the editor's fixed rows of buttons. Like the deck list's bottom bar, it grows
 * with the text size up to the Large step and then shrinks to fit rather than being cut off.
 */
export const ROW_LABEL_FIT = { numberOfLines: 1, maxFontSizeMultiplier: 1.15, adjustsFontSizeToFit: true, minimumFontScale: 0.8 } as const;

export function makeId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A short tick under the finger, on the devices that have one.
 *
 * It marks the moments a drag cannot show on its own — a crop frame caught, a slider settled on
 * zero — and it is a courtesy rather than a dependency: a device without a taptic engine, or a
 * build without the module, simply carries on.
 */
export function tick() {
    try {
        void Haptics.selectionAsync().catch(() => undefined);
    } catch {
        // No haptics available on this device.
    }
}
