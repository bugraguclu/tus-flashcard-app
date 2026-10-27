import type { RefObject } from 'react';
import { Image as NativeImage, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import type { PhotoAnnotation } from '../../lib/photoEditor';
import { scaleBlankCanvasRuling } from '../../lib/blankCanvas';
import PaperSwatch from '../PaperSwatch';
import type { EditorPage, ExportSurface } from './editorModel';
import { renderAnnotation, renderPlacedPictures } from './annotationRendering';

interface ExportSurfaceViewProps {
    exportSurface: ExportSurface;
    exportSurfaceRef: RefObject<View | null>;
    exportLaidOutRef: RefObject<boolean>;
    exportPhotoLoadedRef: RefObject<boolean>;
    exportPicturesReadyRef: RefObject<number>;
    page: EditorPage | null;
    sourceUri: string;
    sourceSize: { width: number; height: number };
    annotations: PhotoAnnotation[];
}

/** The drawing again, at export size and off screen, for the native export to photograph. */
export function ExportSurfaceView({
    exportSurface,
    exportSurfaceRef,
    exportLaidOutRef,
    exportPhotoLoadedRef,
    exportPicturesReadyRef,
    page,
    sourceUri,
    sourceSize,
    annotations,
}: ExportSurfaceViewProps) {
    return (
        <View
            ref={exportSurfaceRef}
            collapsable={false}
            onLayout={() => { exportLaidOutRef.current = true; }}
            style={[
                styles.surface,
                { width: exportSurface.width, height: exportSurface.height },
                { pointerEvents: 'none' },
            ]}
        >
            {page ? (
                <PaperSwatch
                    paper={page.paper}
                    background={page.background}
                    width={exportSurface.width}
                    height={exportSurface.height}
                    ruling={scaleBlankCanvasRuling(
                        page.ruling,
                        exportSurface.width / Math.max(1, sourceSize.width),
                    )}
                    style={StyleSheet.absoluteFill}
                />
            ) : sourceUri ? (
                <NativeImage
                    source={{ uri: sourceUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="stretch"
                    fadeDuration={0}
                    onLoad={() => { exportPhotoLoadedRef.current = true; }}
                    onError={() => { exportPhotoLoadedRef.current = true; }}
                />
            ) : null}
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                {renderPlacedPictures(
                    annotations,
                    exportSurface.width,
                    exportSurface.height,
                    exportSurface.scale,
                    () => { exportPicturesReadyRef.current += 1; },
                )}
            </View>
            <Svg
                width={exportSurface.width}
                height={exportSurface.height}
                style={StyleSheet.absoluteFill}
            >
                {annotations.map((annotation) => renderAnnotation(
                    annotation,
                    exportSurface.width,
                    exportSurface.height,
                    exportSurface.scale,
                ))}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    surface: {
        position: 'absolute',
        // Far enough off screen that it can never be seen, close enough to stay laid out.
        left: -30000,
        top: 0,
        overflow: 'hidden',
    },
});
