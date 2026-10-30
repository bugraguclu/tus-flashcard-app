import { StyleSheet, View } from 'react-native';
import type { PhotoCropRect } from '../../lib/photoEditor';
import type { PhotoSize } from '../../lib/photoGeometry';

interface CropFrameProps {
    crop: PhotoCropRect;
    canvas: PhotoSize;
    /** A handle is held: the thirds come up so the frame can be lined up by them. */
    active: boolean;
}

const BAR = 3;
const ARM = 20;

/**
 * The crop frame over the whole photo: the part being cut away dimmed, the kept part framed,
 * thirds to line it up by, and grips on the corners and the middle of each edge. Touches are read
 * by the stage underneath, so none of this takes any.
 */
export function CropFrame({ crop, canvas, active }: CropFrameProps) {
    const left = crop.x * canvas.width;
    const top = crop.y * canvas.height;
    const width = crop.width * canvas.width;
    const height = crop.height * canvas.height;
    const gridOpacity = active ? 0.75 : 0.3;

    return (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            <View style={[styles.dim, { left: 0, top: 0, right: 0, height: top }]} />
            <View style={[styles.dim, { left: 0, top: top + height, right: 0, bottom: 0 }]} />
            <View style={[styles.dim, { left: 0, top, width: left, height }]} />
            <View style={[styles.dim, { left: left + width, top, right: 0, height }]} />

            <View style={[styles.frame, { left, top, width, height }]}>
                <View style={[styles.gridV, { left: '33.33%', opacity: gridOpacity }]} />
                <View style={[styles.gridV, { left: '66.66%', opacity: gridOpacity }]} />
                <View style={[styles.gridH, { top: '33.33%', opacity: gridOpacity }]} />
                <View style={[styles.gridH, { top: '66.66%', opacity: gridOpacity }]} />

                <View style={[styles.bar, { left: -BAR, top: -BAR, width: ARM, height: BAR }]} />
                <View style={[styles.bar, { left: -BAR, top: -BAR, width: BAR, height: ARM }]} />
                <View style={[styles.bar, { right: -BAR, top: -BAR, width: ARM, height: BAR }]} />
                <View style={[styles.bar, { right: -BAR, top: -BAR, width: BAR, height: ARM }]} />
                <View style={[styles.bar, { left: -BAR, bottom: -BAR, width: ARM, height: BAR }]} />
                <View style={[styles.bar, { left: -BAR, bottom: -BAR, width: BAR, height: ARM }]} />
                <View style={[styles.bar, { right: -BAR, bottom: -BAR, width: ARM, height: BAR }]} />
                <View style={[styles.bar, { right: -BAR, bottom: -BAR, width: BAR, height: ARM }]} />

                <View style={[styles.bar, { left: width / 2 - ARM / 2, top: -BAR, width: ARM, height: BAR }]} />
                <View style={[styles.bar, { left: width / 2 - ARM / 2, bottom: -BAR, width: ARM, height: BAR }]} />
                <View style={[styles.bar, { top: height / 2 - ARM / 2, left: -BAR, width: BAR, height: ARM }]} />
                <View style={[styles.bar, { top: height / 2 - ARM / 2, right: -BAR, width: BAR, height: ARM }]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    dim: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.55)' },
    frame: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.95)',
    },
    gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#ffffff' },
    gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#ffffff' },
    bar: { position: 'absolute', backgroundColor: '#ffffff', borderRadius: 1 },
});
