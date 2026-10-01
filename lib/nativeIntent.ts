import { inferImportFileType } from './importFile';

/** A document Files hands over ("Open in TusAnkiM"). It names a file, never a screen. */
const FILE_URL = /^file:/i;

/**
 * `tusankim://x-callback-url/<action>?…`, the form Shortcuts and other apps send. The query form
 * `tusankim://x-callback-url?action=…` is not matched: it is the address of `app/x-callback-url.tsx`
 * and is left for the router to open, as it is on the web.
 */
const EXTERNAL_ACTION_URL = /^tusankim:\/\/x-callback-url\/+[^/?#]/i;

/**
 * True for a URL `app/_layout.tsx` opens itself: an importable file, which goes to `/import`, or an
 * x-callback action, which goes to the browser or the editor. An x-callback action that is
 * incomplete or names a missing deck is ignored there, so it is claimed here as well.
 */
export function isOpenedByAppLayout(url: string): boolean {
    return FILE_URL.test(url) || EXTERNAL_ACTION_URL.test(url) || inferImportFileType(url) !== undefined;
}

/**
 * Expo Router's `redirectSystemPath` hook, re-exported by `app/+native-intent.tsx`.
 *
 * iOS delivers every incoming URL to the router as well as to `Linking`. Without this hook the router
 * reads a file URL or an x-callback action as a screen address and opens "Sayfa bulunamadı" beneath
 * the screen `app/_layout.tsx` pushes, so leaving `/import` revealed the not-found page. For those
 * URLs the router stays where it is; at launch it starts on the root, as a launch without a URL does.
 * Every other URL passes through unchanged. It runs before the collection is open, so it must only
 * look at the string.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
    if (!isOpenedByAppLayout(path)) return path;
    return initial ? '/' : null;
}
