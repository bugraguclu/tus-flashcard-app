import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';

type Props = {
    color: string;
    size?: number;
};

/** A slender, monochrome pencil shared by the reviewer menu and browser rows. */
export default function PencilGlyph({ color, size = 24 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="m4 20 1.2-4.6L16.8 3.8a1.7 1.7 0 0 1 2.4 0l1 1a1.7 1.7 0 0 1 0 2.4L8.6 18.8 4 20Zm1.2-4.6 3.4 3.4M15.4 5.2l3.4 3.4"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
