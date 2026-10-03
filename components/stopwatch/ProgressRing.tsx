import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

interface ProgressRingProps {
    size: number;
    strokeWidth: number;
    /** 0 to 1. */
    progress: number;
    trackColor: string;
    progressColor: string;
    knobColor: string;
    children?: React.ReactNode;
}

/**
 * The daily goal ring: a track, the share of the goal studied so far drawn clockwise from the top,
 * and a knob where that share ends. The arc is a computed path rather than a rotated dashed
 * circle, so it renders the same on iPhone and on the web without SVG transforms.
 */
export default function ProgressRing({
    size,
    strokeWidth,
    progress,
    trackColor,
    progressColor,
    knobColor,
    children,
}: ProgressRingProps) {
    const knobRadius = strokeWidth * 0.95;
    const center = size / 2;
    const radius = center - knobRadius - 1;
    const share = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const angle = -Math.PI / 2 + share * 2 * Math.PI;
    const endX = center + radius * Math.cos(angle);
    const endY = center + radius * Math.sin(angle);
    const arc = `M ${center} ${center - radius} A ${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${endX} ${endY}`;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={{ position: 'absolute' }} {...DECORATIVE_SVG_PROPS}>
                <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
                {share >= 0.999 ? (
                    <Circle cx={center} cy={center} r={radius} stroke={progressColor} strokeWidth={strokeWidth} fill="none" />
                ) : share > 0 ? (
                    <Path d={arc} stroke={progressColor} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
                ) : null}
                <Circle cx={endX} cy={endY} r={knobRadius} fill={knobColor} stroke={trackColor} strokeWidth={1} />
                <Circle cx={endX} cy={endY} r={knobRadius * 0.38} fill={progressColor} />
            </Svg>
            {children}
        </View>
    );
}
