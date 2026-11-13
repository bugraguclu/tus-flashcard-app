import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import { capsulePath } from './svgShapes';

interface ProgressRingProps {
    size: number;
    strokeWidth: number;
    /** 0 to 1. */
    progress: number;
    trackColor: string;
    progressColor: string;
    knobColor: string;
    /** The dot inside the knob; the progress colour unless given. */
    knobDotColor?: string;
    children?: React.ReactNode;
}

/**
 * The daily goal ring: a track, the share of the goal studied so far drawn clockwise from the top,
 * and a knob where that share ends — a small pill lying along the ring with a dot at its trailing
 * end, as TUSBuddy draws it. The arc and the pill are computed paths rather than rotated shapes,
 * so they render the same on iPhone and on the web without SVG transforms.
 */
export default function ProgressRing({
    size,
    strokeWidth,
    progress,
    trackColor,
    progressColor,
    knobColor,
    knobDotColor = progressColor,
    children,
}: ProgressRingProps) {
    const knobRadius = strokeWidth * 0.62;
    const knobLength = strokeWidth * 2.4;
    const center = size / 2;
    const radius = center - Math.max(strokeWidth / 2, knobRadius) - 1;
    const share = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const angle = -Math.PI / 2 + share * 2 * Math.PI;
    const endX = center + radius * Math.cos(angle);
    const endY = center + radius * Math.sin(angle);
    const arc = `M ${center} ${center - radius} A ${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${endX} ${endY}`;
    // The pill follows the ring: its long side is the tangent at the end of the arc, and the dot
    // sits at the end the arc comes from.
    const tangentDeg = (angle * 180) / Math.PI + 90;
    const trail = knobLength / 2 - knobRadius;
    const dotX = endX - Math.cos(angle + Math.PI / 2) * trail;
    const dotY = endY - Math.sin(angle + Math.PI / 2) * trail;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={{ position: 'absolute' }} {...DECORATIVE_SVG_PROPS}>
                <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
                {share >= 0.999 ? (
                    <Circle cx={center} cy={center} r={radius} stroke={progressColor} strokeWidth={strokeWidth} fill="none" />
                ) : share > 0 ? (
                    <Path d={arc} stroke={progressColor} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
                ) : null}
                <Path d={capsulePath(endX, endY, knobLength, knobRadius, tangentDeg)} fill={knobColor} />
                <Circle cx={dotX} cy={dotY} r={knobRadius * 0.5} fill={knobDotColor} />
            </Svg>
            {children}
        </View>
    );
}
