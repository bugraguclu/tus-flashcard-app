import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../constants/theme';
import { useApp } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { BKA_CATALOG_DEFAULT_ROOT_DECK, getBkaCatalogRootDeckName } from '../lib/bkaCatalog';
import { BKA_MANIFEST } from '../lib/bkaManifest';
import { formatCount } from '../lib/i18n';
import SwipeDismissSheet from './SwipeDismissSheet';

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
    const { purchaseCatalog, catalogInstalling } = useApp();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setSubmitting(false);
        setError(null);
    }, [visible]);

    const unlock = async () => {
        if (submitting || catalogInstalling) return;
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
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={busy ? undefined : onClose}
        >
            <Pressable style={styles.overlay} onPress={busy ? undefined : onClose}>
                <Pressable style={styles.sheetHitTarget} onPress={() => {}}>
                    <SwipeDismissSheet
                        active={visible}
                        enabled={!busy}
                        onDismiss={onClose}
                        accessibilityViewIsModal
                        style={styles.sheet}
                    >
                        <View style={styles.iconWrap}>
                            <Text style={styles.icon}>🔓</Text>
                        </View>
                        <Text style={styles.title}>{BKA_CATALOG_DEFAULT_ROOT_DECK}</Text>
                        <Text style={styles.description}>
                            {l(
                                `${formatCount(BKA_MANIFEST.totals.cards, 'tr')} kartın tamamını ücretsiz açın. Çalışma ekranından ayrılmadan paket kurulacak ve bu deste seçilecek.`,
                                `Unlock all ${formatCount(BKA_MANIFEST.totals.cards, locale)} cards for free. The pack will be installed and selected without leaving the study screen.`,
                            )}
                        </Text>
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <TouchableOpacity
                            style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
                            onPress={() => { void unlock(); }}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel={l('TUS Kartlarını ücretsiz aç', 'Unlock TUS Cards for free')}
                        >
                            {busy ? (
                                <ActivityIndicator color={colors.white} />
                            ) : (
                                <Text style={styles.primaryButtonText}>{l('Ücretsiz aç', 'Unlock free')}</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onClose}
                            disabled={busy}
                            accessibilityRole="button"
                        >
                            <Text style={styles.cancelButtonText}>{l('Vazgeç', 'Cancel')}</Text>
                        </TouchableOpacity>
                    </SwipeDismissSheet>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.46)',
        },
        sheetHitTarget: { width: '100%' },
        sheet: {
            paddingTop: 48,
            paddingHorizontal: Spacing.xl,
            paddingBottom: Spacing.xxl,
            borderTopLeftRadius: BorderRadius.xl,
            borderTopRightRadius: BorderRadius.xl,
            backgroundColor: colors.bgSecondary,
            alignItems: 'center',
            ...Shadows.lg,
        },
        iconWrap: {
            width: 54,
            height: 54,
            borderRadius: 27,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
            marginBottom: Spacing.md,
        },
        icon: { fontSize: 26 },
        title: {
            color: colors.textPrimary,
            fontSize: FontSize.xl,
            fontWeight: '800',
            textAlign: 'center',
        },
        description: {
            color: colors.textSecondary,
            fontSize: FontSize.md,
            lineHeight: 22,
            textAlign: 'center',
            marginTop: Spacing.sm,
            maxWidth: 430,
        },
        error: {
            color: colors.btnAgain,
            fontSize: FontSize.sm,
            textAlign: 'center',
            marginTop: Spacing.md,
        },
        primaryButton: {
            width: '100%',
            minHeight: 50,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
            marginTop: Spacing.xl,
        },
        primaryButtonDisabled: { opacity: 0.65 },
        primaryButtonText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        cancelButton: {
            minHeight: 44,
            paddingHorizontal: Spacing.xl,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: Spacing.sm,
        },
        cancelButtonText: { color: colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
    });
}
