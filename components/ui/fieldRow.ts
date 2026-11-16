import { Platform } from 'react-native';
import { FIELD_ROW_DATA_KEY } from '../../lib/fieldRowFocus';

/**
 * Spread on the box of a field that holds more than its input (`<View style={box} {...fieldRowProps}>`):
 * in a browser the focus ring is then drawn around that box instead of as a frame inside it. See
 * `lib/fieldRowFocus.ts`. Nothing on iPhone, where a focused field shows its caret only.
 */
export const fieldRowProps: object = Platform.OS === 'web' ? { dataSet: { [FIELD_ROW_DATA_KEY]: 'true' } } : {};
