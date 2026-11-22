// Media names on the card page, against Anki 26.09.3 itself: `test/fixtures/anki-26.09-media-names.json`
// was written by Anki's backend and aqt (scripts/anki-oracle/gen_media_names.py). Anki keeps a
// field's raw media names and percent-encodes them only when its reviewer shows the card; the card
// documents here do the same through `encodeLocalMediaUrls` (lib/cardPageDefaults.ts).
// https://docs.ankiweb.net/media.html
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decodeHTMLAttribute } from 'entities';
import { describe, expect, it } from 'vitest';
import { cardPageBodyTag } from './cardPageDefaults';
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { encodeLocalMediaUrls } from './templateSecurity';
import { renderCardHtml } from './templates';

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.09-media-names.json'), 'utf8')) as {
    stored: Record<string, string>;
    rendered: string;
    escaped: Record<string, string>;
    body: { day: string; night: string };
};

const MEDIA_FOLDER = 'file:///var/mobile/collection.media/';

/** Every address a piece of card HTML loads from, as the WebView resolves it in the media folder. */
function loadedUrls(html: string): string[] {
    return Array.from(html.matchAll(/\s(?:src|poster)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi), (match) => (
        new URL(decodeHTMLAttribute(match[1] ?? match[2] ?? match[3]), MEDIA_FOLDER).href));
}

/**
 * The stored file an address in the media folder names, or null when it names none. A file URL's
 * path is read as a browser reads it: each escape that decodes is decoded, and a `%` that starts
 * none stays a `%`.
 */
function fileNamed(url: string): string | null {
    const parsed = new URL(url);
    if (parsed.search || parsed.hash || !url.startsWith(MEDIA_FOLDER)) return null;
    const segment = parsed.pathname.slice(parsed.pathname.lastIndexOf('/') + 1);
    const bytes: number[] = [];
    for (let i = 0; i < segment.length; i += 1) {
        const escape = /^%[0-9a-fA-F]{2}/.exec(segment.slice(i));
        if (escape) { bytes.push(parseInt(escape[0].slice(1), 16)); i += 2; continue; }
        bytes.push(...new TextEncoder().encode(segment[i]));
    }
    return new TextDecoder().decode(new Uint8Array(bytes)).normalize('NFC');
}

const filesLoaded = (html: string) => loadedUrls(html).map(fileNamed);

// Where this app's page loads a file Anki's page does not, and why.
const DEVIATIONS: Record<string, string> = {
    // Anki strips `?` from a name it stores and so never encodes one; a file named elsewhere still loads here.
    '<img src="q?.png">': 'q?.png',
    // Anki encodes `src` only; a poster frame called "p #1.png" loads here too.
    '<video poster="p #1.png" src="v #1.mp4"></video>': 'p #1.png',
};

describe('media names on the card page, against Anki 26.09.3', () => {
    it('keeps a field’s raw names in the rendered card, as Anki’s collection does', () => {
        const basic = BUILTIN_NOTE_TYPES.find((n) => n.id === 1)! as NoteType;
        const html = renderCardHtml(basic, {
            id: 1, guid: 'g', noteTypeId: basic.id, mod: 0, usn: -1, tags: [],
            fields: ['<img src="Şekil #3.png">', ''], sfld: '', csum: 0, flags: 0,
        }, 0, 'question');
        expect(fixture.rendered).toBe('<img src="Şekil #3.png">');
        expect(html).toContain(fixture.rendered);
    });

    it('loads the files Anki’s reviewer loads, every one but the deviations below', () => {
        for (const [input, anki] of Object.entries(fixture.escaped)) {
            if (input in DEVIATIONS) continue;
            expect(filesLoaded(encodeLocalMediaUrls(input)), input).toEqual(filesLoaded(anki));
        }
    });

    it('loads the stored file where Anki’s address names none', () => {
        for (const [input, file] of Object.entries(DEVIATIONS)) {
            expect(fixture.escaped[input], input).toBeDefined();
            expect(filesLoaded(encodeLocalMediaUrls(input)), input).toContain(file);
            expect(filesLoaded(fixture.escaped[input]), input).not.toContain(file);
        }
    });

    it('stores # in a media name and drops ?, as Anki does', () => {
        expect(fixture.stored['Şekil #3.png'].normalize('NFC').toLowerCase()).toBe('şekil #3.png');
        expect(fixture.stored['a.png?x=1']).toBe('a.pngx=1');
    });

    it('gives the night page Anki’s two night-mode body classes, and the day page neither', () => {
        const night = fixture.body.night.split(' ');
        const day = fixture.body.day.split(' ');
        const nightOnly = night.filter((name) => !day.includes(name));
        expect(nightOnly).toEqual(['nightMode', 'night_mode']);
        expect(cardPageBodyTag(true)).toBe(`<body class="${nightOnly.join(' ')}">`);
        expect(cardPageBodyTag(false)).toBe('<body>');
    });
});
