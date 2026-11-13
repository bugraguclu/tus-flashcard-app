import { Circle, Path, Rect } from 'react-native-svg';
import PencilGlyph from '../PencilGlyph';
import { IconFrame, iconStroke, outline } from '../icons/IconFrame';
import { CropGlyph, MicGlyph, PauseGlyph, PhotoGlyph, PlayGlyph, RotateLeftGlyph } from '../UiGlyphs';

type IconProps = { color: string; size?: number };

/** The editor's attachment icons, on the app's shared grid and stroke; 24 points by default. */

const SIZE = 24;

function line(color: string, size: number) {
    return outline(color, iconStroke(size));
}

export function PhotoIcon({ color, size = SIZE }: IconProps) {
    return <PhotoGlyph color={color} size={size} />;
}

export function CameraIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path
                d="M3 9a2.5 2.5 0 0 1 2.5-2.5h1.9l1.25-1.85A1.5 1.5 0 0 1 9.9 4h4.2a1.5 1.5 0 0 1 1.25.65l1.25 1.85h1.9A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"
                {...line(color, size)}
            />
            <Circle cx={12} cy={12.75} r={3.75} {...line(color, size)} />
        </IconFrame>
    );
}

export function DrawIcon({ color, size = SIZE }: IconProps) {
    return <PencilGlyph color={color} size={size} />;
}

export function MicIcon({ color, size = SIZE }: IconProps) {
    return <MicGlyph color={color} size={size} />;
}

export function MusicIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M9 17.5V6.25l10.5-2.5V15" {...line(color, size)} />
            <Circle cx={6.75} cy={17.5} r={2.25} {...line(color, size)} />
            <Circle cx={17.25} cy={15} r={2.25} {...line(color, size)} />
        </IconFrame>
    );
}

export function VideoIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={2.75} y={6} width={13} height={12} rx={3} {...line(color, size)} />
            <Path d="m15.75 10.25 4.1-2.45a.75.75 0 0 1 1.15.65v7.1a.75.75 0 0 1-1.15.65l-4.1-2.45" {...line(color, size)} />
        </IconFrame>
    );
}

export function DocumentIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path
                d="M7.25 3h6.5L19 8.25v10.5A2.25 2.25 0 0 1 16.75 21h-9.5A2.25 2.25 0 0 1 5 18.75V5.25A2.25 2.25 0 0 1 7.25 3Z"
                {...line(color, size)}
            />
            <Path d="M13.5 3.25V7a1.5 1.5 0 0 0 1.5 1.5h3.75M8.75 13h6.5M8.75 16.5h4" {...line(color, size)} />
        </IconFrame>
    );
}

/** Share: a tray with an arrow leaving it, as iOS draws it. */
export function ShareIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M8.5 9.5H7.25A2.25 2.25 0 0 0 5 11.75v6.5a2.25 2.25 0 0 0 2.25 2.25h9.5A2.25 2.25 0 0 0 19 18.25v-6.5a2.25 2.25 0 0 0-2.25-2.25H15.5" {...line(color, size)} />
            <Path d="M12 14.25V3.5M8.5 7 12 3.5 15.5 7" {...line(color, size)} />
        </IconFrame>
    );
}

export function RetakeIcon({ color, size = SIZE }: IconProps) {
    return <RotateLeftGlyph color={color} size={size} />;
}

export function PauseIcon({ color, size = SIZE }: IconProps) {
    return <PauseGlyph color={color} size={size} />;
}

export function PlayIcon({ color, size = SIZE }: IconProps) {
    return <PlayGlyph color={color} size={size} />;
}

export function CropIcon({ color, size = SIZE }: IconProps) {
    return <CropGlyph color={color} size={size} />;
}

export function ShrinkIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M4.5 14.25h5.25v5.25M19.5 9.75h-5.25V4.5M14.25 9.75 20.5 3.5M3.5 20.5l6.25-6.25" {...line(color, size)} />
        </IconFrame>
    );
}
