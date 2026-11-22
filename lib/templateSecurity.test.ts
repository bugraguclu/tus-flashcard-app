// Media files with `#` or `?` in their names. Anki allows `#` in a media file name, keeps the raw
// name in the field and percent-encodes media file names only when it shows the card (behaviour
// only; nothing here is taken from its code):
// https://docs.ankiweb.net/media.html
// https://github.com/ankitects/anki/blob/main/rslib/src/text.rs
// What a relative reference means to the page that loads it: https://url.spec.whatwg.org/#url-parsing
import { decodeHTMLAttribute } from 'entities';
import { describe, expect, it } from 'vitest';
import { nativeCardDocument, webCardDocument } from './cardPageDefaults';
import { localMediaDocumentLocation, localMediaFileFromUrl } from './localMediaDocument';
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { EDITOR_SOURCE_RESTORE_SCRIPT, prepareEditorContent } from './richTextEditorContent';
import { encodeLocalMediaUrls, sanitizeUntrustedHtml, scrubCss } from './templateSecurity';
import { renderCardHtml } from './templates';

const MEDIA_BASE = 'file:///var/mobile/Containers/Data/Application/ABC/Documents/tus-media/';
/** The address of the document an iPhone WebView shows a card from. */
const DOCUMENT = localMediaDocumentLocation(MEDIA_BASE, 'abc', '<p>x</p>')!.uri;

/** A field as the reviewer shows it: sanitized, then made into URLs. */
const shown = (field: string) => encodeLocalMediaUrls(sanitizeUntrustedHtml(field));

/** The first `src` of the HTML, as an HTML parser hands it to the URL parser. */
function srcOf(html: string): string {
    const match = html.match(/\ssrc="([^"]*)"/);
    if (!match) throw new Error(`no src in ${html}`);
    return decodeHTMLAttribute(match[1]);
}

/** What the WebView asks for when the card's document carries this `src`. */
function requested(src: string): { file: string | null; query: string; fragment: string } {
    const url = new URL(src, DOCUMENT);
    return {
        file: localMediaFileFromUrl(`file://${url.pathname}`, MEDIA_BASE),
        query: url.search,
        fragment: url.hash,
    };
}

const restoreEditorSource = new Function(
    'html',
    'preserved',
    `${EDITOR_SOURCE_RESTORE_SCRIPT}; return restoreEditorSource(html, preserved);`,
) as (html: string, preserved: unknown) => string;

describe('a media name with # or ? in the stored field', () => {
    it.each([
        '<img src="Şekil #3.png">',
        '<img src="Soru 12? (yanıt).jpg">',
        '<video controls playsinline src="Ders #4.mp4" poster="Kapak #4.jpg" disableRemotePlayback></video>',
        '<audio controls><source src="Kalp sesi #2.mp3"></audio>',
    ])('is left as written by the sanitizer the editor shares: %s', (field) => {
        expect(sanitizeUntrustedHtml(field)).toBe(field);
    });

    it('keeps the raw name in the player a sound marker becomes', () => {
        // The editor reads the marker back from this `src` when a player is pasted into another
        // field, so an encoded name here would be saved into the note.
        expect(sanitizeUntrustedHtml('[sound:Kalp sesi #2.mp3]'))
            .toBe('<audio controls src="Kalp sesi #2.mp3" disableRemotePlayback controlsList="nodownload"></audio>');
    });

    it.each([
        '<img src="Şekil #3.png">',
        '[sound:Kalp sesi #2.mp3]',
        'Önce <img src="Şekil #3.png"> sonra [sound:Kalp sesi #2.mp3] ve <img src="Soru 12?.jpg" alt="x">',
    ])('survives the editor round trip byte for byte: %s', (field) => {
        const prepared = prepareEditorContent(`before ${field}`, 'test');
        expect(restoreEditorSource(prepared.html, prepared.preserved)).toBe(`before ${field}`);
        expect(restoreEditorSource(prepared.html.replace('before ', 'after '), prepared.preserved)).toBe(`after ${field}`);
    });

    it('gives a sound player copied from another field its raw marker back', () => {
        const other = prepareEditorContent('[sound:Kalp sesi #2.mp3]', 'other');
        const own = prepareEditorContent('Mine', 'own');
        expect(restoreEditorSource(`${own.html} ${other.html}`, own.preserved)).toBe('Mine [sound:Kalp sesi #2.mp3]');
    });
});

describe('a media name with # or ? on the card', () => {
    it('shows the picture: the # is part of the file name, not a fragment', () => {
        const html = shown('<img src="Şekil #3.png">');
        expect(html).toBe('<img src="Şekil %233.png">');
        expect(requested(srcOf(html))).toEqual({ file: 'Şekil #3.png', query: '', fragment: '' });
        // As it was: the browser asked for "Şekil " and kept "#3.png" for itself.
        expect(requested('Şekil #3.png')).toEqual({ file: 'Şekil ', query: '', fragment: '#3.png' });
    });

    it('plays the sound a [sound:] marker names', () => {
        const html = shown('[sound:Kalp sesi #2.mp3]');
        expect(html).toBe('<audio controls src="Kalp sesi %232.mp3" disableRemotePlayback controlsList="nodownload"></audio>');
        expect(requested(srcOf(html))).toEqual({ file: 'Kalp sesi #2.mp3', query: '', fragment: '' });
    });

    it('reads a ? as part of the name, never as a query to another file', () => {
        const html = shown('<img src="a.png?x=1">');
        expect(html).toBe('<img src="a.png%3Fx=1">');
        expect(requested(srcOf(html))).toEqual({ file: 'a.png?x=1', query: '', fragment: '' });
    });

    it('encodes every attribute that loads a file, however it was quoted', () => {
        expect(shown('<video controls src="Ders #4.mp4" poster="Kapak #4.jpg"></video>'))
            .toBe('<video controls src="Ders %234.mp4" poster="Kapak %234.jpg"></video>');
        expect(shown('<audio controls><source src="Kalp sesi #2.mp3" type="audio/mpeg"></audio>'))
            .toBe('<audio controls><source src="Kalp sesi %232.mp3" type="audio/mpeg"></audio>');
        expect(shown("<img alt='şema' src='Şekil #3.png' width=320>")).toBe('<img alt=\'şema\' src="Şekil %233.png" width=320>');
        expect(shown('<img src=Sekil#3.png>')).toBe('<img src="Sekil%233.png">');
        expect(shown('<img src="Şekil #3.png" />')).toBe('<img src="Şekil %233.png" />');
    });

    it('sees a # or ? written as a character reference, as the browser does', () => {
        for (const field of ['<img src="Şekil &#35;3.png">', '<img src="Şekil &#x23;3.png">', '<img src="Şekil &num;3.png">']) {
            expect(requested(srcOf(shown(field)))).toEqual({ file: 'Şekil #3.png', query: '', fragment: '' });
        }
        expect(requested(srcOf(shown('<img src="a.png&quest;x=1">')))).toEqual({ file: 'a.png?x=1', query: '', fragment: '' });
        expect(shown('<img src="Kalp &amp; damar #1.png">')).toBe('<img src="Kalp &amp; damar %231.png">');
        expect(requested(srcOf(shown('[sound:Kalp & "damar" #1.mp3]')))).toEqual({ file: 'Kalp & "damar" #1.mp3', query: '', fragment: '' });
    });

    it('does not encode twice, and leaves an escape the field already carries', () => {
        expect(shown('<img src="Şekil %233.png">')).toBe('<img src="Şekil %233.png">');
        expect(shown('<img src="a%20b.png">')).toBe('<img src="a%20b.png">');
        const once = shown('<img src="Şekil #3.png"> [sound:Soru 12?.mp3]');
        expect(encodeLocalMediaUrls(once)).toBe(once);
        // A % that starts no escape is a character of the name; written as %25 it cannot be misread.
        expect(shown('<img src="50% off #1.png">')).toBe('<img src="50%25 off %231.png">');
        expect(requested(srcOf(shown('<img src="50% off #1.png">')))).toEqual({ file: '50% off #1.png', query: '', fragment: '' });
    });

    it.each([
        '<img src="Kalp grafiği.jpg">',
        '<img src="1_Şema (2) çığ öğün.png" alt="şema" width=320>',
        '<img src="kalp&amp;akciger.png">',
        "<img src='tek tırnak.png'>",
        '<video controls playsinline src="1_ders notu.mp4" disableRemotePlayback></video>',
        '[sound:üfürüm sesi.mp3]',
        '<img src="data:image/png;base64,AAAA">',
        '<a href="1_Kardiyoloji notları.pdf">Kardiyoloji notları.pdf</a>',
        '<a href="https://example.com/a?b=1#c">kaynak</a>',
        '<a href="#">x</a>',
    ])('leaves a name with spaces or Turkish letters, and everything that is not a file name, as it was: %s', (field) => {
        expect(shown(field)).toBe(sanitizeUntrustedHtml(field));
    });

    it('leaves the object URL the web build swaps in for a stored file', () => {
        const resolved = '<img src="blob:http://localhost:8081/0b0f7c4e-5a55-4a6e-9d1c-3f0d6f1c2a11"><img src="Şekil #3.png">';
        expect(encodeLocalMediaUrls(resolved))
            .toBe('<img src="blob:http://localhost:8081/0b0f7c4e-5a55-4a6e-9d1c-3f0d6f1c2a11"><img src="Şekil %233.png">');
    });

    it('leaves stylesheets alone', () => {
        const css = '<style>.a::after{content:"<img src=\'Şekil #3.png\'>"}</style>';
        expect(encodeLocalMediaUrls(`${css}<img src="Şekil #3.png">`)).toBe(`${css}<img src="Şekil %233.png">`);
    });
});

describe('what is still refused as media', () => {
    it.each([
        ['a script URL', 'javascript:alert(1)'],
        ['a script URL split by character references', 'java&#x73;cript&colon;alert(1)'],
        ['a remote picture', 'http://x/a.png'],
        ['a remote picture over TLS', 'https://x/a.png?b#c'],
        ['a protocol-relative address', '//x/a.png'],
        ['a file URL', 'file:///etc/passwd'],
        ['a drive path', 'C:\\a.png'],
        ['any other scheme', 'tusankim:a.png'],
        ['the parent folder', '../a.png'],
        ['a folder', 'a/b.png'],
        ['a backslash folder', 'a\\b.png'],
        ['an absolute path', '/a.png'],
        ['an escaped parent folder', '%2e%2e%2fa.png'],
        ['an escaped folder', 'a%2Fb.png'],
        ['an escaped backslash', 'a%5Cb.png'],
        ['an escaped scheme', 'javascript%3Aalert(1)'],
        ['an escaped folder behind a stray %', '50%%2Fx.png'],
        ['a hidden file', '.hidden.png'],
        ['an escaped hidden file', '%2Ehidden.png'],
        ['the app\'s own document', '.tus-view-abc.html?v=1'],
        ['a bare fragment', '#3.png'],
        ['an escaped bare fragment', '%233.png'],
        ['a bare query', '?x=1'],
        ['a folder written as a character reference', 'a&sol;b.png'],
        ['a parent folder written as character references', '&period;&period;&sol;a.png'],
        ['an escape written as character references', '&percnt;2e&percnt;2e&percnt;2fa.png'],
        ['a backslash written as a character reference', 'a&bsol;b.png'],
        ['an HTML document as data', 'data:text/html;base64,AAAA'],
        ['an over-long name', `${'a'.repeat(510)}#1.png`],
    ])('%s', (_label, value) => {
        expect(sanitizeUntrustedHtml(`<img src="${value}">`)).toBe('<img src="#">');
        expect(shown(`<img src="${value}">`)).toBe('<img src="#">');
        expect(shown(`<video poster="${value}"></video>`)).toBe('<video poster="#"></video>');
    });

    it('never turns a name into a query or a fragment on another file', () => {
        for (const name of ['a.png?x=1', 'a.png#b.png', 'x?y#z.png', 'a.png?', 'a.png#']) {
            expect(requested(srcOf(shown(`<img src="${name}">`)))).toEqual({ file: name, query: '', fragment: '' });
        }
        // A `/` or a `:` behind the `#` or `?` is still a folder or a scheme: refused outright.
        for (const name of ['x#../../collection.anki2', 'x?/../../collection.anki2', 'x#y:z.png']) {
            expect(shown(`<img src="${name}">`)).toBe('<img src="#">');
        }
    });
});

describe('where # and ? keep their URL meaning', () => {
    it('does not treat a link with a query or a fragment as an attached file', () => {
        for (const link of ['<a href="notlar.pdf?x=1">x</a>', '<a href="notlar.pdf#page=2">x</a>', '<a href="notlar.pdf%23page=2">x</a>']) {
            expect(shown(link)).toBe('<a href="#">x</a>');
        }
    });

    it('does not load a stylesheet URL with a query or a fragment', () => {
        expect(scrubCss('.a{background:url(bg.png?x=1)}.b{background:url("bg #2.png")}'))
            .toBe('.a{background:none}.b{background:none}');
        expect(scrubCss('.a{background:url(bg.png)}')).toBe('.a{background:url("bg.png")}');
    });
});

describe('the card documents', () => {
    const basic = () => structuredClone(BUILTIN_NOTE_TYPES.find((n) => n.id === 1)!) as NoteType;
    const rendered = renderCardHtml(basic(), {
        id: 1, guid: 'g', noteTypeId: 1, mod: 0, usn: -1, tags: [],
        fields: ['<img src="Şekil #3.png"> [sound:Kalp sesi #2.mp3] <img src="Kalp grafiği.jpg">', 'back'], sfld: '', csum: 0, flags: 0,
    }, 0, 'question');

    it('keeps the raw names in the rendered side, which the web media lookup and the audio queue read', () => {
        expect(rendered).toContain('<img src="Şekil #3.png">');
        expect(rendered).toContain('<audio controls src="Kalp sesi #2.mp3"');
    });

    it.each([
        ['iPhone', nativeCardDocument({ head: '<meta name="viewport" content="width=device-width">', content: rendered, nightMode: false })],
        ['web', webCardDocument({ head: '<meta name="viewport" content="width=device-width">', content: rendered, nightMode: false })],
    ])('carries the encoded names in the %s document', (_platform, page) => {
        expect(page).toContain('<img src="Şekil %233.png">');
        expect(page).toContain('<audio controls src="Kalp sesi %232.mp3"');
        expect(page).toContain('<img src="Kalp grafiği.jpg">');
        expect(page).not.toContain('#3.png');
        expect(page).not.toContain('#2.mp3');
    });
});
