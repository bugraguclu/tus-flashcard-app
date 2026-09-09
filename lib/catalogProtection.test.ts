import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
    getDB: () => ({
        getFirstSync: () => null,
    }),
}));

import { BKA_MANIFEST } from './bkaManifest';
import {
    PaidCatalogProtectionError,
    assertCatalogCardsMovable,
    assertCatalogDeckNotDeletable,
    assertCatalogDeckNotRenamable,
    assertCatalogNoteContentMutable,
    assertCatalogNoteNotDeletable,
    assertCatalogNoteNotDuplicable,
    assertCatalogNoteTypeNotChangeable,
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

    it('rejects moving catalog cards or moving cards into catalog decks', () => {
        const catalogCard = { id: 101, noteId: 501, catalogPack: CATALOG_PACK_ID };
        const catalogDeck = { id: 8000000000001, name: 'TUS::Dahiliye', catalogPack: CATALOG_PACK_ID };
        const userDeck = { id: 1, name: 'Default' };
        const userCard = { id: 201, noteId: 601 };

        expect(() => assertCatalogCardsMovable([catalogCard as any], userDeck as any)).toThrow(PaidCatalogProtectionError);
        expect(() => assertCatalogCardsMovable([userCard as any], catalogDeck as any)).toThrow(PaidCatalogProtectionError);
    });

    it('rejects duplicating catalog notes', () => {
        const catalogNote = { id: 501, guid: protectedGuid, catalogPack: CATALOG_PACK_ID };
        expect(() => assertCatalogNoteNotDuplicable(catalogNote as any)).toThrow(PaidCatalogProtectionError);
        expect(() => assertCatalogNoteNotDuplicable({ id: 502, guid: 'user-note' } as any)).not.toThrow();
    });

    it('rejects changing note type of catalog notes', () => {
        const catalogNote = { id: 501, guid: protectedGuid, catalogPack: CATALOG_PACK_ID };
        expect(() => assertCatalogNoteTypeNotChangeable(catalogNote as any)).toThrow(PaidCatalogProtectionError);
        expect(() => assertCatalogNoteTypeNotChangeable({ id: 502, guid: 'user-note' } as any)).not.toThrow();
    });

    it('rejects deleting or renaming catalog decks', () => {
        const catalogDeck = { id: 8000000000001, name: 'TUS::Dahiliye', catalogPack: CATALOG_PACK_ID };
        expect(() => assertCatalogDeckNotDeletable(catalogDeck as any)).toThrow(PaidCatalogProtectionError);
        expect(() => assertCatalogDeckNotRenamable(catalogDeck as any)).toThrow(PaidCatalogProtectionError);
        expect(() => assertCatalogDeckNotDeletable({ id: 1, name: 'UserDeck' } as any)).not.toThrow();
        expect(() => assertCatalogDeckNotRenamable({ id: 1, name: 'UserDeck' } as any)).not.toThrow();
    });

    it('rejects altering field content or note type while allowing tags update', () => {
        const original = { id: 501, guid: protectedGuid, noteTypeId: 1, fields: ['Soru', 'Cevap'], tags: ['tag1'], catalogPack: CATALOG_PACK_ID };
        const withNewTags = { id: 501, guid: protectedGuid, noteTypeId: 1, fields: ['Soru', 'Cevap'], tags: ['tag1', 'tag2'], catalogPack: CATALOG_PACK_ID };
        const withChangedFields = { id: 501, guid: protectedGuid, noteTypeId: 1, fields: ['Değiştirilmiş', 'Cevap'], tags: ['tag1'], catalogPack: CATALOG_PACK_ID };
        const withChangedType = { id: 501, guid: protectedGuid, noteTypeId: 2, fields: ['Soru', 'Cevap'], tags: ['tag1'], catalogPack: CATALOG_PACK_ID };

        expect(() => assertCatalogNoteContentMutable(withNewTags as any, original as any)).not.toThrow();
        expect(() => assertCatalogNoteContentMutable(withChangedFields as any, original as any)).toThrow(PaidCatalogProtectionError);
        expect(() => assertCatalogNoteContentMutable(withChangedType as any, original as any)).toThrow(PaidCatalogProtectionError);
    });
});
