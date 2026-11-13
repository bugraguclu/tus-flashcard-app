import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Text } from '../AppText';
import { useIsDarkTheme, useThemeColors } from '../../constants/theme';
import { studySubjectInitial } from '../../lib/studyCalendar';
import { subjectArtName, type SubjectArtName } from '../../lib/subjectArt';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import { capsulePath, halfCapsulePath, turnedPolygon } from './svgShapes';

/**
 * Pictures of the TUS courses for the Kronometre's cards and its course grid, where TUSBuddy
 * shows a picture of each course. They are TusAnkiM's own drawings — a stack of books for
 * "Karışık", a bone, a flask, a stethoscope and so on — on a 48-unit grid; a subject without one
 * (a deck's own name) keeps its initial letter.
 */

/** The light tint each picture sits on, as TUSBuddy tints its course tiles. */
const TILE_TINTS: Record<SubjectArtName, string> = {
    mixed: '#fdf1e3',
    anatomy: '#e6eef9',
    biochemistry: '#eeeafb',
    internal: '#f6ecea',
    pharmacology: '#fbecee',
    physiology: '#fdecec',
    microbiology: '#e7f5eb',
    pathology: '#e8f0f8',
    surgery: '#e7f3f2',
    obstetrics: '#fcecf2',
    pediatrics: '#fef5e3',
    minor: '#e6f3f1',
    histology: '#f8eef6',
    genetics: '#eaf1fb',
};

const RED = '#e05a5a';
const BLUE = '#4a90d9';
const STEEL = '#7d8b96';
const DARK_STEEL = '#4f5b63';

function hexagonPath(cx: number, cy: number, r: number): string {
    const points: [number, number][] = [];
    for (let i = 0; i < 6; i += 1) {
        const angle = ((60 * i - 90) * Math.PI) / 180;
        points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return turnedPolygon(points, cx, cy, 0);
}

function Books() {
    return (
        <>
            <Rect x={7} y={29} width={34} height={8.5} rx={2} fill={BLUE} />
            <Rect x={34} y={30.6} width={5.4} height={5.3} rx={1} fill="#ffffff" />
            <Rect x={10.5} y={32.5} width={15} height={1.7} rx={0.85} fill="#a8d0f5" />
            <Rect x={10} y={20.5} width={30} height={8.5} rx={2} fill="#f2994a" />
            <Rect x={11.6} y={22.1} width={5.2} height={5.3} rx={1} fill="#ffffff" />
            <Rect x={21} y={24} width={14} height={1.7} rx={0.85} fill="#f9c895" />
            <Rect x={8} y={12} width={28} height={8.5} rx={2} fill="#5bb974" />
            <Rect x={29} y={13.6} width={5.2} height={5.3} rx={1} fill="#ffffff" />
            <Rect x={11.5} y={15.5} width={13} height={1.7} rx={0.85} fill="#a6ddb2" />
        </>
    );
}

function Bone() {
    const knobs: [number, number][] = [[10.1, 32.9], [15.1, 38], [32.9, 10.1], [38, 15.1]];
    return (
        <>
            <Line x1={14} y1={34} x2={34} y2={14} stroke="#c8ae86" strokeWidth={10} strokeLinecap="round" />
            {knobs.map(([x, y]) => <Circle key={`o${x}`} cx={x} cy={y} r={6.4} fill="#c8ae86" />)}
            <Line x1={14} y1={34} x2={34} y2={14} stroke="#f4e6cc" strokeWidth={7} strokeLinecap="round" />
            {knobs.map(([x, y]) => <Circle key={`f${x}`} cx={x} cy={y} r={5} fill="#f4e6cc" />)}
            <Line x1={17} y1={29} x2={29} y2={17} stroke="#fff8ec" strokeWidth={2} strokeLinecap="round" />
        </>
    );
}

function Flask() {
    const glass = 'M19 9 H29 V19 L38.5 35.5 Q40.5 40 35.5 40 H12.5 Q7.5 40 9.5 35.5 L19 19 Z';
    return (
        <>
            <Path d={glass} fill="#e3f1f8" />
            <Path d="M13.8 28 H34.2 L38.5 35.5 Q40.5 40 35.5 40 H12.5 Q7.5 40 9.5 35.5 Z" fill="#8e6fd1" />
            <Line x1={14.4} y1={28.4} x2={33.6} y2={28.4} stroke="#b9a4ea" strokeWidth={1.4} />
            <Circle cx={20} cy={34} r={1.9} fill="#cdbdf2" />
            <Circle cx={27.5} cy={35.5} r={1.3} fill="#cdbdf2" />
            <Circle cx={25} cy={31} r={1.1} fill="#cdbdf2" />
            <Path d={glass} fill="none" stroke="#5e7f92" strokeWidth={1.8} strokeLinejoin="round" />
            <Rect x={17} y={7} width={14} height={3.4} rx={1.7} fill="#5e7f92" />
            <Circle cx={28} cy={3.8} r={1.6} fill="#8e6fd1" opacity={0.75} />
            <Circle cx={22.5} cy={4.6} r={1.1} fill="#8e6fd1" opacity={0.6} />
        </>
    );
}

function Stethoscope() {
    return (
        <>
            <Path d="M15 8 V17 Q15 26 23 26 Q31 26 31 17 V8" fill="none" stroke={STEEL} strokeWidth={2.6} strokeLinecap="round" />
            <Circle cx={15} cy={6.8} r={2.4} fill="#3e4a52" />
            <Circle cx={31} cy={6.8} r={2.4} fill="#3e4a52" />
            <Path d="M23 26 V31 Q23 40 30.5 40 Q37 40 37.5 34" fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={37.5} cy={30} r={5.8} fill="#9aa6af" />
            <Circle cx={37.5} cy={30} r={3.5} fill="#dce3e8" />
            <Circle cx={37.5} cy={30} r={1.3} fill="#9aa6af" />
        </>
    );
}

function Pills() {
    return (
        <>
            <Path d={capsulePath(20.5, 21.5, 27, 6.5, -45)} fill="#ffffff" stroke="#d5dce1" strokeWidth={1} />
            <Path d={halfCapsulePath(20.5, 21.5, 27, 6.5, -45)} fill={RED} />
            <Line x1={22.5} y1={15.5} x2={26.5} y2={11.5} stroke="#eef2f5" strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={34} cy={34.5} r={7.6} fill="#a8d0f5" stroke="#7db3e3" strokeWidth={1.2} />
            <Line x1={29.4} y1={34.5} x2={38.6} y2={34.5} stroke="#7db3e3" strokeWidth={1.6} strokeLinecap="round" />
        </>
    );
}

function Heart() {
    return (
        <>
            <Path
                d="M24 40 C11 31.5 6.5 24 9.5 17 C12 11 19.5 10 24 15.5 C28.5 10 36 11 38.5 17 C41.5 24 37 31.5 24 40 Z"
                fill={RED}
            />
            <Path d="M13.2 18.2 C14.2 15.4 16.6 14 19 14.4" fill="none" stroke="#f4a3a3" strokeWidth={2} strokeLinecap="round" />
            <Path
                d="M10.5 25 H16 L18.6 19.5 L22.2 31 L26 21 L28.4 25 H37.5"
                fill="none"
                stroke="#ffffff"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>
    );
}

function Virus() {
    const spikes = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => (degrees * Math.PI) / 180);
    return (
        <>
            {spikes.map((angle) => (
                <Line
                    key={`s${angle}`}
                    x1={24 + 9.5 * Math.cos(angle)}
                    y1={24 + 9.5 * Math.sin(angle)}
                    x2={24 + 15 * Math.cos(angle)}
                    y2={24 + 15 * Math.sin(angle)}
                    stroke="#3e9b57"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                />
            ))}
            {spikes.map((angle) => (
                <Circle key={`k${angle}`} cx={24 + 15.6 * Math.cos(angle)} cy={24 + 15.6 * Math.sin(angle)} r={2.4} fill="#3e9b57" />
            ))}
            <Circle cx={24} cy={24} r={11} fill="#5bb974" />
            <Circle cx={20} cy={21} r={2.6} fill="#a6ddb2" />
            <Circle cx={27.5} cy={26.5} r={3.2} fill="#a6ddb2" />
            <Circle cx={26.5} cy={18.5} r={1.6} fill="#a6ddb2" />
            <Circle cx={19.5} cy={28.5} r={1.4} fill="#a6ddb2" />
        </>
    );
}

function Microscope() {
    const tubeCenter: [number, number] = [17.4, 14.6];
    const box = (cx: number, cy: number, w: number, h: number): [number, number][] => [
        [cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2],
    ];
    const tilt = -21;
    return (
        <>
            <Path d="M31 38 V31 C31 24.5 27.5 20.5 22.5 19.5" fill="none" stroke={STEEL} strokeWidth={4.2} strokeLinecap="round" />
            <Rect x={10} y={38} width={28} height={4.6} rx={2.3} fill={DARK_STEEL} />
            <Rect x={12.5} y={29} width={19} height={3.2} rx={1.6} fill={DARK_STEEL} />
            <Rect x={15.5} y={27.4} width={9.5} height={1.9} rx={0.6} fill="#9fd0f2" />
            <Circle cx={31} cy={33} r={2.8} fill={DARK_STEEL} />
            <Path d={turnedPolygon(box(tubeCenter[0], tubeCenter[1], 6.6, 18.4), tubeCenter[0], tubeCenter[1], tilt)} fill={BLUE} />
            <Path d={turnedPolygon(box(13.6, 4.8, 5, 3.8), tubeCenter[0], tubeCenter[1], tilt)} fill="#2f5f8f" />
            <Path d={turnedPolygon(box(17.4, 25.2, 3.8, 3.6), tubeCenter[0], tubeCenter[1], tilt)} fill={DARK_STEEL} />
        </>
    );
}

function Scalpel() {
    // The blade, drawn lying along the x axis from (24, 24) and turned to point up and right.
    const blade: [number, number][] = [
        [23.5, 20.4], [34.5, 20.4], [40.5, 23.2], [38.6, 26.8], [36, 28.4], [32, 28.9], [28, 28.7], [23.5, 28.4],
    ];
    return (
        <>
            <Path d={capsulePath(15.8, 32.2, 25, 4.2, -45)} fill="#9aa6af" />
            {[0, 1, 2].map((index) => {
                const cx = 12.6 + index * 2.9;
                const cy = 35.4 - index * 2.9;
                return <Path key={index} d={capsulePath(cx, cy, 6.4, 0.75, 45)} fill="#6f7c86" />;
            })}
            <Path d={turnedPolygon(blade, 24, 24, -45)} fill="#dce3e8" stroke="#8c99a3" strokeWidth={1.2} strokeLinejoin="round" />
            <Path d={capsulePath(29.6, 18.8, 11, 0.8, -45)} fill="#ffffff" />
        </>
    );
}

function Uterus() {
    return (
        <>
            <Path d="M18.5 17 C14 12.5 9.5 12.5 7.6 16.6" fill="none" stroke="#ee7f9d" strokeWidth={2.6} strokeLinecap="round" />
            <Path d="M29.5 17 C34 12.5 38.5 12.5 40.4 16.6" fill="none" stroke="#ee7f9d" strokeWidth={2.6} strokeLinecap="round" />
            <Circle cx={8} cy={20.4} r={3.4} fill="#f7b3c5" />
            <Circle cx={40} cy={20.4} r={3.4} fill="#f7b3c5" />
            <Path d="M17 16 Q24 12.5 31 16 Q34 25 27.5 31 V36.5 Q24 38.5 20.5 36.5 V31 Q14 25 17 16 Z" fill="#f28ba8" />
            <Path d="M20 18.6 Q24 17 28 18.6 Q28.6 24.2 24 28.4 Q19.4 24.2 20 18.6 Z" fill="#fbd0dc" />
            <Path
                d="M24 25.6 C21.6 24 20.7 22.6 21.4 21.4 C22 20.4 23.3 20.3 24 21.3 C24.7 20.3 26 20.4 26.6 21.4 C27.3 22.6 26.4 24 24 25.6 Z"
                fill="#e05a7a"
            />
            <Rect x={21.6} y={36} width={4.8} height={5.2} rx={1.6} fill="#f28ba8" />
        </>
    );
}

function Baby() {
    return (
        <>
            <Circle cx={10.6} cy={27} r={3.1} fill="#f2bf9c" />
            <Circle cx={37.4} cy={27} r={3.1} fill="#f2bf9c" />
            <Circle cx={24} cy={26} r={14} fill="#f9d5ba" />
            <Path d="M24.6 12.4 C21.4 11.4 20.2 14.2 22.2 15.4 C23.8 16.3 25.6 14.8 24.6 13.4" fill="none" stroke="#8c5a3c" strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M17 25 Q19 27 21 25" fill="none" stroke="#5b4636" strokeWidth={1.6} strokeLinecap="round" />
            <Path d="M27 25 Q29 27 31 25" fill="none" stroke="#5b4636" strokeWidth={1.6} strokeLinecap="round" />
            <Circle cx={15.6} cy={30} r={2.4} fill="#f6a9a0" opacity={0.75} />
            <Circle cx={32.4} cy={30} r={2.4} fill="#f6a9a0" opacity={0.75} />
            <Circle cx={24} cy={38.6} r={2.8} fill="none" stroke={BLUE} strokeWidth={1.8} />
            <Path d="M19.4 33 Q24 30.4 28.6 33 Q28.1 36.6 24 36.6 Q19.9 36.6 19.4 33 Z" fill={BLUE} />
            <Circle cx={24} cy={33.8} r={1.3} fill="#a8d0f5" />
        </>
    );
}

function DoctorBag() {
    return (
        <>
            <Path d="M18 15.5 V11.8 Q18 9 20.8 9 H27.2 Q30 9 30 11.8 V15.5" fill="none" stroke="#3e4a52" strokeWidth={2.6} strokeLinecap="round" />
            <Rect x={8} y={15} width={32} height={24.5} rx={5} fill="#2f8f83" />
            <Rect x={8} y={20} width={32} height={2.4} fill="#26766c" />
            <Circle cx={24} cy={30} r={7} fill="#ffffff" />
            <Rect x={22.4} y={25.6} width={3.2} height={8.8} rx={1} fill={RED} />
            <Rect x={19.6} y={28.4} width={8.8} height={3.2} rx={1} fill={RED} />
        </>
    );
}

function Cells() {
    const centers: [number, number][] = [
        [18.1, 14.8], [29.9, 14.8], [12.2, 25], [24, 25], [35.8, 25], [18.1, 35.2], [29.9, 35.2],
    ];
    return (
        <>
            {centers.map(([x, y]) => (
                <Path key={`c${x}${y}`} d={hexagonPath(x, y, 6.2)} fill="#f7c6d9" stroke="#e79bb8" strokeWidth={1.1} strokeLinejoin="round" />
            ))}
            {centers.map(([x, y]) => <Circle key={`n${x}${y}`} cx={x + 0.8} cy={y - 0.6} r={2} fill="#7b5bc4" />)}
        </>
    );
}

function Helix() {
    const rungs = [9, 15, 21, 27, 33, 39];
    return (
        <>
            {rungs.map((y) => (
                <React.Fragment key={y}>
                    <Line x1={17.7} y1={y} x2={24} y2={y} stroke="#f6c453" strokeWidth={2} />
                    <Line x1={24} y1={y} x2={30.3} y2={y} stroke="#5bb974" strokeWidth={2} />
                </React.Fragment>
            ))}
            <Path d="M16 6 C16 12 32 12 32 18 S16 24 16 30 S32 36 32 42" fill="none" stroke={BLUE} strokeWidth={3} strokeLinecap="round" />
            <Path d="M32 6 C32 12 16 12 16 18 S32 24 32 30 S16 36 16 42" fill="none" stroke={RED} strokeWidth={3} strokeLinecap="round" />
        </>
    );
}

const ART: Record<SubjectArtName, React.ComponentType> = {
    mixed: Books,
    anatomy: Bone,
    biochemistry: Flask,
    internal: Stethoscope,
    pharmacology: Pills,
    physiology: Heart,
    microbiology: Virus,
    pathology: Microscope,
    surgery: Scalpel,
    obstetrics: Uterus,
    pediatrics: Baby,
    minor: DoctorBag,
    histology: Cells,
    genetics: Helix,
};

/** A course's picture on its own, `size` points square; nothing for a subject without one. */
export function SubjectArt({ subject, size }: { subject: string; size: number }) {
    const name = subjectArtName(subject);
    if (!name) return null;
    const Drawing = ART[name];
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" {...DECORATIVE_SVG_PROPS}>
            <Drawing />
        </Svg>
    );
}

interface SubjectTileProps {
    subject: string;
    width?: number;
    height?: number;
    style?: StyleProp<ViewStyle>;
}

/**
 * The tile at the start of a study card: the course's picture on its tint, or the subject's
 * initial for a subject without a picture.
 */
export function SubjectTile({ subject, width = 46, height = 56, style }: SubjectTileProps) {
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const name = subjectArtName(subject);
    const background = name && !isDark ? TILE_TINTS[name] : colors.bgInput;
    return (
        <View
            style={[styles.tile, { width, height, backgroundColor: background }, style]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {name ? (
                <SubjectArt subject={subject} size={Math.min(width, height) * 0.84} />
            ) : (
                <Text style={[styles.initial, { color: colors.accent }]}>{studySubjectInitial(subject)}</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    tile: { borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    initial: { fontSize: 20, fontWeight: '800' },
});
