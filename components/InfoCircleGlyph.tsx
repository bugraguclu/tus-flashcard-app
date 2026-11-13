import { Circle, Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    strokeWidth?: number;
};

/** Information: a lower-case i in a circle. */
export default function InfoCircleGlyph({ color, size = 15, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Circle cx={12} cy={12} r={9} {...outline(color, width)} />
            <Path d="M12 11.25v5.25" {...outline(color, width)} />
            <Circle cx={12} cy={7.9} r={width * 0.62} fill={color} />
        </IconFrame>
    );
}
