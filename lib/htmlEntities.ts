import { decodeHTML } from 'entities';

/**
 * Field text as the card itself shows it: every character reference decoded in one pass, the way
 * an HTML parser reads text content, and the non-breaking space turned into a plain space as
 * Anki's `strip_html` does.
 *
 * A field holds whatever its source wrote: the text importer escapes an apostrophe as `&#x27;`,
 * older editors store `&uuml;` for "ü", and a typed "&lt;" is kept as `&amp;lt;`. Decoding a
 * hand-picked few of those leaves the rest on screen as code, and decoding in several passes
 * turns `&amp;lt;` into "<". Strip the markup first, then call this once.
 *
 * https://github.com/ankitects/anki/blob/main/rslib/src/text.rs (`decode_entities`)
 */
export function decodeHtmlText(text: string): string {
    const decoded = text.includes('&') ? decodeHTML(text) : text;
    return decoded.includes(' ') ? decoded.replace(/ /g, ' ') : decoded;
}
