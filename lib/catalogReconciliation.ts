import type { BkaCatalogTier } from './bkaCatalog';
import type { CatalogAccessState } from './catalogPurchases';

/**
 * A lifetime purchase should remain usable through a temporary network/RevenueCat outage.
 * The physical `full` tier is written only after a verified entitlement (or the explicitly
 * development-only preview), so it is a safe local cache while the store is unreachable.
 * A successful locked response or a missing production configuration still fails closed.
 */
export function reconcileCatalogAccessWithInstalledTier(
    next: CatalogAccessState,
    installedTier: BkaCatalogTier | null,
): CatalogAccessState {
    if (next.status !== 'error' || installedTier !== 'full') return next;
    return {
        ...next,
        hasAccess: true,
        error: next.error
            ? `${next.error} Tam paket daha önce doğrulandığı için çevrimdışı erişim korunuyor.`
            : 'Tam paket daha önce doğrulandığı için çevrimdışı erişim korunuyor.',
    };
}
