import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useApp } from '../contexts/AppContext';
import { BKA_PRODUCT } from '../lib/catalogPurchases';
import { BKA_TRIAL_TOTAL_CARDS } from '../lib/bkaCatalog';
import { alert } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';

type Props = { embedded?: boolean; onContinueTrial?: () => void };

const FEATURES = [
    { icon: '◫', value: '9.583', tr: 'çalışma kartı', en: 'study cards' },
    { icon: '✚', value: '12', tr: 'TUS disiplini', en: 'TUS disciplines' },
    { icon: '▧', value: '100+', tr: 'uzmanlık alt destesi', en: 'topic subdecks' },
] as const;

const DEV_PAYMENT_SIMULATION = typeof __DEV__ !== 'undefined' && __DEV__;

export function CatalogScreen({ embedded = false, onContinueTrial }: Props) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { l } = useI18n();
    const { catalogAccess, purchaseCatalog, restoreCatalogPurchase } = useApp();
    const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
    const [showPaymentSimulation, setShowPaymentSimulation] = useState(false);

    const livePurchaseReady = catalogAccess.configured && catalogAccess.productAvailable;
    const purchaseReady = livePurchaseReady || DEV_PAYMENT_SIMULATION;
    const canClose = !embedded;

    const completePurchase = async () => {
        if (busy) return;
        setShowPaymentSimulation(false);
        setBusy('purchase');
        try {
            const result = await purchaseCatalog();
            if (result.cancelled) return;
            if (result.hasAccess) {
                alert(l('Satın alma tamamlandı', 'Purchase complete'), l('BKA TUS kartlarının tamamı açıldı.', 'The complete BKA TUS catalog is now unlocked.'));
            } else {
                alert(l('Satın alma tamamlanamadı', 'Purchase could not be completed'), result.state.error ?? l('Mağaza yanıtı doğrulanamadı.', 'The store response could not be verified.'));
            }
        } finally {
            setBusy(null);
        }
    };

    const buy = () => {
        if (!purchaseReady || busy) return;
        if (DEV_PAYMENT_SIMULATION) {
            setShowPaymentSimulation(true);
            return;
        }
        void completePurchase();
    };

    const restore = async () => {
        if (!catalogAccess.configured || busy) return;
        setBusy('restore');
        try {
            const result = await restoreCatalogPurchase();
            alert(
                result.hasAccess ? l('Satın alma geri yüklendi', 'Purchase restored') : l('Satın alma bulunamadı', 'No purchase found'),
                result.hasAccess
                    ? l('BKA TUS kartlarına erişimin yeniden açıldı.', 'Access to the BKA TUS catalog has been restored.')
                    : (result.state.error ?? l('Bu mağaza hesabında uygun bir satın alma bulunamadı.', 'No eligible purchase was found for this store account.')),
            );
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={[styles.screen, { paddingTop: Math.max(insets.top, Spacing.md) }]}> 
            <View style={styles.ambientTop} />
            <View style={styles.ambientBottom} />
            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.xl }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.topBar}>
                    <View style={styles.brandMark}><Text style={styles.brandMarkText}>B</Text></View>
                    <View style={styles.brandCopy}>
                        <Text style={styles.brand}>BKA TUS COMPLETE</Text>
                        <Text style={styles.brandSub}>{l('TusAnkiM özel koleksiyonu', 'TusAnkiM signature collection')}</Text>
                    </View>
                    {canClose && (
                        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} accessibilityLabel={l('Kapat', 'Close')}>
                            <Text style={styles.closeText}>×</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.hero}>
                    <View style={styles.pill}>
                        <View style={styles.pillDot} />
                        <Text style={styles.pillText}>{l('ÜCRETSİZ DENE · SONRA KARAR VER', 'TRY FREE · DECIDE LATER')}</Text>
                    </View>
                    <Text style={styles.title}>
                        {l('Her dersten 100 kartı ücretsiz çalış.', 'Study 100 cards from every course for free.')}
                    </Text>
                    <Text style={styles.subtitle}>
                        {l(
                            `Anki benzeri çalışma sistemi ücretsizdir. ${BKA_TRIAL_TOTAL_CARDS.toLocaleString('tr-TR')} örnek kartı bitir; devam etmek istersen tam koleksiyonu tek ödemeyle aç.`,
                            `The Anki-like study system is free. Complete ${BKA_TRIAL_TOTAL_CARDS.toLocaleString('en-US')} sample cards, then unlock the full collection with one payment if you want to continue.`,
                        )}
                    </Text>
                </View>

                <View style={styles.trialCard}>
                    <View style={styles.trialBadge}><Text style={styles.trialBadgeText}>{l('ÜCRETSİZ', 'FREE')}</Text></View>
                    <View style={styles.trialCopy}>
                        <Text style={styles.trialTitle}>{l('12 ders × 100 kart', '12 courses × 100 cards')}</Text>
                        <Text style={styles.trialText}>{l('Toplam 1.200 deneme kartı, çalışma geçmişi ve aralıklı tekrar ücretsiz.', '1,200 trial cards, study history, and spaced repetition are free.')}</Text>
                    </View>
                    <Text style={styles.trialCheck}>✓</Text>
                </View>

                <View style={styles.featureGrid}>
                    {FEATURES.map((feature) => (
                        <View key={feature.value} style={styles.featureCard}>
                            <Text style={styles.featureIcon}>{feature.icon}</Text>
                            <Text style={styles.featureValue}>{feature.value}</Text>
                            <Text style={styles.featureLabel}>{l(feature.tr, feature.en)}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.offerCard}>
                    <View style={styles.offerGlow} />
                    <View style={styles.offerHeader}>
                        <View>
                            <Text style={styles.offerEyebrow}>{l('TAM KOLEKSİYON', 'COMPLETE COLLECTION')}</Text>
                            <Text style={styles.price}>{catalogAccess.price || BKA_PRODUCT.fallbackPrice}</Text>
                            <Text style={styles.priceNote}>{l('Tek ödeme · abonelik yok', 'One payment · no subscription')}</Text>
                        </View>
                        <View style={styles.lifetimeBadge}>
                            <Text style={styles.lifetimeIcon}>∞</Text>
                            <Text style={styles.lifetimeText}>{l('SÜRESİZ', 'LIFETIME')}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />
                    {[
                        l('Deneme dışındaki 8.383 ek karta erişim', 'Access to 8,383 additional cards beyond the trial'),
                        l('100’den fazla alt konu destesinin tamamı', 'All 100+ topic subdecks'),
                        l('Çalışma ilerlemesi, istatistikler ve yedekleme', 'Study progress, statistics, and backups'),
                        l('Apple hesabıyla satın almayı geri yükleme', 'Restore purchase with your Apple account'),
                    ].map((item) => (
                        <View key={item} style={styles.checkRow}>
                            <View style={styles.checkCircle}><Text style={styles.check}>✓</Text></View>
                            <Text style={styles.checkText}>{item}</Text>
                        </View>
                    ))}

                    {catalogAccess.hasAccess ? (
                        <TouchableOpacity style={styles.primaryButton} onPress={() => embedded ? undefined : router.replace('/decks' as any)}>
                            <Text style={styles.primaryButtonText}>
                                {l('Tam koleksiyon açık', 'Full collection unlocked')}
                            </Text>
                            <Text style={styles.primaryArrow}>→</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.primaryButton, (!purchaseReady || busy) && styles.buttonDisabled]}
                            onPress={buy}
                            disabled={!purchaseReady || Boolean(busy)}
                            accessibilityRole="button"
                        >
                            {busy === 'purchase' || catalogAccess.status === 'loading' ? (
                                <ActivityIndicator color="#071d18" />
                            ) : (
                                <>
                                    <Text style={styles.primaryButtonText}>
                                        {purchaseReady
                                            ? l(`${catalogAccess.price} ile satın al`, `Buy for ${catalogAccess.price}`)
                                            : l('Mağaza yapılandırması bekleniyor', 'Store configuration required')}
                                    </Text>
                                    <Text style={styles.primaryArrow}>→</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                    {embedded && !catalogAccess.hasAccess && onContinueTrial && (
                        <TouchableOpacity
                            style={styles.continueTrialButton}
                            onPress={onContinueTrial}
                            disabled={Boolean(busy)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.continueTrialText}>
                                {l('1.200 ücretsiz kartla devam et', 'Continue with 1,200 free cards')}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {catalogAccess.status === 'error' && (
                        <Text style={styles.errorText}>{catalogAccess.error}</Text>
                    )}
                    {catalogAccess.status === 'unconfigured' && (
                        <Text style={styles.setupText}>
                            {DEV_PAYMENT_SIMULATION
                                ? l(
                                    'Geliştirme ödeme simülasyonu açık; gerçek ücret alınmaz. Yayın derlemesinde yalnızca doğrulanmış App Store satın alması erişim açar.',
                                    'Development payment simulation is active; no real charge occurs. Release builds unlock only after a verified App Store purchase.',
                                )
                                : l(
                                    'App Store ürünü yayın öncesinde RevenueCat anahtarıyla bağlanmalıdır. Ücretsiz 1.200 kartlık deneme erişimi açıktır.',
                                    'Connect the App Store product with the RevenueCat key before release. The free 1,200-card trial remains available.',
                                )}
                        </Text>
                    )}

                    <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={restore}
                        disabled={!catalogAccess.configured || Boolean(busy)}
                    >
                        {busy === 'restore' && <ActivityIndicator size="small" color={colors.accent} />}
                        <Text style={[styles.restoreText, !catalogAccess.configured && styles.restoreTextDisabled]}>
                            {l('Satın almayı geri yükle', 'Restore purchase')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.trustRow}>
                    <View style={styles.trustItem}>
                        <Text style={styles.trustIcon}>⌁</Text>
                        <Text style={styles.trustText}>{l('Güvenli App Store ödemesi', 'Secure App Store payment')}</Text>
                    </View>
                    <View style={styles.trustItem}>
                        <Text style={styles.trustIcon}>↻</Text>
                        <Text style={styles.trustText}>{l('Geri yüklenebilir erişim', 'Restorable access')}</Text>
                    </View>
                </View>

                <Text style={styles.legal}>
                    {l(
                        'Kartlar yalnızca sınava hazırlık ve eğitim amaçlıdır; tıbbi tavsiye veya klinik karar desteği değildir. Ödeme ve iade koşulları kullandığın mağazaya tabidir.',
                        'Cards are for exam preparation and education only; they are not medical advice or clinical decision support. Payment and refund terms are governed by your store.',
                    )}
                </Text>
                <Text style={styles.platformNote}>
                    {Platform.OS === 'ios'
                        ? l('Kesin fiyat, Apple satın alma onay ekranında gösterilir.', 'Apple shows the final price on the purchase confirmation screen.')
                        : l('İlk ücretli sürüm yalnızca iPhone App Store’da sunulacaktır.', 'The first paid release will be available only on the iPhone App Store.')}
                </Text>
            </ScrollView>

            <Modal
                visible={showPaymentSimulation}
                transparent
                animationType="fade"
                onRequestClose={() => { void completePurchase(); }}
            >
                <View style={styles.paymentBackdrop}>
                    <View style={styles.paymentSheet} accessibilityViewIsModal>
                        <View style={styles.appleMark}><Text style={styles.appleMarkText}></Text></View>
                        <Text style={styles.paymentStore}>App Store</Text>
                        <Text style={styles.paymentProduct}>BKA TUS Complete</Text>
                        <Text style={styles.paymentType}>{l('Süresiz erişim', 'Lifetime access')}</Text>
                        <Text style={styles.paymentPrice}>₺1.500</Text>
                        <View style={styles.paymentRule} />
                        <Text style={styles.paymentDisclosure}>
                            {l(
                                'Geliştirme ödeme simülasyonu · Kartından ücret çekilmez. Bu ekrandaki iki seçim de tam koleksiyonu test için açar.',
                                'Development payment simulation · Your card will not be charged. Either choice unlocks the full collection for testing.',
                            )}
                        </Text>
                        <View style={styles.paymentActions}>
                            <TouchableOpacity
                                style={[styles.paymentAction, styles.paymentCancel]}
                                onPress={() => { void completePurchase(); }}
                            >
                                <Text style={styles.paymentCancelText}>{l('Şimdi Değil', 'Not Now')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.paymentAction, styles.paymentConfirm]}
                                onPress={() => { void completePurchase(); }}
                            >
                                <Text style={styles.paymentConfirmText}>{l('Satın Al', 'Purchase')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

export default function CatalogRoute() {
    return <CatalogScreen />;
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: '#071d18', overflow: 'hidden' },
        ambientTop: { position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: '#164b3c', opacity: 0.42, top: -190, right: -120 },
        ambientBottom: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#caa85e', opacity: 0.10, bottom: -120, left: -120 },
        content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: Spacing.lg },
        topBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, marginBottom: Spacing.lg },
        brandMark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d4b66b' },
        brandMarkText: { color: '#071d18', fontSize: 22, lineHeight: 25, fontWeight: '900' },
        brandCopy: { marginLeft: 11, flex: 1 },
        brand: { color: '#f5f2e8', fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
        brandSub: { color: '#91afa5', fontSize: 11, marginTop: 2 },
        closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
        closeText: { color: '#f5f2e8', fontSize: 26, lineHeight: 28, fontWeight: '300' },
        hero: { alignItems: 'center', paddingHorizontal: Spacing.sm },
        pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212,182,107,0.12)', borderWidth: 1, borderColor: 'rgba(212,182,107,0.35)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
        pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d4b66b', marginRight: 7 },
        pillText: { color: '#e2c982', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
        title: { color: '#f8f5ec', fontSize: 36, lineHeight: 42, fontWeight: '900', textAlign: 'center', letterSpacing: -1.1, marginTop: Spacing.lg, maxWidth: 650 },
        subtitle: { color: '#acc1ba', fontSize: FontSize.md, lineHeight: 24, textAlign: 'center', marginTop: Spacing.md, maxWidth: 590 },
        trialCard: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: 'rgba(212,182,107,0.11)', borderWidth: 1, borderColor: 'rgba(212,182,107,0.30)' },
        trialBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: '#d4b66b' },
        trialBadgeText: { color: '#071d18', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
        trialCopy: { flex: 1, marginHorizontal: Spacing.sm },
        trialTitle: { color: '#f8f5ec', fontSize: FontSize.md, fontWeight: '800' },
        trialText: { color: '#acc1ba', fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },
        trialCheck: { color: '#d4b66b', fontSize: 20, fontWeight: '900' },
        featureGrid: { flexDirection: 'row', gap: 10, marginTop: Spacing.xl },
        featureCard: { flex: 1, minHeight: 118, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
        featureIcon: { color: '#d4b66b', fontSize: 18, marginBottom: 5 },
        featureValue: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
        featureLabel: { color: '#91afa5', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 3 },
        offerCard: { marginTop: Spacing.lg, backgroundColor: '#f5f2e8', borderRadius: 24, padding: Spacing.xl, overflow: 'hidden', ...Shadows.lg },
        offerGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -110, right: -70, backgroundColor: '#e4cd8b', opacity: 0.28 },
        offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        offerEyebrow: { color: '#577069', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
        price: { color: '#09271f', fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -1.2, marginTop: 4 },
        priceNote: { color: '#70827d', fontSize: 12, fontWeight: '600', marginTop: 1 },
        lifetimeBadge: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 13, backgroundColor: '#e8dfc3' },
        lifetimeIcon: { color: '#8a6d28', fontSize: 21, lineHeight: 22, fontWeight: '700' },
        lifetimeText: { color: '#765d21', fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
        divider: { height: 1, backgroundColor: '#ddd9cc', marginVertical: Spacing.lg },
        checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
        checkCircle: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#dcebe5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
        check: { color: '#17634e', fontSize: 12, fontWeight: '900' },
        checkText: { flex: 1, color: '#273b35', fontSize: 14, lineHeight: 20, fontWeight: '600' },
        primaryButton: { minHeight: 56, borderRadius: 16, backgroundColor: '#d4b66b', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
        buttonDisabled: { opacity: 0.48 },
        primaryButtonText: { color: '#071d18', fontSize: 16, fontWeight: '900', textAlign: 'center' },
        primaryArrow: { color: '#071d18', fontSize: 19, fontWeight: '900', marginLeft: 10 },
        restoreButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
        continueTrialButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
        continueTrialText: { color: '#17634e', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
        restoreText: { color: '#17634e', fontSize: 13, fontWeight: '800' },
        restoreTextDisabled: { color: '#9ca6a2' },
        setupText: { color: '#7f6d42', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 10 },
        errorText: { color: '#a23a3a', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 10 },
        trustRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginTop: Spacing.lg },
        trustItem: { flexDirection: 'row', alignItems: 'center' },
        trustIcon: { color: '#d4b66b', fontSize: 16, fontWeight: '700', marginRight: 6 },
        trustText: { color: '#91afa5', fontSize: 11, fontWeight: '700' },
        legal: { color: '#78978e', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: Spacing.lg, paddingHorizontal: Spacing.lg },
        platformNote: { color: '#607f76', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 6, paddingHorizontal: Spacing.lg },
        paymentBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'flex-end', padding: Spacing.md },
        paymentSheet: { width: '100%', maxWidth: 430, borderRadius: 28, backgroundColor: '#f7f7f8', paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.lg, alignItems: 'center', ...Shadows.lg },
        appleMark: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
        appleMarkText: { color: '#101114', fontSize: 28, lineHeight: 31 },
        paymentStore: { color: '#6e6e73', fontSize: 12, fontWeight: '700' },
        paymentProduct: { color: '#161617', fontSize: 21, fontWeight: '800', marginTop: 8 },
        paymentType: { color: '#6e6e73', fontSize: 13, marginTop: 4 },
        paymentPrice: { color: '#161617', fontSize: 30, lineHeight: 36, fontWeight: '800', marginTop: 13 },
        paymentRule: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: '#c7c7cc', marginVertical: Spacing.lg },
        paymentDisclosure: { color: '#6e6e73', fontSize: 11, lineHeight: 16, textAlign: 'center' },
        paymentActions: { flexDirection: 'row', width: '100%', gap: 10, marginTop: Spacing.lg },
        paymentAction: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
        paymentCancel: { backgroundColor: '#e7e7ea' },
        paymentConfirm: { backgroundColor: '#0878f9' },
        paymentCancelText: { color: '#1d1d1f', fontSize: 15, fontWeight: '700' },
        paymentConfirmText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
    });
}
