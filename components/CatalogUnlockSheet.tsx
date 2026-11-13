import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Spacing, useThemeColors } from '../constants/theme';
import { useCatalogStatus } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { BKA_CATALOG_DEFAULT_ROOT_DECK, getBkaCatalogRootDeckName } from '../lib/bkaCatalog';
import { BKA_MANIFEST } from '../lib/bkaManifest';
import { readOnlyTabMessage } from '../lib/db';
import { formatCount } from '../lib/i18n';
import { Button } from './ui/Button';
import { Notice } from './ui/Feedback';
import { AppSheet } from './ui/Sheet';
import { Radius, Type } from './ui/tokens';
import { UnlockGlyph } from './UiGlyphs';

type Props = {
    visible: boolean;
    onClose: () => void;
    onUnlocked: (rootDeckName: string) => void;
};

/** Unlock the optional catalog without navigating away from the workflow that launched it. */
export default function CatalogUnlockSheet({ visible, onClose, onUnlocked }: Props) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { purchaseCatalog, catalogInstalling } = useCatalogStatus();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setSubmitting(false);
        setError(null);
    }, [visible]);

    const unlock = async () => {
        if (submitting || catalogInstalling) return;
        const readOnly = readOnlyTabMessage();
        if (readOnly) {
            setError(readOnly);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await purchaseCatalog();
            if (result.cancelled) return;
            if (!result.hasAccess) {
                setError(l(
                    'Kartlar açılamadı. Lütfen yeniden deneyin.',
                    'The cards could not be unlocked. Please try again.',
                ));
                return;
            }
            onUnlocked(getBkaCatalogRootDeckName());
        } catch (purchaseError) {
            console.warn('[CatalogUnlockSheet] unlock failed:', purchaseError);
            setError(l(
                'Kartlar açılamadı. Lütfen yeniden deneyin.',
                'The cards could not be unlocked. Please try again.',
            ));
        } finally {
            setSubmitting(false);
        }
    };

    const busy = submitting || catalogInstalling;

    return (
        <AppSheet
            visible={visible}
            // While the pack installs the sheet stays: its backdrop, grabber and back action wait.
            onClose={busy ? () => undefined : onClose}
            swipeEnabled={!busy}
        >
            <View style={styles.content}>
                <View style={styles.iconWrap}>
                    <UnlockGlyph color={colors.accent} size={26} />
                </View>
                <Text style={[Type.title, styles.title]} accessibilityRole="header">{BKA_CATALOG_DEFAULT_ROOT_DECK}</Text>
                <Text style={[Type.body, styles.description]}>
                    {l(
                        `${formatCount(BKA_MANIFEST.totals.cards, 'tr')} kartın tamamını ücretsiz açın. Çalışma ekranından ayrılmadan paket kurulacak ve bu deste seçilecek.`,
                        `Unlock all ${formatCount(BKA_MANIFEST.totals.cards, locale)} cards for free. The pack will be installed and selected without leaving the study screen.`,
                    )}
                </Text>
                {error ? <Notice tone="danger" style={styles.error}>{error}</Notice> : null}
                <Button
                    label={l('Ücretsiz aç', 'Unlock free')}
                    accessibilityLabel={l('TUS Kartlarını ücretsiz aç', 'Unlock TUS Cards for free')}
                    onPress={() => { void unlock(); }}
                    busy={busy}
                    style={styles.primaryButton}
                />
                <Button
                    label={l('Vazgeç', 'Cancel')}
                    variant="plain"
                    tone="muted"
                    onPress={onClose}
                    disabled={busy}
                />
            </View>
        </AppSheet>
    );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
    return StyleSheet.create({
        content: {
            alignItems: 'center',
            paddingHorizontal: Spacing.xs,
            paddingBottom: Spacing.sm,
        },
        iconWrap: {
            width: 54,
            height: 54,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
            marginBottom: Spacing.md,
        },
        title: { color: colors.textPrimary, textAlign: 'center' },
        description: {
            color: colors.textSecondary,
            lineHeight: 22,
            textAlign: 'center',
            marginTop: Spacing.sm,
            maxWidth: 430,
        },
        error: { alignSelf: 'stretch', marginTop: Spacing.md },
        primaryButton: { alignSelf: 'stretch', marginTop: Spacing.xl, marginBottom: Spacing.sm },
    });
}
