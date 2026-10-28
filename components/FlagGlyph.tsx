import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';

type Props = {
    color?: string;
    size?: number;
    filled?: boolean;
};

/** A clean Apple SF-style flag glyph for reviewer and card badges. */
export default function FlagGlyph({ color = '#3a9e78', size = 16, filled = true }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v19H4V15z"
                fill={filled ? color : 'none'}
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
