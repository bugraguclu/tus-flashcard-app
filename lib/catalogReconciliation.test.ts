import { describe, expect, it } from 'vitest';
import type { CatalogAccessState } from './catalogPurchases';
import { reconcileCatalogAccessWithInstalledTier } from './catalogReconciliation';

const state = (overrides: Partial<CatalogAccessState>): CatalogAccessState => ({
    status: 'ready',
    hasAccess: false,
    previewAccess: false,
    configured: true,
    price: '₺1.500',
    productAvailable: true,
    ...overrides,
});

describe('catalog entitlement reconciliation', () => {
    it('keeps a previously verified lifetime catalog available during a transient store error', () => {
        const result = reconcileCatalogAccessWithInstalledTier(
            state({ status: 'error', error: 'Bağlantı kurulamadı' }),
            'full',
        );

        expect(result.hasAccess).toBe(true);
        expect(result.error).toContain('çevrimdışı erişim korunuyor');
    });

    it('does not unlock a trial installation during a store error', () => {
        expect(reconcileCatalogAccessWithInstalledTier(
            state({ status: 'error' }),
            'trial',
        ).hasAccess).toBe(false);
    });

    it('honors a successful locked receipt response even if full cards were cached locally', () => {
        expect(reconcileCatalogAccessWithInstalledTier(
            state({ status: 'ready', hasAccess: false }),
            'full',
        ).hasAccess).toBe(false);
    });

    it('fails closed when the production store is not configured', () => {
        expect(reconcileCatalogAccessWithInstalledTier(
            state({ status: 'unconfigured', configured: false }),
            'full',
        ).hasAccess).toBe(false);
    });
});
