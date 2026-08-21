import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { getDB } from './db';

/** RevenueCat/App Store/Play Console identifiers that must match the store setup. */
export const BKA_PRODUCT = {
    entitlementId: 'bka_tus_complete',
    offeringId: 'default',
    productId: 'com.tusankim.bka.complete.lifetime',
    fallbackPrice: '₺1.500',
    amountTry: 1500,
} as const;

const STORE_REFRESH_TIMEOUT_MS = 8_000;
const DEV_PREVIEW_ENTITLEMENT_KEY = 'bka_catalog_dev_preview_entitled_v1';

export type CatalogAccessStatus = 'loading' | 'ready' | 'unconfigured' | 'error';

export interface CatalogAccessState {
    status: CatalogAccessStatus;
    hasAccess: boolean;
    /** Development-only access when no live store key is present. Never true in release builds. */
    previewAccess: boolean;
    configured: boolean;
    price: string;
    productAvailable: boolean;
    error?: string;
}

export interface CatalogPurchaseResult {
    hasAccess: boolean;
    cancelled: boolean;
    state: CatalogAccessState;
}

export const INITIAL_CATALOG_ACCESS: CatalogAccessState = {
    status: 'loading',
    hasAccess: false,
    previewAccess: false,
    configured: false,
    price: BKA_PRODUCT.fallbackPrice,
    productAvailable: false,
};

let configuredKey: string | null = null;
let catalogPackage: PurchasesPackage | null = null;

function isDevelopmentPreview(): boolean {
    return typeof __DEV__ !== 'undefined' && __DEV__;
}

function developmentPreviewState(): CatalogAccessState {
    return {
        status: 'ready',
        hasAccess: true,
        previewAccess: true,
        configured: Boolean(apiKeyForPlatform()),
        price: BKA_PRODUCT.fallbackPrice,
        productAvailable: true,
    };
}

function hasPersistedDevelopmentPreview(): boolean {
    if (!isDevelopmentPreview()) return false;
    try {
        return getDB().getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            DEV_PREVIEW_ENTITLEMENT_KEY,
        )?.value === 'true';
    } catch {
        // Purchase state can be queried before SQLite startup in isolated tests or unusual
        // native lifecycle races. In that case remain locked until the next refresh.
        return false;
    }
}

function persistDevelopmentPreview(): void {
    if (!isDevelopmentPreview()) return;
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        DEV_PREVIEW_ENTITLEMENT_KEY,
        'true',
    );
}

function apiKeyForPlatform(): string {
    if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? '';
    // The first commercial release is iOS-only. Other platforms remain the free trial until a
    // separate store product and billing implementation are deliberately shipped.
    return '';
}

function hasEntitlement(customerInfo: CustomerInfo): boolean {
    return customerInfo.entitlements.active[BKA_PRODUCT.entitlementId] !== undefined;
}

function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String(error.message);
    return String(error);
}

function isCancelled(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'userCancelled' in error && error.userCancelled);
}

function unconfiguredState(): CatalogAccessState {
    return {
        status: 'unconfigured',
        hasAccess: false,
        previewAccess: false,
        configured: false,
        price: BKA_PRODUCT.fallbackPrice,
        productAvailable: false,
    };
}

function configurePurchases(): boolean {
    const apiKey = apiKeyForPlatform();
    if (!apiKey) return false;
    if (configuredKey === apiKey) return true;

    if (isDevelopmentPreview()) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey });
    configuredKey = apiKey;
    return true;
}

function selectCatalogPackage(packages: readonly PurchasesPackage[]): PurchasesPackage | null {
    return packages.find((entry) => entry.product.identifier === BKA_PRODUCT.productId) ?? null;
}

function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error(`${label} zaman aşımına uğradı. Ücretsiz deneme kullanılabilir.`)),
            STORE_REFRESH_TIMEOUT_MS,
        );
        operation.then(
            (value) => { clearTimeout(timeout); resolve(value); },
            (error) => { clearTimeout(timeout); reject(error); },
        );
    });
}

/** Refresh entitlement and store-localized price. Receipt-backed state is the only release gate. */
export async function loadCatalogAccess(): Promise<CatalogAccessState> {
    try {
        if (hasPersistedDevelopmentPreview()) return developmentPreviewState();
        if (!configurePurchases()) return unconfiguredState();
        const [customerInfo, offerings] = await withTimeout(Promise.all([
            Purchases.getCustomerInfo(),
            Purchases.getOfferings(),
        ]), 'App Store bağlantısı');
        const offering = offerings.all[BKA_PRODUCT.offeringId] ?? offerings.current;
        catalogPackage = selectCatalogPackage(offering?.availablePackages ?? []);
        return {
            status: 'ready',
            hasAccess: hasEntitlement(customerInfo),
            previewAccess: false,
            configured: true,
            price: catalogPackage?.product.priceString ?? BKA_PRODUCT.fallbackPrice,
            productAvailable: Boolean(catalogPackage),
        };
    } catch (error) {
        catalogPackage = null;
        return {
            status: 'error',
            hasAccess: false,
            previewAccess: false,
            configured: true,
            price: BKA_PRODUCT.fallbackPrice,
            productAvailable: false,
            error: formatError(error),
        };
    }
}

export async function purchaseBkaCatalog(): Promise<CatalogPurchaseResult> {
    try {
        // Local development intentionally simulates the paywall outcome so the complete
        // 9,583-card experience can be reviewed without a sandbox transaction. This branch
        // is eliminated from production bundles; release access remains receipt-backed.
        if (isDevelopmentPreview()) {
            persistDevelopmentPreview();
            const state = developmentPreviewState();
            return { hasAccess: true, cancelled: false, state };
        }
        if (!configurePurchases()) {
            const state = unconfiguredState();
            return { hasAccess: state.hasAccess, cancelled: false, state };
        }
        if (!catalogPackage) {
            const refreshed = await loadCatalogAccess();
            if (!refreshed.productAvailable || !catalogPackage) {
                throw new Error(`Mağaza ürünü bulunamadı: ${BKA_PRODUCT.productId}`);
            }
        }
        const { customerInfo } = await Purchases.purchasePackage(catalogPackage);
        const hasAccess = hasEntitlement(customerInfo);
        const state = await loadCatalogAccess();
        return { hasAccess, cancelled: false, state: { ...state, hasAccess } };
    } catch (error) {
        if (isCancelled(error)) {
            const state = await loadCatalogAccess();
            return { hasAccess: state.hasAccess, cancelled: true, state };
        }
        const state: CatalogAccessState = {
            status: 'error',
            hasAccess: false,
            previewAccess: false,
            configured: true,
            price: catalogPackage?.product.priceString ?? BKA_PRODUCT.fallbackPrice,
            productAvailable: Boolean(catalogPackage),
            error: formatError(error),
        };
        return { hasAccess: false, cancelled: false, state };
    }
}

export async function restoreBkaCatalogPurchase(): Promise<CatalogPurchaseResult> {
    try {
        if (!configurePurchases()) {
            const state = unconfiguredState();
            return { hasAccess: state.hasAccess, cancelled: false, state };
        }
        const customerInfo = await Purchases.restorePurchases();
        const hasAccess = hasEntitlement(customerInfo);
        const state = await loadCatalogAccess();
        return { hasAccess, cancelled: false, state: { ...state, hasAccess } };
    } catch (error) {
        const state: CatalogAccessState = {
            status: 'error',
            hasAccess: false,
            previewAccess: false,
            configured: true,
            price: catalogPackage?.product.priceString ?? BKA_PRODUCT.fallbackPrice,
            productAvailable: Boolean(catalogPackage),
            error: formatError(error),
        };
        return { hasAccess: false, cancelled: false, state };
    }
}
