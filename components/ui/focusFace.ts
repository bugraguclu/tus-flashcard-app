import { Platform } from 'react-native';

/**
 * Spread on the visible face inside a larger touch target. Web hover and keyboard focus follow
 * that face's corners; the full target still takes presses. Only mark interactive faces, so a
 * passive checkbox inside a pressable row leaves feedback on the whole row.
 */
export const focusFaceProps: object = Platform.OS === 'web' ? { dataSet: { focusFace: 'true' } } : {};
