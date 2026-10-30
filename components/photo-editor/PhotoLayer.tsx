import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, FeColorMatrix, Filter, G, Image as SvgImage } from 'react-native-svg';
import type { PhotoCropRect } from '../../lib/photoEditor';
import { photoColorMatrixValues } from '../../lib/photoAdjustments';
import { photoAffineToSvg, photoDisplayTransform, type PhotoGeometry, type PhotoSize } from '../../lib/photoGeometry';
import { makeId } from './editorModel';

interface PhotoLayerProps {
    uri: string;
    /** The pixel size of the image at `uri`, upright as it was picked. */
    source: PhotoSize;
    orientation: Pick<PhotoGeometry, 'quarterTurns' | 'flipped'>;
    /** The part of the turned photo the canvas shows: the crop, or all of it. */
    window: PhotoCropRect;
    canvas: PhotoSize;
    /** The light and colour to show it with, or null for the photo as it is. */
    matrix: number[] | null;
    onLoad?: () => void;
}

/**
 * The photo as the editor shows it: turned, mirrored and cropped by one transform, and passed
 * through the colour matrix, all without touching its pixels. The same layer, drawn at export
 * size, is what the native export photographs, so the card gets what was on screen.
 */
export const PhotoLayer = memo(function PhotoLayer({ uri, source, orientation, window, canvas, matrix, onLoad }: PhotoLayerProps) {
    // Each layer needs its own filter id: on the web every SVG shares the page's id space.
    const filterId = useMemo(() => `photo-light-${makeId()}`, []);
    const transform = photoAffineToSvg(photoDisplayTransform(source, orientation, window, canvas));
    return (
        <Svg width={canvas.width} height={canvas.height} style={StyleSheet.absoluteFill}>
            {matrix && (
                <Defs>
                    <Filter id={filterId} x="0%" y="0%" width="100%" height="100%">
                        <FeColorMatrix type="matrix" values={photoColorMatrixValues(matrix)} />
                    </Filter>
                </Defs>
            )}
            <G transform={transform}>
                <SvgImage
                    href={uri}
                    x={0}
                    y={0}
                    width={source.width}
                    height={source.height}
                    preserveAspectRatio="none"
                    filter={matrix ? `url(#${filterId})` : undefined}
                    onLoad={onLoad}
                />
            </G>
        </Svg>
    );
});
