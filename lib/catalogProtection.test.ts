import { describe, expect, it } from 'vitest';
import { BKA_MANIFEST } from './bkaManifest';
import {
    PaidCatalogProtectionError,
    assertNoProtectedCatalogGuids,
    canonicalBackupContainsCatalog,
    isProtectedCatalogGuid,
} from './catalogProtection';
import { CATALOG_PACK_ID } from './catalogRows';

describe('paid catalog package protection', () => {
    const protectedGuid = BKA_MANIFEST.protectedNoteGuids[0];

    it('ships an identity for every paid catalog note', () => {
        expect(BKA_MANIFEST.protectedNoteGuids).toHaveLength(BKA_MANIFEST.totals.notes);
        expect(new Set(BKA_MANIFEST.protectedNoteGuids).size).toBe(BKA_MANIFEST.totals.notes);
        expect(isProtectedCatalogGuid(protectedGuid)).toBe(true);
    });

    it('rejects a full or partial copied package while allowing unrelated notes', () => {
        expect(() => assertNoProtectedCatalogGuids(['learner-note'])).not.toThrow();
        expect(() => assertNoProtectedCatalogGuids(['learner-note', protectedGuid]))
            .toThrow(PaidCatalogProtectionError);
    });

    it('rejects protected note rows smuggled through canonical JSON backups', () => {
        const withMarker = {
            tables: { notes: [{ data: JSON.stringify({ guid: 'changed', catalogPack: CATALOG_PACK_ID }) }] },
        };
        const withKnownGuid = {
            tables: { notes: [{ data: JSON.stringify({ guid: protectedGuid }) }] },
        };
        const safe = { tables: { notes: [{ data: JSON.stringify({ guid: 'learner-note' }) }] } };

        expect(canonicalBackupContainsCatalog(withMarker)).toBe(true);
        expect(canonicalBackupContainsCatalog(withKnownGuid)).toBe(true);
        expect(canonicalBackupContainsCatalog(safe)).toBe(false);
    });
});
