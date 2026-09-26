import type { RefObject } from 'react';
import { Image as NativeImage, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import type { PhotoAnnotation } from '../../lib/photoEditor';
import { scaleBlankCanvasRuling } from '../../lib/blankCanvas';
import PaperSwatch from '../PaperSwatch';
import type { EditorPage, ExportSurface } from './editorModel';
import { renderAnnotation, renderPlacedPictures } from './annotationRendering';
import type { PhotoEditorStyles } from './photoEditorStyles';

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
    styles: PhotoEditorStyles;
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
    styles,
}: ExportSurfaceViewProps) {
    return (
        <View
            ref={exportSurfaceRef}
            collapsable={false}
            onLayout={() => { exportLaidOutRef.current = true; }}
            style={[
                styles.exportSurface,
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
