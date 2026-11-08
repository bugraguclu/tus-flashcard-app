import type { CatalogAccessState, CatalogPurchaseResult } from './catalogPurchases';

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

/**
 * The access state after installing or removing the cards for `next` threw `error`.
 *
 * The store's answer and the installation are separate outcomes. A buyer the store granted the
 * pack still owns it when the cards could not be installed: the store's status stays as it was
 * (this is not a store failure) and `installError` says why the install failed, so the screen
 * can say so and offer to install again. Access follows what is actually installed: a refresh
 * that failed leaves the earlier catalog in place and open.
 */
export function catalogAccessAfterInstallFailure(
    next: CatalogAccessState,
    error: unknown,
    fullCatalogInstalled: boolean,
): CatalogAccessState {
    const message = error instanceof Error ? error.message : String(error);
    // Access was withdrawn but the cards could not be removed: still there, and reported.
    if (!next.hasAccess) return { ...next, status: 'error', hasAccess: fullCatalogInstalled, error: message };
    return { ...next, hasAccess: fullCatalogInstalled, installError: message };
}

export type CatalogPurchaseOutcome = 'cancelled' | 'unlocked' | 'pending' | 'installFailed' | 'storeError' | 'notEntitled';

/** What a purchase or restore came to, for the message the catalog screen shows. */
export function catalogPurchaseOutcome(result: CatalogPurchaseResult): CatalogPurchaseOutcome {
    if (result.cancelled) return 'cancelled';
    if (result.hasAccess) return 'unlocked';
    if (result.pending) return 'pending';
    if (result.state.installError) return 'installFailed';
    return result.state.status === 'error' || result.state.error ? 'storeError' : 'notEntitled';
}
