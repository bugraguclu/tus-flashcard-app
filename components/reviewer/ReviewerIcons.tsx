import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

/**
 * The reviewer toolbar's own line icon. Back, the deck chevron and the settings gear come from
 * `components/ui/icons` and `GearGlyph`, which every other screen draws too.
 */

/** AnkiDroid-style reviewer action: reverse the most recent grading operation. */
export function UndoReviewIcon({ color }: { color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M9 7H4V2M4.5 7A8 8 0 1 1 6 18"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
