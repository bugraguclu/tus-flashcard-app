import { memo, type ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { OCCLUSION_DEFAULT_FILL, occlusionFill, occlusionGeometry, type OcclusionShape } from '../../lib/imageOcclusion';
import {
    labelBox,
    labelFontSize,
    polygonHandles,
    polygonPoints,
    resizeHandle,
    rotateHandle,
    shapeBox,
    shapeCentre,
    type Box,
    type Point,
    type Size,
} from './occlusionEditorModel';

const STROKE = '#212121';

export type OcclusionDraft =
    | { kind: 'rect' | 'ellipse'; box: Box }
    | { kind: 'polygon'; points: Point[] };

interface Props {
    shapes: readonly OcclusionShape[];
    /** The picture's size on screen, in points. */
    size: Size;
    natural: Size;
    accent: string;
    selected?: ReadonlySet<number>;
    /** A drag in progress: the selected shapes drawn moved by this many image fractions. */
    offset?: Point;
    draft?: OcclusionDraft | null;
    /** The cloze number on each mask, so a group reads as one question. */
    showNumbers?: boolean;
    /** The selected corner of a selected polygon. */
    activeCorner?: number | null;
}

/**
 * The masks of an Image Occlusion note over its picture, as the editor and the Add screen show
 * them: each mask in its own fill (Anki's yellow by default), a selected one outlined, and its
 * cloze number in a badge. A text label sits on a white box as Anki draws it. A single selected
 * shape shows its handles: resize (rect, ellipse), turn, and a polygon's corners and edge midpoints.
 */
function OcclusionShapesSvg({ shapes, size, natural, accent, selected, offset, draft, showNumbers = true, activeCorner = null }: Props) {
    const shown: ReactNode[] = [];
    const badges: ReactNode[] = [];
    shapes.forEach((shape, index) => {
        const geometry = occlusionGeometry(shape);
        if (!geometry) return;
        const isSelected = selected?.has(index) ?? false;
        const moved = isSelected && offset ? `translate(${offset.x * size.width} ${offset.y * size.height})` : '';
        const turned = geometry.angle && geometry.kind !== 'polygon'
            ? `rotate(${geometry.angle} ${geometry.left * size.width} ${geometry.top * size.height})`
            : '';
        const transform = [moved, turned].filter(Boolean).join(' ') || undefined;
        const paint = {
            fill: occlusionFill(shape) ?? OCCLUSION_DEFAULT_FILL,
            fillOpacity: 0.85,
            stroke: isSelected ? accent : STROKE,
            strokeWidth: isSelected ? 2.5 : 1,
        };
        const box = shapeBox(geometry, size, natural);
        let element: ReactNode = null;
        if (geometry.kind === 'rect') {
            element = <Rect x={box.left} y={box.top} width={box.width} height={box.height} {...paint} />;
        } else if (geometry.kind === 'ellipse') {
            element = <Ellipse cx={box.left + box.width / 2} cy={box.top + box.height / 2} rx={box.width / 2} ry={box.height / 2} {...paint} />;
        } else if (geometry.kind === 'polygon') {
            const points = polygonPoints(geometry).map(([x, y]) => `${x * size.width},${y * size.height}`).join(' ');
            element = <Polygon points={points} {...paint} />;
        } else {
            const font = labelFontSize(geometry, size, natural);
            const label = labelBox(geometry, size, natural);
            element = (
                <G>
                    <Rect x={label.left} y={label.top} width={label.width} height={label.height} fill="#ffffff"
                        stroke={isSelected ? accent : 'none'} strokeWidth={isSelected ? 2 : 0} />
                    {geometry.text.split('\n').map((line, lineIndex) => (
                        <SvgText key={lineIndex} x={label.left} y={label.top + font * (0.86 + lineIndex * 1.07)}
                            fontSize={font} fontFamily="Arial" fill={occlusionFill(shape) ?? '#000000'}>
                            {line}
                        </SvgText>
                    ))}
                </G>
            );
        }
        shown.push(<G key={index} transform={transform}>{element}</G>);
        if (showNumbers && shape.ordinal > 0) {
            const x = box.left + (offset && isSelected ? offset.x * size.width : 0);
            const y = box.top + (offset && isSelected ? offset.y * size.height : 0);
            badges.push(
                <G key={`n${index}`}>
                    <Circle cx={x} cy={y} r={10} fill={isSelected ? accent : STROKE} />
                    <SvgText x={x} y={y + 4} fontSize={11} fontWeight="bold" fill="#ffffff" textAnchor="middle">{String(shape.ordinal)}</SvgText>
                </G>,
            );
        }
    });

    const single = selected && selected.size === 1 && !offset ? shapes[[...selected][0]] : undefined;
    const handle = resizeHandle(single, size, natural);
    const turnHandle = rotateHandle(single, size, natural);
    const centre = single ? shapeCentre(single, size, natural) : null;
    const corners = polygonHandles(single, size);
    const draftPaint = { fill: OCCLUSION_DEFAULT_FILL, fillOpacity: 0.6, stroke: accent, strokeWidth: 2, strokeDasharray: '6 4' };

    return (
        <Svg width={size.width} height={size.height} style={{ position: 'absolute', left: 0, top: 0 }}>
            {shown}
            {badges}
            {turnHandle && centre && (
                <G>
                    <Line x1={centre.x} y1={centre.y} x2={turnHandle.x} y2={turnHandle.y} stroke={accent} strokeWidth={1.5} strokeDasharray="4 3" />
                    <Circle cx={turnHandle.x} cy={turnHandle.y} r={11} fill="#ffffff" stroke={accent} strokeWidth={2.5} />
                    <Path d={`M${turnHandle.x - 4.5} ${turnHandle.y - 1.5}a5 5 0 1 0 2 -3.2m-0.5 -2.6v2.8h2.8`}
                        stroke={accent} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </G>
            )}
            {corners?.midpoints.map((point, index) => (
                <Circle key={`m${index}`} cx={point.x} cy={point.y} r={5} fill="rgba(255,255,255,0.55)" stroke={accent} strokeWidth={1.5} />
            ))}
            {corners?.corners.map((point, index) => (
                <Circle key={`c${index}`} cx={point.x} cy={point.y} r={index === activeCorner ? 9 : 7}
                    fill={index === activeCorner ? accent : '#ffffff'} stroke={accent} strokeWidth={2.5} />
            ))}
            {handle && <Rect x={handle.x - 8} y={handle.y - 8} width={16} height={16} rx={3} fill="#ffffff" stroke={accent} strokeWidth={2.5} />}
            {draft?.kind === 'rect' && (
                <Rect x={draft.box.left * size.width} y={draft.box.top * size.height}
                    width={draft.box.width * size.width} height={draft.box.height * size.height} {...draftPaint} />
            )}
            {draft?.kind === 'ellipse' && (
                <Ellipse cx={(draft.box.left + draft.box.width / 2) * size.width} cy={(draft.box.top + draft.box.height / 2) * size.height}
                    rx={(draft.box.width / 2) * size.width} ry={(draft.box.height / 2) * size.height} {...draftPaint} />
            )}
            {draft?.kind === 'polygon' && draft.points.length > 0 && (
                <G>
                    <Polyline points={draft.points.map((p) => `${p.x * size.width},${p.y * size.height}`).join(' ')}
                        fill="none" stroke={accent} strokeWidth={2} strokeDasharray="6 4" />
                    {draft.points.map((p, index) => (
                        <Circle key={index} cx={p.x * size.width} cy={p.y * size.height} r={index === 0 ? 8 : 5}
                            fill={index === 0 ? accent : '#ffffff'} stroke={accent} strokeWidth={2} />
                    ))}
                </G>
            )}
        </Svg>
    );
}

export default memo(OcclusionShapesSvg);
