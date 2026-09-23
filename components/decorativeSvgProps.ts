import { Platform } from 'react-native';

/**
 * Hides a purely decorative SVG from assistive technology on every platform.
 *
 * react-native-svg hands props it does not know straight to the DOM on web, where the native
 * `accessibilityElementsHidden` is an invalid attribute (React warns and drops it) and only
 * `aria-hidden` means anything. iOS reads `accessibilityElementsHidden`; Android the other.
 */
export const DECORATIVE_SVG_PROPS = Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
