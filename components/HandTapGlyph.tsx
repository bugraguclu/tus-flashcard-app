import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';
import { arc } from './icons/iconGeometry';

type Props = {
    color: string;
    size?: number;
    strokeWidth?: number;
};

/** Touch controls and gestures: a pointing finger with the ripple of a tap above it. */
export default function HandTapGlyph({ color, size = 20, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path
                d="M9.25 15V9.25a1.5 1.5 0 0 1 3 0v3.25a1.38 1.38 0 0 1 2.75 0 1.38 1.38 0 0 1 2.75 0V16c0 2.62-2.13 4.75-4.75 4.75h-1.5c-1.4 0-2.7-.7-3.5-1.85l-2.35-3.4a1.35 1.35 0 0 1 2.05-1.75Z"
                {...outline(color, width)}
            />
            <Path d={arc(10.75, 9.25, 4.25, 205, 335)} {...outline(color, width)} />
        </IconFrame>
    );
}
