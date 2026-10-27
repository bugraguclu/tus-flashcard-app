/**
 * What a collection package carries beyond its tables: the day the collection was created (`crt`),
 * which every review due date counts from, and its settings (`col.conf`). Replacing the collection
 * with a `.colpkg` keeps both, and an export writes them back, so a collection that goes through
 * this app returns to Anki with its own day numbering and its own options.
 *
 * Of those options, the ones this app also has are read into its settings on replacement and
 * written from them on export: the next day starts at, learn ahead limit, timebox, FSRS with its
 * short-term-steps switch, and the two daily-limit rules. Every other key is kept as it came.
 */

import type { AppSettings } from './types';
import { getDB } from './db';
import { parseAnkiJson, stringifyAnkiJson } from './ankiJson';

type Json = Record<string, any>;

const STORED_COLLECTION_KEY = 'anki_collection_v1';

export interface AnkiCollectionMeta {
    crt: number;
    conf: Json;
}

/** Anki's settings for a new collection, as its legacy JSON writes them. */
const NEW_COLLECTION_CONF: Json = {
    newSpread: 0, collapseTime: 1200, curDeck: 1, activeDecks: [1], dueCounts: true, sched2021: true,
    estTimes: true, schedVer: 2, dayLearnFirst: false, sortType: 'noteFld', addToCur: true, timeLim: 0, sortBackwards: false,
};

type CollectionSettings = Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes' | 'timeboxMinutes' | 'fsrsEnabled'
    | 'fsrsShortTermWithSteps' | 'limitsStartFromTop' | 'newCardsIgnoreReviewLimit'>;

/** Each shared option: its Anki key, how Anki stores it, and how this app does. */
const SHARED_OPTIONS: { [K in keyof CollectionSettings]-?: [string, (value: any) => CollectionSettings[K], (value: CollectionSettings[K]) => unknown] } = {
    dayRolloverHour: ['rollover', (hour) => Number(hour ?? 4), (hour) => hour],
    learnAheadMinutes: ['collapseTime', (secs) => Math.round(Number(secs ?? 1200) / 60), (minutes) => minutes * 60],
    timeboxMinutes: ['timeLim', (secs) => Math.round(Number(secs ?? 0) / 60), (minutes) => (minutes ?? 0) * 60],
    fsrsEnabled: ['fsrs', Boolean, Boolean],
    fsrsShortTermWithSteps: ['fsrsShortTermWithStepsEnabled', Boolean, Boolean],
    limitsStartFromTop: ['applyAllParentLimits', Boolean, Boolean],
    newCardsIgnoreReviewLimit: ['newCardsIgnoreReviewLimit', Boolean, Boolean],
};

export function rememberCollection(meta: AnkiCollectionMeta): void {
    getDB().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', STORED_COLLECTION_KEY, stringifyAnkiJson(meta));
}

export function rememberedCollection(): AnkiCollectionMeta | null {
    try {
        const row = getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', STORED_COLLECTION_KEY);
        const meta = row?.value ? parseAnkiJson(row.value) : null;
        return meta && Number.isFinite(meta.crt) && meta.conf && typeof meta.conf === 'object' ? meta : null;
    } catch {
        return null;
    }
}

/** The app settings a replacing collection brings with it. */
export function settingsFromCollection(conf: Json): Partial<CollectionSettings> {
    const settings: Partial<Record<keyof CollectionSettings, unknown>> = {};
    for (const [name, [key, read]] of Object.entries(SHARED_OPTIONS)) settings[name as keyof CollectionSettings] = read(conf[key]);
    return settings as Partial<CollectionSettings>;
}

/**
 * The `col.conf` an export writes: the collection's own settings (or Anki's for a new collection),
 * with this app's values for the options it shares, and a current deck that is in the package. A
 * collection made here gets a `nextPos` past every new card.
 */
export function collectionConf(
    base: Json | undefined,
    settings: Partial<CollectionSettings>,
    options: { nextPos: number; deckIds: ReadonlySet<number>; creationOffset: number },
): Json {
    const conf: Json = { ...(base ?? { ...NEW_COLLECTION_CONF, creationOffset: options.creationOffset }) };
    for (const [name, [key, read, write]] of Object.entries(SHARED_OPTIONS)) {
        const value = settings[name as keyof CollectionSettings];
        // Only a value that differs from what the collection already says is written over it.
        if (value !== undefined && JSON.stringify(read(conf[key])) !== JSON.stringify(value)) conf[key] = write(value as never);
    }
    // Without `schedVer` 2 Anki reads the collection as the retired v1 scheduler and converts it,
    // renumbering the answer buttons of every learning review.
    conf.schedVer = 2;
    conf.sched2021 = true;
    // A collection's own `nextPos` stays as it is; Anki does not keep it above every new card either.
    if (!base || !Number(conf.nextPos)) conf.nextPos = options.nextPos;
    if (!options.deckIds.has(Number(conf.curDeck))) conf.curDeck = 1;
    if (Array.isArray(conf.activeDecks)) {
        conf.activeDecks = conf.activeDecks.filter((id: unknown) => options.deckIds.has(Number(id)));
        if (!conf.activeDecks.length) conf.activeDecks = [conf.curDeck];
    }
    return conf;
}
