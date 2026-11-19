import { useWindowDimensions } from 'react-native';
import { READABLE_WIDTH, centeredInset as centeredInsetFor } from '../lib/centeredInset';

/**
 * The extra side inset that centres a column of `maxWidth` in the window, or 0 while the window
 * is narrower. Use it on full-width bars (a header, a bottom bar, a list's content) whose
 * background must still reach both edges while their content lines up with the column below.
 */
export function centeredInset(windowWidth: number, maxWidth: number = READABLE_WIDTH): number {
    return centeredInsetFor(windowWidth, maxWidth);
}

export function useCenteredInset(maxWidth: number = READABLE_WIDTH): number {
    const { width } = useWindowDimensions();
    return centeredInset(width, maxWidth);
}
