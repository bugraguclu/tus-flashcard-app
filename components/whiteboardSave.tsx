// Turning the reviewer whiteboard into a PNG the learner can keep: a white page for the ink, the
// web rasterizer, the native off-screen capture and the iOS share sheet hand-over.

import React, { useCallback, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { getLegacyFileSystem, toFileUri } from '../lib/files';
import { toSmoothWhiteboardPath, type WhiteboardStroke } from '../lib/whiteboardGeometry';
import { WHITEBOARD_IMAGE_MIME_TYPE, type WhiteboardHandOff, type WhiteboardSaveSize } from '../lib/whiteboardExport';

/**
 * The saved image is the ink on white paper, not on the transparent board: a transparent PNG
 * shows black on black in Photos' dark mode. Every palette colour reads on white.
 */
const SAVED_PAGE_COLOR = '#ffffff';

export function renderStrokePaths(strokes: WhiteboardStroke[]) {
    return strokes.map((stroke, index) => (
        <Path
            key={index}
            d={toSmoothWhiteboardPath(stroke.points)}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    ));
}

/** Web save path: replay the strokes onto a high-resolution white PNG. */
export async function rasterizeStrokesToPng(strokes: WhiteboardStroke[], { width, height }: WhiteboardSaveSize): Promise<Uint8Array> {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d context unavailable');
    context.scale(scale, scale);
    context.fillStyle = SAVED_PAGE_COLOR;
    context.fillRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of strokes) {
        const { points } = stroke;
        if (points.length === 0) continue;
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.width;
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        if (points.length === 1) {
            context.lineTo(points[0].x + 0.01, points[0].y);
        } else {
            for (let index = 1; index < points.length - 1; index++) {
                const midpointX = (points[index].x + points[index + 1].x) / 2;
                const midpointY = (points[index].y + points[index + 1].y) / 2;
                context.quadraticCurveTo(points[index].x, points[index].y, midpointX, midpointY);
            }
            const last = points[points.length - 1];
            context.lineTo(last.x, last.y);
        }
        context.stroke();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encode failed'))), WHITEBOARD_IMAGE_MIME_TYPE);
    });
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Native save path: give the capture a readable name in the cache and open the share sheet, where
 * the learner picks Save Image (Photos) or Save to Files. Resolves once the sheet has closed.
 */
export async function shareWhiteboardImage(captureUri: string, fileName: string): Promise<WhiteboardHandOff> {
    const fs = getLegacyFileSystem();
    const uri = `${fs.cacheDirectory ?? ''}${fileName}`;
    await fs.copyAsync({ from: toFileUri(captureUri), to: uri });
    await Sharing.shareAsync(uri, { mimeType: WHITEBOARD_IMAGE_MIME_TYPE, UTI: 'public.png', dialogTitle: fileName });
    return 'shared';
}

/** One frame, with a timer behind it so a backgrounded app can never leave a save hanging. */
function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 32);
        requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

/**
 * Native capture: draw the strokes again on a white page off screen and photograph that, falling
 * back to the transparent on-screen board if the page cannot be captured. `page` is the element to
 * mount next to the board; it exists only for the length of one capture.
 */
export function useWhiteboardPageCapture(canvasRef: RefObject<View | null>) {
    const [page, setPage] = useState<{ strokes: WhiteboardStroke[]; size: WhiteboardSaveSize } | null>(null);
    const pageRef = useRef<View>(null);
    const laidOutRef = useRef(false);

    const capture = useCallback(async (strokes: WhiteboardStroke[], size: WhiteboardSaveSize): Promise<string> => {
        laidOutRef.current = false;
        setPage({ strokes, size });
        try {
            const deadline = Date.now() + 2000;
            while (!laidOutRef.current && Date.now() < deadline) await nextFrame();
            // One more frame, so the finished tree is on the layer before the shutter.
            await nextFrame();
            return await captureRef(pageRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                useRenderInContext: true,
            });
        } catch (error) {
            console.warn('[Whiteboard] white page capture failed, using the board:', error);
            return captureRef(canvasRef, { format: 'png', result: 'tmpfile' });
        } finally {
            setPage(null);
        }
    }, [canvasRef]);

    const element = page ? (
        <View
            ref={pageRef}
            collapsable={false}
            onLayout={() => { laidOutRef.current = true; }}
            style={[styles.page, page.size]}
        >
            <Svg width={page.size.width} height={page.size.height} style={StyleSheet.absoluteFill}>
                {renderStrokePaths(page.strokes)}
            </Svg>
        </View>
    ) : null;

    return { capture, element };
}

const styles = StyleSheet.create({
    page: {
        position: 'absolute',
        // Far enough off screen that it can never be seen, close enough to stay laid out.
        left: -30000,
        top: 0,
        overflow: 'hidden',
        backgroundColor: SAVED_PAGE_COLOR,
        pointerEvents: 'none',
    },
});
