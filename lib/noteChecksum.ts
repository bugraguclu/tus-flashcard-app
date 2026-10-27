/** Independently implemented SHA-1 checksum (not a security primitive here).
 * Anki stores the unsigned big-endian first four digest bytes of the HTML-free first field:
 * https://github.com/ankitects/anki/blob/main/rslib/src/notes/mod.rs
 */

/**
 * The HTML 4 named entities (name:hex code point) — the table Anki's entity decoder
 * (the `htmlescape` crate) knows. HTML5-only names such as `&apos;` are not in it.
 */
const HTML4_ENTITIES: ReadonlyMap<string, number> = new Map([
    'nbsp:a0 iexcl:a1 cent:a2 pound:a3 curren:a4 yen:a5 brvbar:a6 sect:a7 uml:a8 copy:a9 ordf:aa laquo:ab',
    'not:ac shy:ad reg:ae macr:af deg:b0 plusmn:b1 sup2:b2 sup3:b3 acute:b4 micro:b5 para:b6 middot:b7',
    'cedil:b8 sup1:b9 ordm:ba raquo:bb frac14:bc frac12:bd frac34:be iquest:bf Agrave:c0 Aacute:c1 Acirc:c2',
    'Atilde:c3 Auml:c4 Aring:c5 AElig:c6 Ccedil:c7 Egrave:c8 Eacute:c9 Ecirc:ca Euml:cb Igrave:cc Iacute:cd',
    'Icirc:ce Iuml:cf ETH:d0 Ntilde:d1 Ograve:d2 Oacute:d3 Ocirc:d4 Otilde:d5 Ouml:d6 times:d7 Oslash:d8',
    'Ugrave:d9 Uacute:da Ucirc:db Uuml:dc Yacute:dd THORN:de szlig:df agrave:e0 aacute:e1 acirc:e2 atilde:e3',
    'auml:e4 aring:e5 aelig:e6 ccedil:e7 egrave:e8 eacute:e9 ecirc:ea euml:eb igrave:ec iacute:ed icirc:ee',
    'iuml:ef eth:f0 ntilde:f1 ograve:f2 oacute:f3 ocirc:f4 otilde:f5 ouml:f6 divide:f7 oslash:f8 ugrave:f9',
    'uacute:fa ucirc:fb uuml:fc yacute:fd thorn:fe yuml:ff fnof:192 Alpha:391 Beta:392 Gamma:393 Delta:394',
    'Epsilon:395 Zeta:396 Eta:397 Theta:398 Iota:399 Kappa:39a Lambda:39b Mu:39c Nu:39d Xi:39e Omicron:39f',
    'Pi:3a0 Rho:3a1 Sigma:3a3 Tau:3a4 Upsilon:3a5 Phi:3a6 Chi:3a7 Psi:3a8 Omega:3a9 alpha:3b1 beta:3b2',
    'gamma:3b3 delta:3b4 epsilon:3b5 zeta:3b6 eta:3b7 theta:3b8 iota:3b9 kappa:3ba lambda:3bb mu:3bc nu:3bd',
    'xi:3be omicron:3bf pi:3c0 rho:3c1 sigmaf:3c2 sigma:3c3 tau:3c4 upsilon:3c5 phi:3c6 chi:3c7 psi:3c8',
    'omega:3c9 thetasym:3d1 upsih:3d2 piv:3d6 bull:2022 hellip:2026 prime:2032 Prime:2033 oline:203e',
    'frasl:2044 weierp:2118 image:2111 real:211c trade:2122 alefsym:2135 larr:2190 uarr:2191 rarr:2192',
    'darr:2193 harr:2194 crarr:21b5 lArr:21d0 uArr:21d1 rArr:21d2 dArr:21d3 hArr:21d4 forall:2200 part:2202',
    'exist:2203 empty:2205 nabla:2207 isin:2208 notin:2209 ni:220b prod:220f sum:2211 minus:2212 lowast:2217',
    'radic:221a prop:221d infin:221e ang:2220 and:2227 or:2228 cap:2229 cup:222a int:222b there4:2234',
    'sim:223c cong:2245 asymp:2248 ne:2260 equiv:2261 le:2264 ge:2265 sub:2282 sup:2283 nsub:2284 sube:2286',
    'supe:2287 oplus:2295 otimes:2297 perp:22a5 sdot:22c5 lceil:2308 rceil:2309 lfloor:230a rfloor:230b',
    'lang:2329 rang:232a loz:25ca spades:2660 clubs:2663 hearts:2665 diams:2666 quot:22 amp:26 lt:3c gt:3e',
    'OElig:152 oelig:153 Scaron:160 scaron:161 Yuml:178 circ:2c6 tilde:2dc ensp:2002 emsp:2003 thinsp:2009',
    'zwnj:200c zwj:200d lrm:200e rlm:200f ndash:2013 mdash:2014 lsquo:2018 rsquo:2019 sbquo:201a ldquo:201c',
    'rdquo:201d bdquo:201e dagger:2020 Dagger:2021 permil:2030 lsaquo:2039 rsaquo:203a euro:20ac',
].join(' ').split(' ').map((entry) => {
    const [name, hex] = entry.split(':');
    return [name, parseInt(hex, 16)] as const;
}));

/**
 * Anki's strict entity decoding: every `&` must open a known (case-sensitive) named entity or a
 * `&#digits;` / `&#xhex;` reference ending in `;`. One invalid reference leaves the whole text
 * undecoded, as Anki does; after a successful decode every U+00A0 becomes a plain space.
 */
export function decodeEntitiesLikeAnki(text: string): string {
    if (!text.includes('&')) return text;
    let out = '';
    let i = 0;
    while (i < text.length) {
        const amp = text.indexOf('&', i);
        if (amp < 0) { out += text.slice(i); break; }
        out += text.slice(i, amp);
        const end = text.indexOf(';', amp + 1);
        if (end < 0) return text;
        const body = text.slice(amp + 1, end);
        let codePoint: number | undefined;
        if (body.startsWith('#')) {
            const digits = body.slice(1);
            if (/^\d+$/.test(digits)) codePoint = Number(digits);
            else if (/^x[\da-fA-F]+$/.test(digits)) codePoint = parseInt(digits.slice(1), 16);
            else return text;
            if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return text;
        } else {
            codePoint = HTML4_ENTITIES.get(body);
            if (codePoint === undefined) return text;
        }
        out += String.fromCodePoint(codePoint);
        i = end + 1;
    }
    return out.replace(/\u00a0/g, ' ');
}

/** Media tags whose filename Anki keeps when it strips a field: img/audio/video/object/source. */
const MEDIA_TAG = /<\b(?:img|audio|video|object|source)\b[^>]+\b(?:src|data)=(?:"([^"]+)"|'([^']+)'|([^ >]+))[^>]*>/gi;
const HTML_MARKUP = /<!--[\s\S]*?-->|<style\b[\s\S]*?>[\s\S]*?<\/style>|<script\b[\s\S]*?>[\s\S]*?<\/script>|<[\s\S]*?>/gi;

/**
 * The text the checksum covers: the field as Anki stores it (NFC), then Anki's
 * `strip_html_preserving_media_filenames`. Decoded entities are not normalized again.
 */
export function checksumFieldText(field: string): string {
    const withFilenames = field.normalize('NFC').replace(MEDIA_TAG, (_tag, dq?: string, sq?: string, bare?: string) => ` ${dq ?? sq ?? bare ?? ''} `);
    return decodeEntitiesLikeAnki(withFilenames.replace(HTML_MARKUP, ''));
}
export function ankiFieldChecksum(field: string): number {
    const bytes: number[] = [];
    for (const char of checksumFieldText(field)) {
        const cp = char.codePointAt(0)!;
        if (cp < 0x80) bytes.push(cp);
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLength / 2 ** (i * 8)) & 255);
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const rotate = (n: number, bits: number) => (n << bits) | (n >>> (32 - bits));
    for (let offset = 0; offset < bytes.length; offset += 64) {
        const w = new Int32Array(80);
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
        }
        for (let i = 16; i < 80; i++) w[i] = rotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        let [a, b, c, d, e] = state;
        for (let i = 0; i < 80; i++) {
            const f = i < 20 ? ((b & c) | (~b & d)) : i < 40 ? b ^ c ^ d : i < 60 ? ((b & c) | (b & d) | (c & d)) : b ^ c ^ d;
            const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
            const next = (rotate(a, 5) + f + e + k + w[i]) | 0;
            e = d; d = c; c = rotate(b, 30); b = a; a = next;
        }
        [a, b, c, d, e].forEach((n, i) => { state[i] = (state[i] + n) | 0; });
    }
    return state[0] >>> 0;
}

/**
 * The FNV-1a value earlier versions of this app stored as a note's `csum`, over the trimmed raw
 * first field. Notes saved then keep it until they are next edited, and no migration rewrites
 * them, so lookups must still accept it. For lookups only: never store it on a note.
 */
export function legacyFieldChecksum(field: string): number {
    let hash = 0x811c9dc5;
    const text = field.trim();
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return Math.abs(hash | 0);
}

/**
 * Every `csum` a stored note with this first field may carry: Anki's checksum, then the legacy
 * local one. A checksum only narrows candidates; callers still compare the first field itself.
 */
export function firstFieldChecksums(field: string): number[] {
    const current = ankiFieldChecksum(field);
    const legacy = legacyFieldChecksum(field);
    return legacy === current ? [current] : [current, legacy];
}

/**
 * The note's sort field (`sfld`) as Anki stores it: the sort field's text with HTML stripped and
 * media filenames kept, so `<b>Zebra</b>` sorts as "Zebra" (EDT-9). Falls back to the first field
 * when the sort field is empty, as this app always has.
 */
export function sortFieldText(fields: string[], sortFieldIdx: number): string {
    return checksumFieldText(fields[sortFieldIdx] || fields[0] || '');
}
