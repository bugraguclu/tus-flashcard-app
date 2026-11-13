import { studySubjectKey } from './stopwatch';

/**
 * Which picture the Kronometre draws for a subject (`components/stopwatch/SubjectArt.tsx`): a
 * course's name, a plan's course or a deck's name is matched by the course names it contains.
 */

export type SubjectArtName =
    | 'mixed'
    | 'anatomy'
    | 'biochemistry'
    | 'internal'
    | 'pharmacology'
    | 'physiology'
    | 'microbiology'
    | 'pathology'
    | 'surgery'
    | 'obstetrics'
    | 'pediatrics'
    | 'minor'
    | 'histology'
    | 'genetics';

/**
 * Names a subject's key may contain, checked in this order; the first that matches wins. Longer
 * names come before the shorter ones they contain ("mikrobiyoloji" before any "biyoloji").
 */
const ART_ALIASES: readonly (readonly [string, SubjectArtName])[] = [
    ['karışık', 'mixed'],
    ['histoloji', 'histology'],
    ['embriyoloji', 'histology'],
    ['tıbbi biyoloji', 'genetics'],
    ['genetik', 'genetics'],
    ['mikrobiyoloji', 'microbiology'],
    ['biyokimya', 'biochemistry'],
    ['fizyoloji', 'physiology'],
    ['farmakoloji', 'pharmacology'],
    ['patoloji', 'pathology'],
    ['anatomi', 'anatomy'],
    ['dahiliye', 'internal'],
    ['iç hastalıkları', 'internal'],
    ['genel cerrahi', 'surgery'],
    ['cerrahi', 'surgery'],
    ['kadın', 'obstetrics'],
    ['doğum', 'obstetrics'],
    ['pediatri', 'pediatrics'],
    ['çocuk', 'pediatrics'],
    ['küçük staj', 'minor'],
];

/** The picture a subject is drawn with, or null for one without a picture of its own. */
export function subjectArtName(subject: string): SubjectArtName | null {
    const key = studySubjectKey(subject);
    if (!key) return null;
    for (const [alias, name] of ART_ALIASES) {
        if (key.includes(alias)) return name;
    }
    return null;
}
