import { useWindowDimensions } from 'react-native';
import { sheetPresentationFor, type SheetPresentation } from '../lib/sheetPresentation';

/**
 * How a sheet is shown in the current window: `dialog` on a wide one (desktop web, a tablet),
 * `sheet` on a phone. It follows the window as it is resized.
 */
export function useSheetPresentation(): SheetPresentation {
    const { width } = useWindowDimensions();
    return sheetPresentationFor(width);
}
