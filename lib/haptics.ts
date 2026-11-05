import * as Haptics from 'expo-haptics';

/**
 * The tap iOS gives when a press-and-hold lands (Photos, Mail and the Home Screen do the same):
 * it tells the finger that the hold registered and the row is now in another mode, before the
 * screen has finished changing. Every `onLongPress` in the app calls this first.
 */
export function longPressHaptic(): void {
    try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    } catch {
        // Haptics unavailable (web, or a device without a Taptic Engine).
    }
}
