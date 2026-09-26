import React from 'react';
import { Image as NativeImage } from 'react-native';
import { Ellipse, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
    calculatePhotoTextBounds,
    normalizePhotoRotation,
    normalizedRect,
    photoArrowHead,
    photoImageBounds,
    photoTextAnchorPixels,
    photoTextColors,
    scalePhotoAnnotation,
    resolvePhotoTextAlign,
    type PhotoAnnotation,
    type PhotoPoint,
} from '../../lib/photoEditor';

function smoothPath(points: PhotoPoint[], width: number, height: number): string {
    if (!points.length) return '';
    const px = (point: PhotoPoint) => ({ x: point.x * width, y: point.y * height });
    const first = px(points[0]);
    if (points.length === 1) return `M${first.x},${first.y} L${first.x + 0.01},${first.y}`;
    let path = `M${first.x},${first.y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
        const current = px(points[index]);
        const next = px(points[index + 1]);
        path += ` Q${current.x},${current.y} ${(current.x + next.x) / 2},${(current.y + next.y) / 2}`;
    }
    const last = px(points[points.length - 1]);
    return `${path} L${last.x},${last.y}`;
}

/**
 * One annotation on a surface `width` x `height`. `scale` says how much larger that surface is
 * than the canvas the annotation was drawn on: positions are normalised and follow on their own,
 * but widths, font sizes and the fixed sizes below are in canvas units and have to be taken up
 * with it, or an export renders the same drawing in hairlines.
 */
export function renderAnnotation(
    source: PhotoAnnotation | null | undefined,
    width: number,
    height: number,
    scale = 1,
) {
    if (!source) return null;
    const annotation = scalePhotoAnnotation(source, scale);
    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        if (!points.length) return null;
        return (
            <Path
                key={annotation.id}
                d={smoothPath(points, width, height)}
                stroke={annotation.color || '#000000'}
                strokeWidth={annotation.width || 2 * scale}
                strokeOpacity={annotation.opacity ?? 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        );
    }

    if (annotation.type === 'text') {
        if (!annotation.point) return null;
        const bounds = calculatePhotoTextBounds(annotation, width, height);
        const bgStyle = annotation.bgStyle || 'classic';
        const textColor = annotation.color || '#ffffff';
        const textAlign = resolvePhotoTextAlign(annotation);
        const textAnchor = textAlign === 'left' ? 'start' : textAlign === 'right' ? 'end' : 'middle';
        const textX = textAlign === 'left'
            ? bounds.x + bounds.paddingX
            : textAlign === 'right'
                ? bounds.x + bounds.width - bounds.paddingX
                : bounds.x + bounds.width / 2;

        const { background: badgeBgColor, text: finalTextColor } = photoTextColors(annotation);

        const anchor = photoTextAnchorPixels(annotation, width, height);
        const rotation = normalizePhotoRotation(annotation.rotation ?? 0);

        return (
            <G
                key={annotation.id}
                transform={rotation ? `rotate(${rotation}, ${anchor.x}, ${anchor.y})` : undefined}
            >
                {bgStyle !== 'classic' && (
                    <Rect
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        rx={Math.max(6 * scale, (annotation.fontSize || 20 * scale) * 0.3)}
                        ry={Math.max(6 * scale, (annotation.fontSize || 20 * scale) * 0.3)}
                        fill={bgStyle === 'outline' ? 'none' : badgeBgColor}
                        fillOpacity={bgStyle === 'frosted' ? 0.75 : 1}
                        stroke={bgStyle === 'outline' ? textColor : 'none'}
                        strokeWidth={bgStyle === 'outline' ? 2.5 * scale : 0}
                    />
                )}
                {bounds.lines.map((line, lineIndex) => {
                    const lineY = bounds.y + bounds.paddingY + (lineIndex + 0.82) * bounds.lineHeight;
                    return (
                        <React.Fragment key={`${annotation.id}-${lineIndex}`}>
                            {bgStyle === 'classic' && (
                                <SvgText
                                    x={textX}
                                    y={lineY}
                                    fill={textColor === '#ffffff' ? '#111827' : '#ffffff'}
                                    stroke={textColor === '#ffffff' ? '#111827' : '#ffffff'}
                                    strokeWidth={Math.max(3 * scale, (annotation.fontSize || 20 * scale) * 0.18)}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    fontSize={annotation.fontSize || 20 * scale}
                                    fontWeight="800"
                                    textAnchor={textAnchor}
                                >
                                    {line}
                                </SvgText>
                            )}
                            <SvgText
                                x={textX}
                                y={lineY}
                                fill={finalTextColor}
                                fontSize={annotation.fontSize || 20 * scale}
                                fontWeight="800"
                                textAnchor={textAnchor}
                            >
                                {line}
                            </SvgText>
                        </React.Fragment>
                    );
                })}
            </G>
        );
    }

    // Pictures are laid out in their own layer beneath this one (`renderPlacedPictures`), so
    // every stroke, label and shape is drawn over them however late a picture is added.
    if (annotation.type === 'image') return null;

    if (!annotation.start || !annotation.end) return null;
    const start = { x: (annotation.start.x ?? 0) * width, y: (annotation.start.y ?? 0) * height };
    const end = { x: (annotation.end.x ?? 0) * width, y: (annotation.end.y ?? 0) * height };
    if (annotation.type === 'arrow') {
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 12 * scale + (annotation.width || 3 * scale) * 1.5);
        return (
            <React.Fragment key={annotation.id}>
                <Line
                    x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                    stroke={annotation.color} strokeWidth={annotation.width || 3 * scale}
                    strokeOpacity={annotation.opacity ?? 1} strokeLinecap="round"
                />
                <Polygon
                    points={head.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill={annotation.color}
                    fillOpacity={annotation.opacity ?? 1}
                />
            </React.Fragment>
        );
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    if (annotation.type === 'ellipse') {
        return (
            <Ellipse
                key={annotation.id}
                cx={(rect.x + rect.width / 2) * width}
                cy={(rect.y + rect.height / 2) * height}
                rx={rect.width * width / 2}
                ry={rect.height * height / 2}
                stroke={annotation.color}
                strokeWidth={annotation.width || 3 * scale}
                strokeOpacity={annotation.opacity ?? 1}
                fill="none"
            />
        );
    }
    return (
        <Rect
            key={annotation.id}
            x={rect.x * width}
            y={rect.y * height}
            width={rect.width * width}
            height={rect.height * height}
            stroke={annotation.color}
            strokeWidth={annotation.width || 3 * scale}
            strokeOpacity={annotation.opacity ?? 1}
            fill={annotation.type === 'cover' ? annotation.color : 'none'}
            fillOpacity={annotation.type === 'cover' ? 0.96 : 0}
        />
    );
}

/**
 * The pictures a page carries, laid out as real views under the ink.
 *
 * They are views rather than SVG nodes because both exporters have to be able to wait for them:
 * the native export photographs this same tree off screen, and a picture that had not decoded
 * yet would be photographed as a hole in the drawing. `onReady` is how that wait is counted.
 */
export function renderPlacedPictures(
    annotations: PhotoAnnotation[],
    width: number,
    height: number,
    scale = 1,
    onReady?: () => void,
) {
    return annotations.map((source, index) => {
        if (source.type !== 'image') return null;
        const picture = scalePhotoAnnotation(source, scale);
        const bounds = photoImageBounds(picture, width, height);
        const rotation = normalizePhotoRotation(picture.rotation ?? 0);
        return (
            <NativeImage
                // Two copies of one picture are two placements, so the index keeps them apart
                // even if a duplicate ever shares an id.
                key={`${picture.id}-${index}`}
                source={{ uri: picture.uri }}
                fadeDuration={0}
                resizeMode="stretch"
                onLoad={onReady}
                onError={onReady}
                style={{
                    position: 'absolute',
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                    // A view transform turns around the view's own centre, which is where the
                    // picture's anchor is, so no origin has to be spelled out here.
                    transform: rotation ? [{ rotate: `${rotation}deg` }] : undefined,
                }}
            />
        );
    });
}
