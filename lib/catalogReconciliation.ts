import type { CatalogAccessState } from './catalogPurchases';

/**
 * A lifetime purchase must stay usable through a temporary network or RevenueCat outage.
 * The catalog is only ever installed after a verified entitlement, so its presence on the
 * device is a safe local cache while the store is unreachable. A successful "no entitlement"
 * answer, or a build with no production store key, still fails closed and re-locks the cards.
 */
export function reconcileCatalogAccessWithInstall(
    next: CatalogAccessState,
    catalogInstalled: boolean,
): CatalogAccessState {
    if (next.status !== 'error' || !catalogInstalled) return next;
    return {
        ...next,
        hasAccess: true,
        error: next.error
            ? `${next.error} Satın alma daha önce doğrulandığı için çevrimdışı erişim korunuyor.`
            : 'Satın alma daha önce doğrulandığı için çevrimdışı erişim korunuyor.',
    };
}
