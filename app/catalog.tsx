import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { Text } from '../components/AppText';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useCatalogStatus } from '../contexts/AppContext';
import { BKA_PRODUCT, isCatalogPurchaseSimulationEnabled } from '../lib/catalogPurchases';
import { BKA_MANIFEST } from '../lib/bkaManifest';
import { formatCount } from '../lib/i18n';
import { alert } from '../lib/confirm';
import { readOnlyTabMessage } from '../lib/db';
import { goBackOr } from '../lib/backNavigation';
import { useI18n } from '../hooks/useI18n';
import DisclosureChevron from '../components/DisclosureChevron';
import LockGlyph from '../components/LockGlyph';
import ScreenHeader from '../components/ScreenHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Choice';
import { AppDialog } from '../components/ui/Dialog';
import { Notice } from '../components/ui/Feedback';
import { CheckIcon } from '../components/ui/icons';
import { Type } from '../components/ui/tokens';
import { BKA_CATALOG_DEFAULT_ROOT_DECK, getBkaCatalogRootDeckName } from '../lib/bkaCatalog';
import { getDeckByName } from '../lib/deckManager';
import { studySubjectInitial } from '../lib/studyCalendar';

/** Deep, near-black green: reads as premium in both themes and keeps the hero legible. */
const HERO_TOP = '#0d3128';
const HERO_BOTTOM = '#14513f';
const HERO_TEXT = '#f2f7f4';
const HERO_MUTED = '#9fbcb0';
const HERO_ACCENT = '#7ddcae';
/** The hairline over the hero's stats. */
const HERO_RULE = 'rgba(255,255,255,0.18)';

export default function CatalogScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { l, locale } = useI18n();
    const { catalogAccess, catalogInstalling, purchaseCatalog, restoreCatalogPurchase } = useCatalogStatus();
    const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    // The gradient is painted at an explicit pixel size: a percentage-sized SVG keeps the height
    // of the first layout pass and leaves a strip of the hero unpainted as the copy wraps.
    const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });

    const owned = catalogAccess.hasAccess;
    const price = catalogAccess.price || BKA_PRODUCT.fallbackPrice;
    const purchaseSimulationEnabled = isCatalogPurchaseSimulationEnabled();
    const canBuy = (catalogAccess.configured && catalogAccess.productAvailable) || purchaseSimulationEnabled;
    const number = (value: number) => formatCount(value, locale);
    const trialDeckName = getBkaCatalogRootDeckName();
    const trialAvailable = !owned && Boolean(getDeckByName(trialDeckName));

    const buy = async () => {
        if (busy || owned || !canBuy) return;
        const readOnly = readOnlyTabMessage();
        if (readOnly) {
            alert(l('Kartlar açılamadı', 'Cards could not be unlocked'), readOnly);
            return;
        }
        setBusy('purchase');
        try {
            const result = await purchaseCatalog();
            if (result.cancelled) return;
            if (result.hasAccess) {
                // The cards are the point of the purchase, so acknowledging it is also the way to
                // them: OK closes this screen onto the deck list that now holds the pack.
                alert(
                    l('Paket açıldı', 'Package unlocked'),
                    l(
                        `${number(BKA_MANIFEST.totals.cards)} kartın tamamı deste listenize eklendi.`,
                        `All ${number(BKA_MANIFEST.totals.cards)} cards were added to your deck list.`,
                    ),
                    () => goBackOr(router),
                );
            } else {
                alert(
                    purchaseSimulationEnabled
                        ? l('Kartlar açılamadı', 'Cards could not be unlocked')
                        : l('Satın alma tamamlanamadı', 'Purchase could not be completed'),
                    purchaseSimulationEnabled
                        ? l(
                            'Kartlar kurulamadı. Kendi desteleriniz ve kartlarınız değiştirilmedi. Uygulamayı kapatıp yeniden açın; kurulum kendiliğinden yeniden denenir.',
                            'The cards could not be installed. Your own decks and cards were not changed. Close and reopen the app; the installation is tried again automatically.',
                        )
                        : result.state.error
                            ? l('Mağazaya bağlanılamadı. Bağlantınızı kontrol edip yeniden deneyin.', 'Could not connect to the store. Check your connection and try again.')
                            : l('Mağaza yanıtı doğrulanamadı.', 'The store response could not be verified.'),
                );
            }
        } finally {
            setBusy(null);
        }
    };

    const restore = async () => {
        if (busy || !catalogAccess.configured) return;
        setBusy('restore');
        try {
            const result = await restoreCatalogPurchase();
            alert(
                result.hasAccess ? l('Satın alma geri yüklendi', 'Purchase restored') : l('Satın alma bulunamadı', 'No purchase found'),
                result.hasAccess
                    ? l('Kartlara erişiminiz yeniden açıldı.', 'Your access to the cards has been restored.')
                    : (result.state.error
                        ? l('Satın alma bilgileri alınamadı. Lütfen yeniden deneyin.', 'Could not retrieve purchase information. Please try again.')
                        : l('Bu Apple hesabında uygun bir satın alma bulunamadı.', 'No eligible purchase was found for this Apple account.')),
            );
        } finally {
            setBusy(null);
        }
    };

    const primaryLabel = () => {
        if (owned) return l('Destelerime git', 'Go to my decks');
        if (purchaseSimulationEnabled) return l('Kartları ücretsiz aç', 'Unlock cards for free');
        if (!canBuy) return l('Mağaza hazırlanıyor', 'Store not ready');
        return l(`${price} · Satın al`, `${price} · Buy`);
    };

    return (
        <View style={styles.screen}>
            <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
                <ScreenHeader
                    leading="close"
                    title={BKA_CATALOG_DEFAULT_ROOT_DECK}
                    backAccessibilityLabel={l('Kapat', 'Close')}
                    onBack={() => goBackOr(router)}
                    actions={(
                        <View style={styles.statusBadge}>
                            <Badge label={owned ? l('Açık', 'Unlocked') : l('Kilitli', 'Locked')} tone={owned ? 'accent' : 'neutral'} />
                        </View>
                    )}
                />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxxl }]}
                showsVerticalScrollIndicator={false}
            >
                <View
                    style={styles.hero}
                    onLayout={(event) => {
                        const { width, height } = event.nativeEvent.layout;
                        setHeroSize((current) => (
                            current.width === width && current.height === height ? current : { width, height }
                        ));
                    }}
                >
                    {heroSize.width > 0 && (
                        <Svg
                            style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
                            width={heroSize.width}
                            height={heroSize.height}
                        >
                            <Defs>
                                <LinearGradient id="heroFill" x1="0" y1="0" x2="1" y2="1">
                                    <Stop offset="0" stopColor={HERO_TOP} />
                                    <Stop offset="1" stopColor={HERO_BOTTOM} />
                                </LinearGradient>
                            </Defs>
                            <Rect x="0" y="0" width={heroSize.width} height={heroSize.height} fill="url(#heroFill)" />
                        </Svg>
                    )}

                    {/* Part of the hero artwork: its own colours on the dark green, sized to its text. */}
                    <View style={styles.heroBadge}>
                        <Text style={styles.heroBadgeText}>
                            {/* Nothing is bought while the pack is free, so neither badge may say so. */}
                            {purchaseSimulationEnabled
                                ? (owned ? l('AÇIK', 'UNLOCKED') : l('HAZIR KART PAKETİ', 'READY-MADE CARD PACK'))
                                : (owned ? l('SATIN ALINDI', 'PURCHASED') : l('PREMIUM KART PAKETİ', 'PREMIUM CARD PACK'))}
                        </Text>
                    </View>
                    <Text style={styles.heroTitle}>
                        {l(
                            `TUS için hazır\n${number(BKA_MANIFEST.totals.cards)} kart`,
                            `TUS-ready\n${number(BKA_MANIFEST.totals.cards)} cards`,
                        )}
                    </Text>
                    <Text style={styles.heroSubtitle}>
                        {l(
                            `Uygulamanın tamamı ücretsizdir. Bu paket, ${BKA_MANIFEST.totals.courses} dersin tamamını kapsayan hazır soru ve bilgi kartlarını deste listenize ekler.`,
                            `The app itself is free. This pack adds ready-made question and knowledge cards covering all ${BKA_MANIFEST.totals.courses} courses to your deck list.`,
                        )}
                    </Text>

                    <View style={styles.heroStats}>
                        {[
                            { value: number(BKA_MANIFEST.totals.cards), label: l('kart', 'cards') },
                            { value: String(BKA_MANIFEST.totals.courses), label: l('ders', 'courses') },
                            { value: String(BKA_MANIFEST.totals.topics), label: l('alt deste', 'subdecks') },
                        ].map((stat) => (
                            <View key={stat.label} style={styles.heroStat}>
                                <Text style={styles.heroStatValue}>{stat.value}</Text>
                                <Text style={styles.heroStatLabel}>{stat.label}</Text>
                            </View>
                        ))}
                    </View>

                    {!owned && !purchaseSimulationEnabled && (
                        <View style={styles.heroPriceRow}>
                            <Text style={styles.heroPrice}>{price}</Text>
                            <Text style={styles.heroPriceNote}>
                                {l('tek ödeme · süresiz erişim', 'one payment · lifetime access')}
                            </Text>
                        </View>
                    )}
                </View>

                <Card
                    divided
                    style={styles.courseCard}
                    title={l('Paket içeriği', "What's inside")}
                    description={`${owned
                        ? l('Desteler koleksiyonuna eklendi.', 'These decks are in your collection.')
                        : l(
                            purchaseSimulationEnabled
                                ? 'Kartları ücretsiz aç düğmesine dokunduğunuzda tüm kartlar deste listenize eklenir.'
                                : 'Ücretsiz denemede her alt başlığın en iyi 30 gerçek kartını çözebilirsiniz; satın alma sonrasında tüm kartlar açılır.',
                            purchaseSimulationEnabled
                                ? 'Tap Unlock cards for free to add every card to your deck list.'
                                : 'The free trial includes the best 30 real cards from every subtopic; purchasing the pack unlocks every card.',
                        )} ${l(
                        'Alt desteler, paketi hazırlayanın konu etiketlerinden ve etiketsiz kartlarda kart metnindeki konu terimlerinden oluşur. Hiçbir konuya yerleşmeyen kartlar dersin kendi destesinde kalır ve ders çalışılırken gelir.',
                        'Subdecks come from the pack author’s topic tags and, for untagged cards, from the subject terms in the card text. Cards that fit no topic stay in the course deck itself and come up when you study the course.',
                    )}`}
                >
                    {BKA_MANIFEST.courses.map((course) => {
                        const isOpen = expanded === course.id;
                        const subdeckCount = course.topics.filter((topic) => topic.deck).length;
                        return (
                            <View key={course.id}>
                                <Pressable
                                    style={({ pressed }) => [styles.courseRow, pressed && styles.pressed]}
                                    onPress={() => setExpanded(isOpen ? null : course.id)}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: isOpen }}
                                    accessibilityLabel={l(
                                        `${course.name}, ${course.cards} kart, ${subdeckCount} alt deste`,
                                        `${course.name}, ${course.cards} cards, ${subdeckCount} subdecks`,
                                    )}
                                >
                                    <View style={styles.courseChevron}>
                                        <DisclosureChevron expanded={isOpen} color={colors.textMuted} size={16} />
                                    </View>
                                    <View style={styles.courseIconTile}>
                                        <Text style={styles.courseInitial}>{studySubjectInitial(course.name)}</Text>
                                    </View>
                                    <View style={styles.courseCopy}>
                                        <Text style={styles.courseName} numberOfLines={1}>{course.name}</Text>
                                        <Text style={styles.courseMeta}>
                                            {subdeckCount > 0
                                                ? l(
                                                    `${number(course.cards)} kart · ${subdeckCount} alt deste`,
                                                    `${number(course.cards)} cards · ${subdeckCount} subdecks`,
                                                )
                                                : l(`${number(course.cards)} kart`, `${number(course.cards)} cards`)}
                                        </Text>
                                    </View>
                                    {!owned && (
                                        <View style={styles.courseLock}>
                                            <LockGlyph color={colors.textMuted} size={13} />
                                        </View>
                                    )}
                                </Pressable>

                                {isOpen && (
                                    <View style={styles.topicWell}>
                                        {course.topics.map((topic) => (
                                            <View key={topic.name} style={styles.topicRow}>
                                                <View style={[styles.topicBullet, !topic.deck && styles.topicBulletPlain]} />
                                                <Text
                                                    style={[styles.topicName, !topic.deck && styles.topicNamePlain]}
                                                    numberOfLines={1}
                                                >
                                                    {topic.deck
                                                        ? topic.name
                                                        : l('Konuya ayrılmamış kartlar', 'Cards not sorted into a topic')}
                                                </Text>
                                                <Text style={styles.topicCount}>{number(topic.cards)}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </Card>

                <Card padded style={styles.infoCard}>
                    {[
                        ...(purchaseSimulationEnabled ? [{
                            title: l('Ücretsiz erişim', 'Free access'),
                            text: l('Ödeme veya mağaza kontrolü yapılmadan tam paket cihazınıza kurulur.', 'The complete package is installed without a payment or store check.'),
                        }] : [{
                            title: l('Tek seferlik ödeme', 'One-time payment'),
                            text: l('Abonelik veya yenileme yoktur. Bir kez ödeyerek süresiz kullanabilirsiniz.', 'No subscription or renewal. Pay once and use it forever.'),
                        },
                        {
                            title: l('Apple hesabına bağlı', 'Tied to your Apple account'),
                            text: l('Telefonunuzu değiştirseniz de satın alma işlemini geri yükleyebilirsiniz.', 'You can restore the purchase even if you change your phone.'),
                        }]),
                        {
                            title: l('Kendi kartlarınız ayrı kalır', 'Your own cards stay separate'),
                            text: l('Kendi desteleriniz, notlarınız ve çalışma geçmişiniz aynen korunur.', 'Your own decks, notes, and review history are left untouched.'),
                        },
                        {
                            title: l('Çevrimdışı çalışır', 'Works offline'),
                            text: l('Kartlar cihazınıza kurulur; internet bağlantısı olmadan da çalışabilirsiniz.', 'Cards are installed on your device and work without an internet connection.'),
                        },
                    ].map((item) => (
                        <View key={item.title} style={styles.infoRow}>
                            <View style={styles.infoCheck}>
                                <CheckIcon color={colors.accent} size={18} />
                            </View>
                            <View style={styles.infoCopy}>
                                <Text style={[Type.bodyStrong, { color: colors.textPrimary }]}>{item.title}</Text>
                                <Text style={styles.infoText}>{item.text}</Text>
                            </View>
                        </View>
                    ))}
                </Card>

                <Text style={styles.legal}>
                    {purchaseSimulationEnabled
                        ? l(
                            'Kartlar yalnızca sınava hazırlık ve eğitim amaçlıdır; tıbbi tavsiye veya klinik karar desteği değildir. Bu erişim için ücret alınmaz.',
                            'The cards are for exam preparation and education only; they are not medical advice or clinical decision support. There is no charge for this access.',
                        )
                        : l(
                            'Kartlar yalnızca sınava hazırlık ve eğitim amaçlıdır; tıbbi tavsiye veya klinik karar desteği değildir. Ödeme Apple hesabından tahsil edilir; iade koşulları App Store kurallarına tabidir.',
                            'The cards are for exam preparation and education only; they are not medical advice or clinical decision support. Payment is charged to your Apple account and refunds follow App Store policy.',
                        )}
                </Text>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
                {!purchaseSimulationEnabled && catalogAccess.status === 'error' && !!catalogAccess.error && (
                    <Notice tone="danger" style={styles.footerNotice}>{l(
                        'Mağazaya bağlanılamadı. Bağlantınızı kontrol edip yeniden deneyin.',
                        'Could not connect to the store. Check your connection and try again.',
                    )}</Notice>
                )}
                {catalogAccess.status === 'unconfigured' && !purchaseSimulationEnabled && (
                    <Notice tone="danger" style={styles.footerNotice}>
                        {l('Mağaza bağlantısı bu derlemede yapılandırılmadı.', 'The store connection is not configured in this build.')}
                    </Notice>
                )}

                <Button
                    label={primaryLabel()}
                    onPress={owned ? () => router.replace('/decks' as any) : buy}
                    // The purchase's own spinner shows on the button; anything else under way disables it.
                    // An owner's way to the decks never waits on a store refresh.
                    busy={busy === 'purchase' || (!owned && catalogAccess.status === 'loading')}
                    disabled={(!canBuy && !owned) || (Boolean(busy) && busy !== 'purchase') || catalogInstalling}
                />

                {!owned && !purchaseSimulationEnabled && (
                    <>
                        <Button
                            label={l('Ücretsiz denemeyi çöz', 'Study Free Trial')}
                            accessibilityLabel={l('Ücretsiz TUS Kartları denemesini çöz', 'Study the free TUS Cards trial')}
                            accessibilityHint={l('Her alt başlıktan en iyi 30 soru', 'Best 30 questions from every subtopic')}
                            variant="secondary"
                            onPress={() => router.replace(`/deck-overview?deck=${encodeURIComponent(trialDeckName)}` as any)}
                            disabled={!trialAvailable || Boolean(busy) || catalogInstalling}
                            style={styles.trialButton}
                        />
                        <Text style={styles.trialHint}>
                            {l('Her alt başlıktan en iyi 30 soru', 'Best 30 questions from every subtopic')}
                        </Text>
                        <Button
                            label={l('Satın almayı geri yükle', 'Restore purchase')}
                            variant="plain"
                            onPress={restore}
                            busy={busy === 'restore'}
                            disabled={!catalogAccess.configured || (Boolean(busy) && busy !== 'restore')}
                        />
                    </>
                )}
            </View>

            <AppDialog
                visible={catalogInstalling}
                // Nothing closes it: it goes when the pack has been installed.
                onClose={() => undefined}
                dismissOnBackdrop={false}
                title={l('Kartlar kuruluyor', 'Installing cards')}
                message={l(
                    'TUS Kartları deste listeniz için hazırlanıyor. Bu işlem birkaç saniye sürebilir.',
                    'Preparing TUS Cards for your deck list. This can take a few seconds.',
                )}
            >
                <ActivityIndicator size="large" color={colors.accent} />
            </AppDialog>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.bgPrimary },
        pressed: { opacity: 0.72 },

        // The safe area above the header takes the header's colour.
        headerWrap: { backgroundColor: colors.bgCard },
        statusBadge: { paddingRight: Spacing.sm },

        scroll: { flex: 1 },
        content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: Spacing.md },

        hero: {
            borderRadius: 24,
            padding: Spacing.xl,
            overflow: 'hidden',
            // Solid ground under the gradient, so the hero is never half-painted mid-layout.
            backgroundColor: HERO_TOP,
            ...Shadows.md,
        },
        heroBadge: {
            alignSelf: 'flex-start',
            paddingHorizontal: 10, paddingVertical: 6,
            borderRadius: BorderRadius.full,
            backgroundColor: 'rgba(125,220,174,0.16)',
            borderWidth: 1, borderColor: 'rgba(125,220,174,0.4)',
        },
        heroBadgeText: { color: HERO_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
        heroTitle: {
            color: HERO_TEXT, fontSize: 32, lineHeight: 38, fontWeight: '900',
            letterSpacing: -0.8, marginTop: Spacing.lg,
        },
        heroSubtitle: { color: HERO_MUTED, fontSize: FontSize.md, lineHeight: 21, marginTop: Spacing.sm },
        heroStats: {
            flexDirection: 'row',
            marginTop: Spacing.lg,
            paddingTop: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: HERO_RULE,
        },
        heroStat: { flex: 1 },
        heroStatValue: { color: HERO_TEXT, fontSize: FontSize.xl, fontWeight: '900' },
        heroStatLabel: { color: HERO_MUTED, fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 },
        heroPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginTop: Spacing.lg },
        heroPrice: { color: HERO_TEXT, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
        heroPriceNote: { color: HERO_MUTED, fontSize: FontSize.sm, fontWeight: '600', flexShrink: 1 },

        courseCard: { marginTop: Spacing.xl },
        courseRow: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: Spacing.md },
        courseChevron: { width: 22, alignItems: 'center' },
        courseIconTile: {
            width: 28, height: 28, borderRadius: BorderRadius.md,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.accentLight,
            marginHorizontal: Spacing.sm,
        },
        courseInitial: { color: colors.accent, fontSize: FontSize.md, fontWeight: '700' },
        courseCopy: { flex: 1 },
        courseName: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        courseMeta: { color: colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
        courseLock: { marginLeft: Spacing.sm, opacity: 0.6 },

        topicWell: {
            paddingLeft: Spacing.xxxl + Spacing.sm,
            paddingRight: Spacing.md,
            paddingBottom: Spacing.sm,
            backgroundColor: colors.bgSecondary,
        },
        topicRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
        topicBullet: {
            width: 5, height: 5, borderRadius: 3,
            backgroundColor: colors.textMuted, opacity: 0.6, marginRight: Spacing.sm,
        },
        topicBulletPlain: { opacity: 0.25 },
        topicName: { flex: 1, color: colors.textSecondary, fontSize: FontSize.md },
        topicNamePlain: { color: colors.textMuted, fontStyle: 'italic' },
        topicCount: { color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '700' },

        infoCard: { marginTop: Spacing.xl },
        infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
        infoCheck: { width: 26, paddingTop: 1 },
        infoCopy: { flex: 1 },
        infoText: { ...Type.caption, lineHeight: 19, color: colors.textMuted, marginTop: 2 },

        legal: {
            color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 16,
            marginTop: Spacing.xl, marginHorizontal: Spacing.xs,
        },

        footer: {
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.md,
            backgroundColor: colors.bgSecondary,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        footerNotice: { marginBottom: Spacing.sm },
        trialButton: { marginTop: Spacing.sm },
        trialHint: { ...Type.caption, color: colors.textMuted, textAlign: 'center', marginTop: Spacing.xs },
    });
}
