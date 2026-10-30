import type { MediaReferenceKind } from './mediaAttachment';

/**
 * What a picked file becomes in a field, decided the way Anki's editor decides it: by the
 * extension of the name it is stored under. Anki turns a picture into `<img>` and every sound or
 * video file into a `[sound:…]` marker; this app embeds a video as `<video>` so it plays inside
 * the card, and keeps anything else as a plain file link.
 */
const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'svg', 'ico',
]);
const AUDIO_EXTENSIONS = new Set([
    'mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'spx', 'caf', 'aif', 'aiff', 'weba', 'amr', '3ga',
]);
const VIDEO_EXTENSIONS = new Set([
    'mp4', 'm4v', 'mov', 'webm', 'ogv', '3gp', 'mkv', 'avi', 'mpg', 'mpeg',
]);
/** Containers that hold either sound alone or sound and picture; the picker's type says which. */
const AMBIGUOUS_CONTAINERS = new Set(['mp4', 'webm', 'ogg', '3gp']);

/**
 * Files the attachment viewer shows itself. iOS renders these in a web view (Office and iWork
 * documents through its own converter); markup such as HTML and SVG is left out, because a page
 * the card never vetted could still fetch from the network, and so is anything iOS cannot draw.
 */
const PREVIEW_EXTENSIONS = new Set([
    'pdf', 'txt', 'text', 'rtf', 'csv', 'md',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pages', 'numbers', 'key',
    ...[...IMAGE_EXTENSIONS].filter((extension) => extension !== 'svg'),
    'mp3', 'm4a', 'aac', 'wav', 'mp4', 'm4v', 'mov',
]);

function extensionOf(name: string): string {
    const match = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
    return match ? match[1].toLowerCase() : '';
}

function kindOfMimeType(mimeType: string | null | undefined): MediaReferenceKind | null {
    const type = (mimeType ?? '').trim().toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('audio/')) return 'audio';
    if (type.startsWith('video/')) return 'video';
    return null;
}

/** The reference a file of this name (and, when the name says nothing, this MIME type) gets. */
export function attachmentKindFor(name: string, mimeType?: string | null): MediaReferenceKind {
    const extension = extensionOf(name);
    const fromMimeType = kindOfMimeType(mimeType);
    if (AMBIGUOUS_CONTAINERS.has(extension) && (fromMimeType === 'audio' || fromMimeType === 'video')) {
        return fromMimeType;
    }
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
    if (VIDEO_EXTENSIONS.has(extension)) return 'video';
    return fromMimeType ?? 'file';
}

/** The name the person gave the file: an attachment is stored as `<timestamp>_<name>`. */
export function attachmentDisplayName(filename: string): string {
    return filename.replace(/^\d{10,}_(?=.)/, '');
}

/** True when the attachment viewer can show this file rather than only offer to share it. */
export function canPreviewAttachment(filename: string): boolean {
    return PREVIEW_EXTENSIONS.has(extensionOf(filename));
}
