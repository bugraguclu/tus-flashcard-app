import React from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

/**
 * Line icons for the Kronometre and the study calendar, drawn on a 24-unit grid. They are
 * decorative: the control that holds one carries the accessibility label.
 */

interface IconProps {
    color: string;
    size?: number;
}

function IconFrame({ size = 22, children }: { size?: number; children: React.ReactNode }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            {children}
        </Svg>
    );
}

export function BellIcon({ color, size, muted = false }: IconProps & { muted?: boolean }) {
    return (
        <IconFrame size={size}>
            <Path
                d="M12 3.2c-3.2 0-5.6 2.5-5.6 5.8v4.3L4.6 16.6h14.8l-1.8-3.3V9c0-3.3-2.4-5.8-5.6-5.8z"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinejoin="round"
            />
            <Path d="M9.8 19.2a2.3 2.3 0 0 0 4.4 0" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            {muted && <Line x1={4} y1={3.5} x2={20} y2={20.5} stroke={color} strokeWidth={1.8} strokeLinecap="round" />}
        </IconFrame>
    );
}

export function GearIcon({ color, size }: IconProps) {
    const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
    return (
        <IconFrame size={size}>
            <G>
                {teeth.map((angle) => {
                    const radians = (angle * Math.PI) / 180;
                    return (
                        <Line
                            key={angle}
                            x1={12 + Math.cos(radians) * 6.6}
                            y1={12 + Math.sin(radians) * 6.6}
                            x2={12 + Math.cos(radians) * 9.4}
                            y2={12 + Math.sin(radians) * 9.4}
                            stroke={color}
                            strokeWidth={3}
                            strokeLinecap="round"
                        />
                    );
                })}
            </G>
            <Circle cx={12} cy={12} r={6.2} fill="none" stroke={color} strokeWidth={1.8} />
            <Circle cx={12} cy={12} r={2.4} fill="none" stroke={color} strokeWidth={1.8} />
        </IconFrame>
    );
}

export function PlayIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M8.5 5.8v12.4c0 .8.9 1.3 1.6.9l9.6-6.2a1 1 0 0 0 0-1.8L10.1 4.9c-.7-.4-1.6.1-1.6.9z" fill={color} />
        </IconFrame>
    );
}

export function PauseIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={6} y={5} width={4.2} height={14} rx={1.4} fill={color} />
            <Rect x={13.8} y={5} width={4.2} height={14} rx={1.4} fill={color} />
        </IconFrame>
    );
}

export function StopIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={6} y={6} width={12} height={12} rx={2.4} fill={color} />
        </IconFrame>
    );
}

export function ClockIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Circle cx={12} cy={12} r={8.2} fill="none" stroke={color} strokeWidth={2} />
            <Path d="M12 7.6V12l3 2.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </IconFrame>
    );
}

export function StopwatchIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Circle cx={12} cy={13.5} r={7.4} fill="none" stroke={color} strokeWidth={2} />
            <Path d="M10 3h4M12 3v3M18.2 6.6l1.3-1.3" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M12 13.5V9.6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </IconFrame>
    );
}

export function CalendarIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={3.8} y={5.2} width={16.4} height={15} rx={2.6} fill="none" stroke={color} strokeWidth={2} />
            <Path d="M3.8 10h16.4M8.2 3v4.2M15.8 3v4.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Rect x={7.4} y={13} width={3} height={3} rx={0.8} fill={color} />
            <Rect x={13.6} y={13} width={3} height={3} rx={0.8} fill={color} />
        </IconFrame>
    );
}

export function HourglassIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M6.5 3h11M6.5 21h11" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path
                d="M7.8 3v3.2c0 2 1.6 3.4 4.2 5.8 2.6-2.4 4.2-3.8 4.2-5.8V3M7.8 21v-3.2c0-2 1.6-3.4 4.2-5.8 2.6 2.4 4.2 3.8 4.2 5.8V21"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinejoin="round"
            />
            <Path d="M9.6 19.6c.6-1.5 1.4-2.3 2.4-3 1 .7 1.8 1.5 2.4 3z" fill={color} />
        </IconFrame>
    );
}

export function PlusIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
        </IconFrame>
    );
}

export function MinusIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M5 12h14" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
        </IconFrame>
    );
}

export function PlusCircleIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Circle cx={12} cy={12} r={9.4} fill={color} />
            <Path d="M12 7.6v8.8M7.6 12h8.8" fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" />
        </IconFrame>
    );
}

/** Three ascending bars: the study analytics button's glyph. */
export function AnalyticsIcon({ color, size }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={4} y={13} width={4.4} height={8} rx={1.4} fill={color} />
            <Rect x={9.8} y={8} width={4.4} height={13} rx={1.4} fill={color} />
            <Rect x={15.6} y={3.5} width={4.4} height={17.5} rx={1.4} fill={color} />
        </IconFrame>
    );
}
