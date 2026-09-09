import { describe, expect, it } from 'vitest';
import type { CatalogAccessState } from './catalogPurchases';
import { reconcileCatalogAccessWithInstall } from './catalogReconciliation';

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
    it('keeps an installed lifetime catalog available during a transient store error', () => {
        const result = reconcileCatalogAccessWithInstall(
            state({ status: 'error', error: 'Bağlantı kurulamadı' }),
            true,
        );

        expect(result.hasAccess).toBe(true);
        expect(result.error).toContain('çevrimdışı erişim korunuyor');
    });

    it('does not unlock an uninstalled catalog during a store error', () => {
        expect(reconcileCatalogAccessWithInstall(state({ status: 'error' }), false).hasAccess).toBe(false);
    });

    it('honors a successful locked receipt response even if the cards are still installed', () => {
        expect(reconcileCatalogAccessWithInstall(
            state({ status: 'ready', hasAccess: false }),
            true,
        ).hasAccess).toBe(false);
    });

    it('fails closed when the production store is not configured', () => {
        expect(reconcileCatalogAccessWithInstall(
            state({ status: 'unconfigured', configured: false }),
            true,
        ).hasAccess).toBe(false);
    });
});
