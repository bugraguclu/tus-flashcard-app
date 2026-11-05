import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

type IconProps = { color: string; size?: number };

/** One outline glyph on the 24-unit grid the editor's other icons use. */
function OutlineIcon({ size = 24, children }: { size?: number; children: ReactNode }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            {children}
        </Svg>
    );
}

function line(color: string) {
    return { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
}

export function PhotoIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Rect x={3} y={5} width={18} height={14} rx={2.5} {...line(color)} />
            <Path d="m3.6 16.6 4.9-5 3.7 3.7 2.4-2.4 5.6 5" {...line(color)} />
            <Circle cx={15.6} cy={9.4} r={1.5} {...line(color)} />
        </OutlineIcon>
    );
}

export function CameraIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path
                d="M4.5 7.5h2.8l1.5-2.2h6.4l1.5 2.2h2.8A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z"
                {...line(color)}
            />
            <Circle cx={12} cy={13.2} r={3.5} {...line(color)} />
        </OutlineIcon>
    );
}

export function DrawIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path
                d="m4 20 1.2-4.6L16.8 3.8a1.7 1.7 0 0 1 2.4 0l1 1a1.7 1.7 0 0 1 0 2.4L8.6 18.8 4 20Zm11.4-14.8 3.4 3.4"
                {...line(color)}
            />
        </OutlineIcon>
    );
}

export function MicIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Rect x={9} y={3.2} width={6} height={11} rx={3} {...line(color)} />
            <Path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.4v3.3M9 20.7h6" {...line(color)} />
        </OutlineIcon>
    );
}

export function MusicIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M9.2 17.4V5.6l10-2.1v11.8" {...line(color)} />
            <Circle cx={6.7} cy={17.4} r={2.5} {...line(color)} />
            <Circle cx={16.7} cy={15.3} r={2.5} {...line(color)} />
        </OutlineIcon>
    );
}

export function VideoIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Rect x={2.8} y={6} width={13} height={12} rx={2.5} {...line(color)} />
            <Path d="m15.8 10.6 5.2-3.1v9l-5.2-3.1" {...line(color)} />
        </OutlineIcon>
    );
}

export function DocumentIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M7 3h7.2L19 7.8V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" {...line(color)} />
            <Path d="M14 3.2V8h4.8M9 12.6h6M9 16.2h4.5" {...line(color)} />
        </OutlineIcon>
    );
}

export function ShareIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M8.2 9.5H6.8A1.8 1.8 0 0 0 5 11.3v7.4a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8v-7.4a1.8 1.8 0 0 0-1.8-1.8h-1.4" {...line(color)} />
            <Path d="M12 14.2V3.6M8.6 6.9 12 3.5l3.4 3.4" {...line(color)} />
        </OutlineIcon>
    );
}

export function RetakeIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M4.6 12.4a7.4 7.4 0 1 0 2.3-5.6" {...line(color)} />
            <Path d="M4.4 3.9v3.9h3.9" {...line(color)} />
        </OutlineIcon>
    );
}

export function PauseIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Rect x={6.5} y={5} width={3.6} height={14} rx={1.2} fill={color} />
            <Rect x={13.9} y={5} width={3.6} height={14} rx={1.2} fill={color} />
        </OutlineIcon>
    );
}

export function PlayIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10.2-6.4a1 1 0 0 0 0-1.8L9.5 4.7a1 1 0 0 0-1.5.9Z" fill={color} />
        </OutlineIcon>
    );
}

export function CropIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M6.5 2.8v13.2a1.5 1.5 0 0 0 1.5 1.5h13.2" {...line(color)} />
            <Path d="M2.8 6.5H16a1.5 1.5 0 0 1 1.5 1.5v13.2" {...line(color)} />
        </OutlineIcon>
    );
}

export function ShrinkIcon({ color, size }: IconProps) {
    return (
        <OutlineIcon size={size}>
            <Path d="M4.5 14.2h5.3v5.3M19.5 9.8h-5.3V4.5M14.2 9.8l6.3-6.3M3.5 20.5l6.3-6.3" {...line(color)} />
        </OutlineIcon>
    );
}
