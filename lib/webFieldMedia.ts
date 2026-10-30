import { getWebMediaUrl, isBareMediaReference } from './mediaStore';

/**
 * What a web field shows for a file IndexedDB does not have: a URL that loads nothing over the
 * network and is no picture or sound, so the element looks missing, as a bare filename's 404 did.
 */
export const MISSING_WEB_FIELD_MEDIA_SRC = 'data:,';

/**
 * Web fields keep Anki's bare media filenames, which the field iframe cannot load: the files live
 * in IndexedDB. The field script hands each such element over with the filename in data-tus-src
 * and an empty src, which loads nothing; here src becomes the file's object URL for display. The
 * script restores the filename from data-tus-src before a field is saved. An element that still
 * carries a bare src (it came in some other way) is pointed at its file the same way.
 */
export async function resolveWebFieldMedia(
    doc: Pick<Document, 'querySelectorAll'>,
    lookup: (filename: string) => Promise<string | null> = getWebMediaUrl,
): Promise<void> {
    const elements = Array.from(doc.querySelectorAll('img[src], audio[src], video[src], source[src]'));
    for (const element of elements) {
        const src = element.getAttribute('src') ?? '';
        const handedOver = element.getAttribute('data-tus-src');
        // An element with data-tus-src and a src has been shown already.
        if (handedOver !== null ? src !== '' : !src || !isBareMediaReference(src)) continue;
        const filename = handedOver ?? src;
        const url = await lookup(filename);
        // A bare src that finds no file is left as it is: the browser has already tried it.
        if (element.getAttribute('src') !== src || (!url && handedOver === null)) continue;
        element.setAttribute('data-tus-src', filename);
        element.setAttribute('src', url ?? MISSING_WEB_FIELD_MEDIA_SRC);
        // A <source> is only read when its media element loads, so the element has to reload.
        if (element.tagName.toLowerCase() === 'source') {
            (element.parentElement as HTMLMediaElement | null)?.load?.();
        }
    }
}
