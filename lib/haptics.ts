// Central haptics facade. Screens call these instead of expo-haptics directly for three reasons:
// the module is imported once at startup (a lazy `require` inside a press handler resolved the
// native module on the first tap and cost a visible frame), every call honours the user's
// "Titreşimli geri bildirim" preference, and web/unsupported devices degrade to a no-op instead
// of throwing inside an event handler.

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

let enabled = true;

/** Mirrors AppSettings.hapticsEnabled into this module so calls stay synchronous and cheap. */
export function configureHaptics(nextEnabled: boolean): void {
    enabled = nextEnabled;
}

function run(effect: () => Promise<void>): void {
    if (!enabled || !SUPPORTED) return;
    try {
        void effect().catch(() => undefined);
    } catch {
        // A device without a taptic engine (or an older Android build) rejects synchronously.
    }
}

/** Moving between options: pickers, toggles, segmented controls, stepper taps. */
export function hapticSelection(): void {
    run(() => Haptics.selectionAsync());
}

/** Confirming a light action: answering a card, opening a menu entry. */
export function hapticLight(): void {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A heavier state change: picking a card up to drag, entering selection mode. */
export function hapticMedium(): void {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** An operation completed: deck created, queue finished, undo applied. */
export function hapticSuccess(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A request was refused or needs attention before it can proceed. */
export function hapticWarning(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** An operation failed. */
export function hapticError(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/**
 * Answer buttons: "Tekrar" is the one grade the user may want to feel differently, so it gets a
 * medium tap while the passing grades stay light. Mirrors how AnkiMobile weights its feedback.
 */
export function hapticAnswer(grade: number): void {
    if (grade <= 1) hapticMedium();
    else hapticLight();
}

/** What a press means, independent of which effect the platform uses to express it. */
export type HapticIntent = 'selection' | 'impact' | 'success' | 'warning' | 'error';

const INTENTS: Record<HapticIntent, () => void> = {
    selection: hapticSelection,
    impact: hapticLight,
    success: hapticSuccess,
    warning: hapticWarning,
    error: hapticError,
};

/** Dispatches by intent, for call sites that carry the meaning in a variable. */
export function haptic(intent: HapticIntent): void {
    INTENTS[intent]?.();
}
