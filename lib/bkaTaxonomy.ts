/**
 * Subdeck structure for the bundled BKA TUS package.
 *
 * The source is twelve flat course decks: it carries no subdeck tree, and 5,525 of its 7,737
 * notes have no tags at all. Placement runs in two passes, in this order:
 *
 * 1. The author's own label. The notes that *are* tagged carry labels like "Kardiyo Ped.",
 *    "Cerrahi Kalp-Damar" or "Genel Mikro", and Anki splits those on spaces, so a label arrives
 *    as a set of tokens. Every subdeck in BKA_TAG_TOPICS below is one of those labels.
 * 2. For a note the author left unlabeled, the subject terms in its own text, against the
 *    standard TUS syllabus for that course (lib/bkaContentTopics.ts). Without this pass 69% of
 *    the catalog sat in one "Genel" pile and four courses had no subdecks at all.
 *
 * A tagged note is never reclassified: pass 2 only ever sees notes pass 1 did not place. A note
 * whose text matches nothing stays in its course's "Genel" subdeck rather than being guessed
 * into a topic it may not belong to.
 */

import { BKA_CONTENT_TOPICS, foldNoteText, type BkaContentTopic } from './bkaContentTopics';

export interface BkaTagTopic {
    /** Subdeck name shown in the app. */
    name: string;
    /** Normalized tag tokens that must all be present on the note. */
    tokens: string[];
}

/** Course label for notes their author left untagged; never becomes a subdeck. */
export const BKA_UNGROUPED_TOPIC = 'Genel';

const topic = (name: string, ...tokens: string[]): BkaTagTopic => ({ name, tokens });

/**
 * Ordered per course. Multi-token labels come first so a shared token ("Cerrahi") cannot claim a
 * note that belongs to a more specific label ("Beyin Cerrahi").
 */
export const BKA_TAG_TOPICS: Record<string, BkaTagTopic[]> = {
    'Deneme ve Soru BKA': [
        topic('Deneme 1', '1', 'deneme'),
        topic('Deneme 2', '2', 'deneme'),
        topic('Deneme 3', '3', 'deneme'),
        topic('Deneme 4', '4', 'deneme'),
    ],
    // The author left Anatomi, FHE, Patoloji and Farmakoloji entirely untagged, so every subdeck
    // in those four courses comes from the content pass in lib/bkaContentTopics.ts.
    'Anatomi BKA': [],
    'FHE BKA': [],
    'Patoloji BKA': [],
    'Farmakoloji BKA': [],
    'Biyokimya BKA': [
        topic('Proteinler', 'protein'),
        topic('Karbonhidratlar', 'kh'),
        topic('Lipitler', 'lipidler'),
        topic('Nükleik Asitler', 'nukleik'),
        topic('Hormon ve Vitaminler', 'hormon'),
    ],
    'Mikrobiyoloji BKA': [
        topic('Genel Mikrobiyoloji', 'genel', 'mikro'),
        topic('Bakteriyoloji', 'bakteri'),
        topic('Viroloji', 'virus'),
        topic('Mikoloji', 'mantar'),
        topic('Parazitoloji', 'parazit'),
        topic('İmmünoloji', 'immunoloji'),
    ],
    'Dahiliye BKA': [
        topic('Kardiyoloji', 'kardiyo'),
        topic('Göğüs Hastalıkları', 'gogus'),
        topic('Gastroenteroloji ve Hepatoloji', 'hepato'),
        topic('Nefroloji', 'nefro'),
        topic('Endokrinoloji', 'endokrin'),
        topic('Hematoloji', 'hemato'),
        topic('Romatoloji', 'romato'),
        topic('Onkoloji', 'onko'),
    ],
    'Pediatri BKA': [
        topic('Yenidoğan', 'yenidogan'),
        topic('Beslenme ve Gelişme', 'beslenme'),
        topic('Aşı ve Döküntülü Hastalıklar', 'asi'),
        topic('Alerji ve İmmünoloji', 'allerji'),
        topic('Metabolizma', 'metabolizma'),
        topic('Genetik', 'genetik'),
        topic('Kardiyoloji', 'kardiyo'),
        topic('Göğüs Hastalıkları', 'gogus'),
        topic('Gastroenteroloji', 'gastro'),
        topic('Nefroloji', 'nefro'),
        topic('Nöroloji', 'noro'),
        topic('Endokrinoloji', 'endokrin'),
        topic('Hematoloji', 'hemato'),
        topic('Onkoloji', 'onko'),
        topic('Romatoloji', 'romato'),
    ],
    'Genel Cerrahi BKA': [
        topic('Meme', 'meme'),
        topic('Tiroit', 'tiroit'),
    ],
    'Küçük Stajlar BKA': [
        topic('Kalp-Damar Cerrahisi', 'cerrahi', 'kalp-damar'),
        topic('Beyin Cerrahisi', 'cerrahi', 'beyin'),
        topic('Çocuk Cerrahisi', 'cerrahi', 'cocuk'),
        topic('Göğüs Cerrahisi', 'cerrahi', 'gogus'),
        topic('Halk Sağlığı', 'halk', 'sagligi'),
        topic('Nöroloji', 'noroloji'),
        topic('Dermatoloji', 'derma'),
        topic('KBB', 'kbb'),
        topic('Göz Hastalıkları', 'goz'),
        topic('Ortopedi', 'ortopedi'),
        topic('Üroloji', 'uroloji'),
        topic('Fiziksel Tıp ve Rehabilitasyon', 'ftr'),
        topic('Psikiyatri', 'psikiyatri'),
        topic('Anesteziyoloji', 'anestezi'),
        topic('Radyoloji', 'radyoloji'),
    ],
    'Kadın Doğum BKA': [
        topic('Obstetri', 'obstetri'),
        topic('Jinekolojik Onkoloji', 'jineko'),
        topic('Kontrasepsiyon', 'kontrasep'),
        topic('Anatomi ve Muayene', 'muayene'),
        topic('Menopoz', 'menopoz'),
    ],
};

/**
 * Fold Turkish letters and case so tag tokens compare reliably. Lower-casing happens in the
 * invariant locale on purpose: Turkish casing maps "I" to a dotless "ı", which would make
 * "İmmünoloji" and the rule token disagree.
 */
export function normalizeTagToken(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\u0131/g, 'i')
        .trim();
}

/**
 * Subdeck names a course can have, in display order: the author's own labels first, then any
 * topic only the content pass produces. Both passes draw from this list, so a name that appears
 * in one is guaranteed to have a subdeck.
 */
export function getBkaTopicNames(rootDeckName: string): string[] {
    const names = (BKA_TAG_TOPICS[rootDeckName] ?? []).map((entry) => entry.name);
    for (const entry of BKA_CONTENT_TOPICS[rootDeckName] ?? []) {
        if (!names.includes(entry.name)) names.push(entry.name);
    }
    return names;
}

/** The author label a note carries, or null when they did not label it. */
export function classifyBkaTopicByTag(rootDeckName: string, tags: string[]): string | null {
    const rules = BKA_TAG_TOPICS[rootDeckName];
    if (!rules?.length) return null;
    const normalized = new Set(tags.map(normalizeTagToken).filter(Boolean));
    if (normalized.size === 0) return null;
    for (const rule of rules) {
        if (rule.tokens.every((token) => normalized.has(token))) return rule.name;
    }
    return null;
}

interface FoldedKeyword {
    /** The keyword itself, plus its softened form when Turkish mutation applies. */
    needles: string[];
    /**
     * True for a keyword authored with a trailing space. Those are abbreviations — "MI", "AF",
     * "ARA", "TUR" — which only mean anything as a complete word: matched as a prefix they would
     * claim "mitoz", "afferent", "aralık" and "Turner". A keyword authored without the trailing
     * space matches the start of a word instead, so Turkish suffixes ("memede", "gebelik") hit.
     */
    wholeWord: boolean;
}

const SOFTENED: Record<string, string> = { k: 'g', p: 'b', t: 'd' };

/** "yetmezlik" → "yetmezlig", so the keyword still matches "yetmezliğinde". */
function softenFinalConsonant(needle: string): string {
    const softened = SOFTENED[needle.slice(-1)];
    return softened ? needle.slice(0, -1) + softened : needle;
}

/** Keywords are authored in ordinary Turkish, so fold them once rather than on every note. */
const foldedKeywords = new Map<string, FoldedKeyword[]>();

function keywordsFor(rootDeckName: string, entry: BkaContentTopic): FoldedKeyword[] {
    const key = `${rootDeckName}\u001f${entry.name}`;
    let folded = foldedKeywords.get(key);
    if (!folded) {
        folded = entry.keywords
            .map((keyword) => {
                const needle = foldNoteText(keyword).trim();
                const wholeWord = /\s$/.test(keyword);
                return {
                    // A Turkish word ending in k, p or t softens before a suffix, so the keyword
                    // "kalp yetmezlik" has to reach the card that says "kalp yetmezliğinde".
                    // Abbreviations are matched whole and never inflect, so they are left alone.
                    needles: wholeWord ? [needle] : [needle, softenFinalConsonant(needle)],
                    wholeWord,
                };
            })
            .filter((keyword) => keyword.needles[0].length > 0);
        foldedKeywords.set(key, folded);
    }
    return folded;
}

function matchTopic(rootDeckName: string, rules: BkaContentTopic[], folded: string): string | null {
    if (folded.trim().length === 0) return null;
    for (const rule of rules) {
        for (const { needles, wholeWord } of keywordsFor(rootDeckName, rule)) {
            for (const needle of needles) {
                if (folded.includes(wholeWord ? ` ${needle} ` : ` ${needle}`)) return rule.name;
            }
        }
    }
    return null;
}

/**
 * The topic a note's own text places it in, or null when nothing matches. Only consulted for
 * notes the author left unlabeled — see classifyBkaTopic.
 *
 * The question stem is tried first, and only then the whole note. A card's subject is what it
 * asks about, not what the answer happens to name: "sinüs sphenoidalis arka komşu → {{c1::pons}}"
 * is a head-and-neck card, and reading the deletion along with the stem would file it under
 * neuroanatomy.
 */
export function classifyBkaTopicByContent(rootDeckName: string, text: string): string | null {
    const rules = BKA_CONTENT_TOPICS[rootDeckName];
    if (!rules?.length) return null;
    const stem = text.replace(/\{\{c\d+(?:,\d+)*::[\s\S]*?\}\}/g, ' ');
    return matchTopic(rootDeckName, rules, foldNoteText(stem))
        ?? matchTopic(rootDeckName, rules, foldNoteText(text));
}

/**
 * The subdeck a note belongs to, or null to leave it in the course deck as ungrouped. The
 * author's label decides whenever they left one; only an unlabeled note is placed by its text.
 */
export function classifyBkaTopic(
    rootDeckName: string,
    tags: string[],
    text?: string,
): string | null {
    const tagged = classifyBkaTopicByTag(rootDeckName, tags);
    if (tagged) return tagged;
    return text === undefined ? null : classifyBkaTopicByContent(rootDeckName, text);
}
