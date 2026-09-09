/**
 * The mark a catalog install stamps its notes with.
 *
 * `lib/catalogWatermark.ts` owns what a mark is and how it hides in the text; this owns where it
 * comes from and remembers it. Kept apart so the encoding stays a pure module that tests can run
 * without a store, a database or a device.
 *
 * The mark is a digest of the store account that owns the entitlement. The store is asked once
 * and the answer is kept, so a reinstall — a package update, a tier change, a restore — marks
 * the same notes with the same value instead of producing a second traceable copy of the same
 * purchase.
 */

import { getDB } from './db';
import { installMarkFromAccountId, isInstallMark } from './catalogWatermark';

const INSTALL_MARK_KEY = 'bka_tus_catalog_install_mark_v1';

function readSetting(key: string): string | null {
    try {
        return getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
    } catch {
        return null;
    }
}

function writeSetting(key: string, value: string): void {
    try {
        getDB().runSync(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            key,
            value,
        );
    } catch (error) {
        // A mark that could not be stored is not a reason to fail an install the buyer is
        // waiting on. The next install asks the store again.
        console.warn('[BKA] install mark could not be stored:', error);
    }
}

/**
 * The store account id, or null when there is no store to ask.
 *
 * Loaded lazily and defensively: purchases are not configured in Expo Go, on web, or before the
 * first entitlement check, and none of those is a reason for an install to fail.
 */
async function readStoreAccountId(): Promise<string | null> {
    try {
        const Purchases = (require('react-native-purchases') as { default?: { getAppUserID?: () => Promise<string> } }).default;
        if (!Purchases?.getAppUserID) return null;
        const id = await Purchases.getAppUserID();
        return typeof id === 'string' && id.trim() ? id.trim() : null;
    } catch {
        return null;
    }
}

/**
 * The mark this install should stamp its catalog with, or an empty string when there is nothing
 * to derive one from — in which case the catalog is installed unmarked, which is exactly what
 * should happen for a build with no store behind it.
 */
export async function resolveCatalogInstallMark(): Promise<string> {
    const stored = readSetting(INSTALL_MARK_KEY);
    if (isInstallMark(stored)) return stored;

    const accountId = await readStoreAccountId();
    if (!accountId) return '';

    const mark = installMarkFromAccountId(accountId);
    if (!isInstallMark(mark)) return '';
    writeSetting(INSTALL_MARK_KEY, mark);
    return mark;
}

/** The mark already recorded for this install, without asking the store. */
export function storedCatalogInstallMark(): string {
    const stored = readSetting(INSTALL_MARK_KEY);
    return isInstallMark(stored) ? stored : '';
}
