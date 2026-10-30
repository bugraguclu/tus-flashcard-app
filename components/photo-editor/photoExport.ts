import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PHOTO_JPEG_QUALITY, readPhotoHeader, sniffPhotoHeader, type PhotoHeader } from '../../lib/photoCompression';
import { photoBaseSteps, type PhotoGeometry, type PhotoSize } from '../../lib/photoGeometry';

/** The longest edge of the copy the editor draws on screen: sharp on any phone, quick to redraw. */
export const PHOTO_PREVIEW_EDGE = 2048;

export type PhotoFileFormat = 'jpeg' | 'png';

export interface EditingPhoto {
    /** An upright copy of the photo, small enough to redraw on every change. */
    preview: { uri: string; width: number; height: number };
    /** The picked photo's own size once its camera orientation is applied. */
    original: PhotoSize;
    /**
     * What the edited photo is saved as. A photo that may be see-through, or was stored losslessly
     * — a screenshot, a diagram — stays PNG; a camera photo stays JPEG.
     */
    format: PhotoFileFormat;
}

/** The first bytes of the picked file, which say what kind of image it is. */
async function readHeader(uri: string): Promise<PhotoHeader> {
    if (Platform.OS !== 'web') return readPhotoHeader(uri);
    try {
        const blob = await (await fetch(uri)).blob();
        return sniffPhotoHeader(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
    } catch {
        return { format: 'unknown', mayHaveAlpha: true, lossless: false };
    }
}

const saveFormat = (format: PhotoFileFormat) => (format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG);

/**
 * Get a picked photo ready to edit: decode it once with its camera orientation applied, note its
 * real size, and keep an upright copy no larger than `PHOTO_PREVIEW_EDGE` for the screen.
 *
 * The copy matters beyond speed. A photo straight from the camera is usually stored on its side
 * with an orientation tag, and the SVG image the editor draws with ignores that tag; the
 * manipulator applies it, so everything the editor measures is measured on the photo the
 * learner sees.
 */
export async function preparePhotoForEditing(uri: string): Promise<EditingPhoto> {
    const header = await readHeader(uri);
    const format: PhotoFileFormat = header.mayHaveAlpha || header.lossless ? 'png' : 'jpeg';
    const context = ImageManipulator.manipulate(uri);
    const upright = await context.renderAsync();
    const original = { width: upright.width, height: upright.height };
    const longest = Math.max(original.width, original.height);
    const resizer = longest > PHOTO_PREVIEW_EDGE
        ? ImageManipulator.manipulate(upright).resize({
            width: Math.max(1, Math.round((original.width * PHOTO_PREVIEW_EDGE) / longest)),
            height: Math.max(1, Math.round((original.height * PHOTO_PREVIEW_EDGE) / longest)),
        })
        : null;
    const preview = resizer ? await resizer.renderAsync() : upright;
    try {
        const saved = await preview.saveAsync({ format: saveFormat(format), compress: 0.92 });
        return { preview: { uri: saved.uri, width: saved.width, height: saved.height }, original, format };
    } finally {
        if (preview !== upright) preview.release();
        resizer?.release();
        upright.release();
        context.release();
    }
}

/**
 * The picked photo with a geometry baked into its pixels — mirrored, turned, cropped and shrunk
 * to `maxEdge` — saved as a new file. `original` is the size `preparePhotoForEditing` measured,
 * which the crop is worked out on.
 */
export async function bakePhotoGeometry(
    uri: string,
    original: PhotoSize,
    geometry: PhotoGeometry,
    maxEdge: number,
    format: PhotoFileFormat,
): Promise<{ uri: string; width: number; height: number }> {
    const context = ImageManipulator.manipulate(uri);
    for (const step of photoBaseSteps(original, geometry, maxEdge).steps) {
        if (step.type === 'flip') context.flip('horizontal');
        else if (step.type === 'rotate') context.rotate(step.degrees);
        else if (step.type === 'crop') context.crop({ originX: step.originX, originY: step.originY, width: step.width, height: step.height });
        else context.resize({ width: step.width, height: step.height });
    }
    const image = await context.renderAsync();
    try {
        const saved = await image.saveAsync({ format: saveFormat(format), compress: PHOTO_JPEG_QUALITY });
        return { uri: saved.uri, width: saved.width, height: saved.height };
    } finally {
        image.release();
        context.release();
    }
}
