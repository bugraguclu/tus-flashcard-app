import { describe, expect, it } from 'vitest';
import type { CatalogAccessState } from './catalogPurchases';
import {
    catalogAccessAfterInstallFailure,
    catalogPurchaseOutcome,
    reconcileCatalogAccessWithInstall,
} from './catalogReconciliation';

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

describe('purchase outcome', () => {
    it('keeps a purchase the store granted apart from an installation that failed', () => {
        const granted = state({ status: 'ready', hasAccess: true });
        const failed = catalogAccessAfterInstallFailure(granted, new Error('No space left on device'), false);

        expect(failed).toMatchObject({ status: 'ready', hasAccess: false, installError: 'No space left on device' });
        expect(failed.error).toBeUndefined();
        expect(catalogPurchaseOutcome({ hasAccess: false, cancelled: false, state: failed })).toBe('installFailed');
    });

    it('keeps the cards a failed refresh left in place open', () => {
        const failed = catalogAccessAfterInstallFailure(state({ hasAccess: true }), new Error('disk full'), true);
        expect(failed).toMatchObject({ status: 'ready', hasAccess: true, installError: 'disk full' });
        expect(catalogPurchaseOutcome({ hasAccess: true, cancelled: false, state: failed })).toBe('unlocked');
    });

    it('reports a removal that failed as before', () => {
        expect(catalogAccessAfterInstallFailure(state({ hasAccess: false }), new Error('locked'), true))
            .toMatchObject({ status: 'error', hasAccess: true, error: 'locked' });
    });

    it('gives a purchase waiting for approval its own outcome', () => {
        expect(catalogPurchaseOutcome({ hasAccess: false, cancelled: false, pending: true, state: state({}) })).toBe('pending');
    });

    it('still tells a store failure from a missing purchase', () => {
        expect(catalogPurchaseOutcome({ hasAccess: false, cancelled: false, state: state({ status: 'error', error: 'timeout' }) }))
            .toBe('storeError');
        expect(catalogPurchaseOutcome({ hasAccess: false, cancelled: false, state: state({}) })).toBe('notEntitled');
        expect(catalogPurchaseOutcome({ hasAccess: false, cancelled: true, state: state({}) })).toBe('cancelled');
    });
});
