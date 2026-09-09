/**
 * Shared identity of rows that belong to a purchasable content pack.
 *
 * The installer (lib/bkaCatalog.ts) writes these rows and the backup layer (lib/storage.ts)
 * deliberately leaves them out, so both need the same marker and the same idea of "study progress
 * worth keeping". Keeping that agreement in one small module avoids an import cycle between them.
 */

import type { AnkiCard } from './models';

/** Value stored in the `catalogPack` field of every row the BKA installer owns. */
export const CATALOG_PACK_ID = 'bka-tus';

/** Settings key written only after the entitlement-controlled installer finishes. */
export const CATALOG_INSTALL_KEY = 'bka_tus_catalog_installed_v5';

/** Settings key holding scheduling state for catalog cards that are not installed right now. */
export const CATALOG_PROGRESS_KEY = 'bka_tus_catalog_progress_v5';

/** Scheduling columns carried across an uninstall/reinstall, in stored order. */
export const CATALOG_PROGRESS_FIELDS = [
    'type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'left', 'odue', 'odid', 'flags', 'lastReview',
] as const;

export type CatalogProgress = Record<string, number[]>;

/** True for a stored row (its JSON `data` column) installed by the content pack. */
export function isCatalogPackRow(data: unknown): boolean {
    if (typeof data !== 'string') return false;
    // Cheap pre-filter: the marker only ever appears in rows the installer wrote.
    if (!data.includes(CATALOG_PACK_ID)) return false;
    try {
        return (JSON.parse(data) as { catalogPack?: string }).catalogPack === CATALOG_PACK_ID;
    } catch {
        return false;
    }
}

/** A card the learner has never touched reinstalls identically from the package. */
export function hasStudyProgress(card: Pick<AnkiCard, 'type' | 'queue' | 'reps' | 'flags'>): boolean {
    return card.type !== 0 || card.queue !== 0 || Boolean(card.reps) || Boolean(card.flags);
}

export function encodeCatalogProgress(card: AnkiCard): number[] {
    return CATALOG_PROGRESS_FIELDS.map((field) => Number(card[field] ?? 0));
}

export function applyCatalogProgress(card: AnkiCard, stored: number[] | undefined): AnkiCard {
    if (!stored || stored.length !== CATALOG_PROGRESS_FIELDS.length) return card;
    const restored = { ...card } as Record<string, unknown>;
    CATALOG_PROGRESS_FIELDS.forEach((field, index) => { restored[field] = stored[index]; });
    return restored as unknown as AnkiCard;
}

export function parseCatalogProgress(raw: unknown): CatalogProgress {
    if (typeof raw !== 'string' || !raw) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as CatalogProgress : {};
    } catch {
        return {};
    }
}
