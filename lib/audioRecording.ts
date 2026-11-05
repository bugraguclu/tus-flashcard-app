/** What the recorder sheet is doing, which decides the controls it shows. */
export type RecorderPhase = 'idle' | 'recording' | 'paused' | 'recorded';

/** A take shorter than this holds nothing worth adding, so Add waits until it is reached. */
export const MIN_RECORDING_MS = 500;

/** Bars in the recorder's level meter. */
export const LEVEL_BAR_COUNT = 28;

/** The quietest reading the meter shows; anything below it is drawn as silence. */
const LEVEL_FLOOR_DB = -50;

/** `0:07`, `12:34`, `1:02:03`: the recorder's clock, from milliseconds. */
export function formatRecordingTime(ms: number): string {
    const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** The recorder's dBFS reading as a bar height from 0 (silence) to 1 (full scale). */
export function levelFromMetering(db: number | null | undefined): number {
    if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
    return Math.min(1, Math.max(0, (db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB));
}

/** A silent meter. */
export function emptyLevels(count = LEVEL_BAR_COUNT): number[] {
    return new Array(count).fill(0);
}

/** The meter with one more reading at its right-hand end and the oldest one gone. */
export function pushLevel(levels: readonly number[], level: number, count = LEVEL_BAR_COUNT): number[] {
    const next = [...levels, Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0))];
    return next.length > count ? next.slice(next.length - count) : next;
}

/**
 * The extension and type a recording is stored with. iPhone records AAC in an `.m4a`; a browser
 * records whatever its MediaRecorder produces, which the blob's type names.
 */
export function recordingFileType(blobType?: string | null): { extension: string; mimeType: string } {
    const type = (blobType ?? '').toLowerCase();
    if (type.includes('webm')) return { extension: 'webm', mimeType: blobType as string };
    if (type.includes('ogg')) return { extension: 'ogg', mimeType: blobType as string };
    if (type.includes('wav')) return { extension: 'wav', mimeType: blobType as string };
    if (type.includes('mp4') || type.includes('aac')) return { extension: 'm4a', mimeType: blobType as string };
    return { extension: 'm4a', mimeType: 'audio/mp4' };
}

/**
 * The smallest file a take with sound in it makes. An `.m4a` the microphone never fed is a header
 * of a few hundred bytes; half a second of 96 kbit/s AAC, the shortest take Add allows, is about
 * six kilobytes, and silence still costs AAC well over this.
 */
export const MIN_TAKE_BYTES = 1024;

/**
 * Whether a finished take holds sound worth adding. iOS can hand back a file without sound in it
 * (the microphone taken by a call, or the audio session ended under the recorder); such a take is
 * refused rather than added as a sound that cannot play.
 */
export function isUsableTake(file: { exists: boolean; size?: number | null }): boolean {
    return file.exists && typeof file.size === 'number' && Number.isFinite(file.size) && file.size >= MIN_TAKE_BYTES;
}

/**
 * Whether a take loaded into the player turned out empty or unreadable. Only a player that is done
 * loading is judged: `failed`, or ready with no length.
 */
export function isEmptyLoadedTake(status: { isLoaded: boolean; duration: number; playbackState?: string }): boolean {
    if (status.playbackState === 'failed') return true;
    // A browser's recording can report no length (Infinity) until it has been played through.
    return status.isLoaded && Number.isFinite(status.duration) && status.duration <= 0.05;
}
