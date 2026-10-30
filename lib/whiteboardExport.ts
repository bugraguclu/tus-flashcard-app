// Naming and wording for handing a reviewer whiteboard drawing over to the system.
//
// The drawing leaves the app rather than going into the collection's media folder: no note refers
// to it, and on iPhone that folder is out of the learner's reach. AnkiDroid saves the board as an
// image in a folder the learner can open; the iPhone equivalent is the share sheet's Save Image
// (Photos) and Save to Files, and the browser equivalent is a share or a download.

type Localize = (turkish: string, english: string) => string;

/**
 * How the hand-over ended. `shared` means the system sheet was shown and has closed — the iOS
 * share sheet does not report whether the learner saved, sent or cancelled — while `cancelled` is
 * a browser share the learner backed out of, and `unavailable` a device with no share sheet.
 */
export type WhiteboardHandOff = 'shared' | 'downloaded' | 'cancelled' | 'unavailable';

export const WHITEBOARD_IMAGE_MIME_TYPE = 'image/png';

export interface WhiteboardSaveSize {
    width: number;
    height: number;
}

/** Board size used when the canvas has not been laid out yet. */
const FALLBACK_SAVE_SIZE: WhiteboardSaveSize = { width: 420, height: 480 };

/**
 * The page the drawing is saved on, in whole points. The board's own width is usually fractional,
 * and a capture of a page that size comes back with its last pixel column transparent.
 */
export function whiteboardSaveSize(size: WhiteboardSaveSize): WhiteboardSaveSize {
    return {
        width: Math.round(size.width) || FALLBACK_SAVE_SIZE.width,
        height: Math.round(size.height) || FALLBACK_SAVE_SIZE.height,
    };
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

/**
 * The name the learner meets in Photos, Files or the downloads list. It is ASCII so AirDrop, Files
 * and every browser keep it as written, and stamped to the second in local time so saves list in
 * the order they were made and a second save does not replace the first.
 */
export function whiteboardImageFileName(now: Date): string {
    const day = `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
    const time = `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
    return `yazi-tahtasi-${day}-${time}.png`;
}

/**
 * What to tell the learner once the hand-over is over, or null when the system's own sheet already
 * did. A shared or cancelled drawing gets no alert: claiming "saved" after a cancel would be wrong,
 * and the share sheet cannot tell the two apart. A download names the file, since the browser may
 * only show it in a corner.
 */
export function whiteboardSaveNotice(
    handOff: WhiteboardHandOff,
    fileName: string,
    l: Localize,
): { title: string; message: string } | null {
    switch (handOff) {
        case 'downloaded':
            return {
                title: l('Çizim indirildi', 'Drawing downloaded'),
                message: l(`${fileName} olarak indirildi.`, `Downloaded as ${fileName}.`),
            };
        case 'unavailable':
            return {
                title: l('Paylaşım kullanılamıyor', 'Sharing unavailable'),
                message: l(
                    'Bu cihazda paylaşım sayfası açılamadı, bu yüzden çizim kaydedilmedi.',
                    'The share sheet is not available on this device, so the drawing was not saved.',
                ),
            };
        case 'shared':
        case 'cancelled':
            return null;
    }
}
