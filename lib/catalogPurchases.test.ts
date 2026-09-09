import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
    platform: { OS: 'ios' },
    settings: new Map<string, string>(),
    db: {
        getFirstSync: vi.fn((_sql: string, key: string) => {
            const value = fixture.settings.get(key);
            return value === undefined ? null : { value };
        }),
        runSync: vi.fn((_sql: string, key: string, value: string) => {
            fixture.settings.set(key, value);
        }),
    },
    purchases: {
        setLogLevel: vi.fn(),
        configure: vi.fn(),
        getCustomerInfo: vi.fn(),
        getOfferings: vi.fn(),
        purchasePackage: vi.fn(),
        restorePurchases: vi.fn(),
    },
}));

vi.mock('react-native', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    Platform: fixture.platform,
}));
vi.mock('./db', () => ({ getDB: () => fixture.db }));
vi.mock('react-native-purchases', () => ({
    default: fixture.purchases,
    LOG_LEVEL: { DEBUG: 'DEBUG' },
}));

const lockedCustomer = () => ({ entitlements: { active: {} } });
const unlockedCustomer = () => ({ entitlements: { active: { bka_tus_complete: { identifier: 'bka_tus_complete' } } } });
const offering = (productId = 'com.tusankim.bka.complete.lifetime') => ({
    all: {
        default: {
            availablePackages: [{ identifier: '$rc_lifetime', product: { identifier: productId, priceString: '₺1.500,00' } }],
        },
    },
    current: null,
});

describe('BKA catalog access', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        fixture.settings.clear();
        vi.stubGlobal('__DEV__', false);
        fixture.platform.OS = 'ios';
        delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
        delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
        delete process.env.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED;
        fixture.purchases.getCustomerInfo.mockResolvedValue(lockedCustomer());
        fixture.purchases.getOfferings.mockResolvedValue(offering());
        fixture.purchases.purchasePackage.mockResolvedValue({ customerInfo: unlockedCustomer() });
        fixture.purchases.restorePurchases.mockResolvedValue(unlockedCustomer());
    });

    it('offers a direct local unlock without contacting the store', async () => {
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'ready', hasAccess: false, previewAccess: false, configured: false, productAvailable: true,
        });
        expect(fixture.purchases.configure).not.toHaveBeenCalled();
        expect(fixture.purchases.getCustomerInfo).not.toHaveBeenCalled();
        expect(fixture.purchases.getOfferings).not.toHaveBeenCalled();
    });

    it('keeps locally unlocked cards open after the app module reloads', async () => {
        fixture.settings.set('bka_catalog_dev_preview_entitled_v1', 'true');
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'ready', hasAccess: true, previewAccess: true, configured: false,
        });
        expect(fixture.purchases.getCustomerInfo).not.toHaveBeenCalled();
    });

    it('never removes a complete catalog that is already installed locally', async () => {
        fixture.settings.set('bka_tus_catalog_installed_v5', 'full');
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'ready', hasAccess: true, previewAccess: true,
        });
        expect(fixture.purchases.getCustomerInfo).not.toHaveBeenCalled();
    });

    it('uses only the exact product and the store-localized price', async () => {
        process.env.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED = 'true';
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_public_test';
        fixture.purchases.getCustomerInfo.mockResolvedValue(unlockedCustomer());
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'ready', hasAccess: true, configured: true,
            productAvailable: true, price: '₺1.500,00',
        });
        expect(fixture.purchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_public_test' });
    });

    it('does not offer a differently identified store product', async () => {
        process.env.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED = 'true';
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_public_test';
        fixture.purchases.getOfferings.mockResolvedValue(offering('wrong.product'));
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'ready', hasAccess: false, productAvailable: false,
        });
    });

    it('opens access only after the entitlement appears on the purchase receipt', async () => {
        process.env.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED = 'true';
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_public_test';
        const { loadCatalogAccess, purchaseBkaCatalog } = await import('./catalogPurchases');
        await loadCatalogAccess();

        const result = await purchaseBkaCatalog();
        expect(fixture.purchases.purchasePackage).toHaveBeenCalledOnce();
        expect(result.hasAccess).toBe(true);
        expect(result.cancelled).toBe(false);
    });

    it('unlocks the complete catalog without charging or checking a receipt', async () => {
        const { purchaseBkaCatalog } = await import('./catalogPurchases');

        const result = await purchaseBkaCatalog();

        expect(result.hasAccess).toBe(true);
        expect(result.state.previewAccess).toBe(true);
        expect(result.cancelled).toBe(false);
        expect(fixture.purchases.configure).not.toHaveBeenCalled();
        expect(fixture.purchases.purchasePackage).not.toHaveBeenCalled();
    });

    it('keeps the local unlock after the purchase module is reloaded', async () => {
        const firstModule = await import('./catalogPurchases');
        await firstModule.purchaseBkaCatalog();

        vi.resetModules();
        const reloadedModule = await import('./catalogPurchases');
        const state = await reloadedModule.loadCatalogAccess();

        expect(state).toMatchObject({ status: 'ready', hasAccess: true, previewAccess: true });
        expect(fixture.purchases.getCustomerInfo).not.toHaveBeenCalled();
    });

    it('returns to the unlock state after a collection reset clears local catalog markers', async () => {
        fixture.settings.set('bka_catalog_dev_preview_entitled_v1', 'true');
        fixture.settings.set('bka_tus_catalog_installed_v5', 'full');
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({ hasAccess: true, previewAccess: true });

        fixture.settings.clear();

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'ready', hasAccess: false, previewAccess: false, productAvailable: true,
        });
    });

    it('fails closed when native SDK configuration throws', async () => {
        process.env.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED = 'true';
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_public_test';
        fixture.purchases.configure.mockImplementationOnce(() => { throw new Error('native SDK unavailable'); });
        const { loadCatalogAccess } = await import('./catalogPurchases');

        await expect(loadCatalogAccess()).resolves.toMatchObject({
            status: 'error', hasAccess: false, configured: true, productAvailable: false,
            error: 'native SDK unavailable',
        });
    });

    it('restores the lifetime entitlement from the current store account', async () => {
        process.env.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED = 'true';
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_public_test';
        const { restoreBkaCatalogPurchase } = await import('./catalogPurchases');

        const result = await restoreBkaCatalogPurchase();
        expect(fixture.purchases.restorePurchases).toHaveBeenCalledOnce();
        expect(result.hasAccess).toBe(true);
    });
});
