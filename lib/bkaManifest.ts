/**
 * Build-time inventory of the bundled BKA TUS package.
 *
 * The store screen lists every course and topic subdeck while the catalog is still locked,
 * so those counts have to be available without parsing the 9 MB Anki package at launch.
 * `scripts/build-catalog-manifest.ts` regenerates this file from the package itself with the
 * same taxonomy the installer uses; `lib/bkaCatalog.test.ts` fails if the two ever drift.
 */

import manifest from '../assets/catalog/bka-manifest.json';

export interface BkaManifestTopic {
    name: string;
    notes: number;
    cards: number;
    /** True for author-labeled groups that become subdecks; false for the ungrouped remainder. */
    deck: boolean;
}

export interface BkaManifestCourse {
    id: string;
    name: string;
    sourceDeckName: string;
    sourceDeckId: number;
    icon: string;
    notes: number;
    cards: number;
    topics: BkaManifestTopic[];
}

export interface BkaManifest {
    generatedFrom: string;
    sha256: string;
    noteTypes: Array<{ id: number; name: string }>;
    /** Stable Anki identities used to reject copied/re-exported paid notes on every import path. */
    protectedNoteGuids: string[];
    totals: {
        notes: number;
        cards: number;
        courses: number;
        /** Author-labeled subdecks only. */
        topics: number;
        /** Cards the author left unlabeled; they stay in their course deck. */
        ungroupedCards: number;
        media: number;
    };
    courses: BkaManifestCourse[];
}

export const BKA_MANIFEST = manifest as BkaManifest;
export const BKA_TOTAL_CARDS = BKA_MANIFEST.totals.cards;
export const BKA_TOTAL_COURSES = BKA_MANIFEST.totals.courses;
export const BKA_TOTAL_TOPICS = BKA_MANIFEST.totals.topics;
export const BKA_NOTE_TYPE_IDS = BKA_MANIFEST.noteTypes.map((noteType) => noteType.id);
