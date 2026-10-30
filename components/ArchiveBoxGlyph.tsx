import Svg, { Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';

type Props = {
    color: string;
    size?: number;
};

/** A clean Apple SF-style archivebox glyph for data management. */
export default function ArchiveBoxGlyph({ color, size = 20 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Rect
                x="3"
                y="3"
                width="18"
                height="4"
                rx="1"
                stroke={color}
                strokeWidth={1.8}
            />
            <Path
                d="M4 7v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
            <Path
                d="M10 12h4"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
        </Svg>
    );
}
