import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';

type Props = {
    color: string;
    size?: number;
};

/** A clean Apple SF-style chart.bar glyph for statistics. */
export default function StatsGlyph({ color, size = 20 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M4 20h16"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
            <Path
                d="M7 20v-6"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
            />
            <Path
                d="M12 20V6"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
            />
            <Path
                d="M17 20v-10"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
            />
        </Svg>
    );
}
