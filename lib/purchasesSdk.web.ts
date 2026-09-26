import type PurchasesModule from 'react-native-purchases';

/**
 * Web stand-in for the RevenueCat SDK. The catalog is sold through the App Store only, so the web
 * build never configures a store (`catalogPurchases.ts` has no web API key) and never reaches these
 * calls. Importing the real package would still load RevenueCat's browser SDK — about a megabyte
 * of script — and log its browser-mode notice on every start, so the web build uses this instead.
 */
function unavailable(): never {
    throw new Error('In-app purchases are not available in the web build.');
}

const Purchases = {
    configure: unavailable,
    setLogLevel: () => undefined,
    getCustomerInfo: unavailable,
    getOfferings: unavailable,
    purchasePackage: unavailable,
    restorePurchases: unavailable,
} as unknown as typeof PurchasesModule;

export default Purchases;

export const LOG_LEVEL = { DEBUG: 'DEBUG' } as const;
