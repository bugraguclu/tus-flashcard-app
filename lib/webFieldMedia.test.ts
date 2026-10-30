import { describe, expect, it } from 'vitest';
import { MISSING_WEB_FIELD_MEDIA_SRC, resolveWebFieldMedia } from './webFieldMedia';

/** A media element of the web field document, as far as the resolver reads it. */
function mediaElement(tagName: string, attributes: Record<string, string>, parent?: { loads: number }) {
    const values = new Map(Object.entries(attributes));
    return {
        tagName: tagName.toUpperCase(),
        parentElement: parent ? { load: () => { parent.loads += 1; } } : null,
        getAttribute: (name: string) => values.get(name) ?? null,
        setAttribute: (name: string, value: string) => { values.set(name, value); },
        attributes: () => Object.fromEntries(values),
    };
}

const fieldDocument = (elements: ReturnType<typeof mediaElement>[]) => ({
    querySelectorAll: () => elements,
}) as unknown as Pick<Document, 'querySelectorAll'>;

const stored = new Map([['kalp.jpg', 'blob:https://app.example/1'], ['atim.mp4', 'blob:https://app.example/2']]);
const lookup = async (filename: string) => stored.get(filename) ?? null;

describe('web field media', () => {
    it('shows each file the field script handed over through its object URL', async () => {
        const video = { loads: 0 };
        const picture = mediaElement('img', { src: '', 'data-tus-src': 'kalp.jpg' });
        const source = mediaElement('source', { src: '', 'data-tus-src': 'atim.mp4' }, video);
        await resolveWebFieldMedia(fieldDocument([picture, source]), lookup);
        expect(picture.attributes()).toEqual({ src: 'blob:https://app.example/1', 'data-tus-src': 'kalp.jpg' });
        expect(source.attributes()).toEqual({ src: 'blob:https://app.example/2', 'data-tus-src': 'atim.mp4' });
        expect(video.loads).toBe(1);
    });

    it('shows a file IndexedDB does not have as missing, without asking the network for it', async () => {
        const picture = mediaElement('img', { src: '', 'data-tus-src': 'yok.jpg' });
        await resolveWebFieldMedia(fieldDocument([picture]), lookup);
        expect(picture.attributes()).toEqual({ src: MISSING_WEB_FIELD_MEDIA_SRC, 'data-tus-src': 'yok.jpg' });
        expect(MISSING_WEB_FIELD_MEDIA_SRC).toMatch(/^data:/);
        // Shown once, the element is left alone by the next pass.
        stored.set('yok.jpg', 'blob:https://app.example/3');
        await resolveWebFieldMedia(fieldDocument([picture]), lookup);
        expect(picture.getAttribute('src')).toBe(MISSING_WEB_FIELD_MEDIA_SRC);
        stored.delete('yok.jpg');
    });

    it('still points a bare src that came in some other way at its file', async () => {
        const found = mediaElement('img', { src: 'kalp.jpg' });
        const missing = mediaElement('img', { src: 'yok.jpg' });
        await resolveWebFieldMedia(fieldDocument([found, missing]), lookup);
        expect(found.attributes()).toEqual({ src: 'blob:https://app.example/1', 'data-tus-src': 'kalp.jpg' });
        expect(missing.attributes()).toEqual({ src: 'yok.jpg' });
    });

    it('leaves URLs, empty sources and elements already shown alone', async () => {
        const asked: string[] = [];
        const elements = [
            mediaElement('img', { src: 'blob:https://app.example/1', 'data-tus-src': 'kalp.jpg' }),
            mediaElement('img', { src: 'https://x.test/a.png' }),
            mediaElement('img', { src: '' }),
        ];
        const before = elements.map((element) => element.attributes());
        await resolveWebFieldMedia(fieldDocument(elements), async (filename) => { asked.push(filename); return 'blob:x'; });
        expect(asked).toEqual([]);
        expect(elements.map((element) => element.attributes())).toEqual(before);
    });

    it('keeps a src the field changed while its file was being looked up', async () => {
        const picture = mediaElement('img', { src: '', 'data-tus-src': 'kalp.jpg' });
        await resolveWebFieldMedia(fieldDocument([picture]), async () => {
            picture.setAttribute('src', 'blob:https://app.example/9');
            return 'blob:https://app.example/1';
        });
        expect(picture.getAttribute('src')).toBe('blob:https://app.example/9');
    });
});
