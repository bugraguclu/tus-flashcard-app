import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';
import { circle, gear } from './icons/iconGeometry';

type Props = {
    color: string;
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
};

const BODY = gear(12, 12, 9.25, 7, 8, 18, 30);

/** Settings: an eight-tooth gear around a round hub. */
export default function GearGlyph({ color, size = 20, filled = false, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            {filled ? (
                <Path d={`${BODY}${circle(12, 12, 3.4)}`} fillRule="evenodd" {...solid(color, width)} />
            ) : (
                <>
                    <Path d={BODY} {...outline(color, width)} />
                    <Path d={circle(12, 12, 3)} {...outline(color, width)} />
                </>
            )}
        </IconFrame>
    );
}
