import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { registerDialogHost, type DialogRequest } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';

/**
 * Web dialog surface for confirm()/alert()/choose(). iPhone keeps the native Apple alert surface
 * so dialogs can safely appear above routed sheets and nested modals; all text is sanitized.
 */
export function DialogHost() {
    const { t } = useI18n();
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [request, setRequest] = useState<DialogRequest | null>(null);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        return registerDialogHost(setRequest);
    }, []);

    if (!request) return null;

    const isConfirm = request.kind === 'confirm';
    const isChoice = request.kind === 'choice';
    const close = () => setRequest(null);
    const accept = () => {
        close();
        request.onAccept?.();
    };
    const cancel = () => {
        close();
        request.onCancel?.();
    };
    const dismiss = isChoice ? undefined : isConfirm ? close : accept;
    const icon = request.destructive ? '!' : isConfirm ? '?' : 'i';

    // Alerts have a single button, so dismissing (Escape / back) must still run the
    // callback — e.g. a success alert that navigates back. Confirms treat dismiss as cancel.
    return (
        <Modal
            transparent
            visible
            animationType="fade"
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={dismiss ?? (() => undefined)}
        >
            <Pressable
                style={[styles.backdrop, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}
                onPress={dismiss}
            >
                <Pressable
                    style={styles.card}
                    onPress={(event) => event.stopPropagation()}
                    accessibilityViewIsModal
                    accessibilityRole="alert"
                >
                    <View style={[styles.iconCircle, request.destructive && styles.iconCircleDestructive]}>
                        <Text style={[styles.iconText, request.destructive && styles.iconTextDestructive]}>{icon}</Text>
                    </View>
                    <Text style={styles.title}>{request.title}</Text>
                    <ScrollView
                        style={styles.messageScroll}
                        contentContainerStyle={styles.messageContent}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                    >
                        <Text style={styles.message}>{request.message}</Text>
                    </ScrollView>
                    <View style={styles.actions}>
                        {(isConfirm || isChoice) && (
                            <Pressable
                                style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.buttonPressed]}
                                onPress={isChoice ? cancel : close}
                                accessibilityRole="button"
                            >
                                <Text style={styles.cancelText}>{request.cancelLabel ?? t('common.cancel')}</Text>
                            </Pressable>
                        )}
                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                request.destructive ? styles.destructive : styles.accept,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={accept}
                            accessibilityRole="button"
                        >
                            <Text style={styles.acceptText}>{request.acceptLabel ?? t('common.ok')}</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: Spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.xl,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderLight,
            padding: Spacing.xxl,
            alignItems: 'center',
            ...Shadows.lg,
        },
        iconCircle: {
            width: 44,
            height: 44,
            borderRadius: BorderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
            marginBottom: Spacing.lg,
        },
        iconCircleDestructive: { backgroundColor: colors.btnAgainBg },
        iconText: { fontSize: FontSize.xl, fontWeight: '800', color: colors.accent },
        iconTextDestructive: { color: colors.btnAgain },
        title: {
            fontSize: FontSize.xl,
            fontWeight: '700',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: Spacing.sm,
        },
        messageScroll: { maxHeight: 220, alignSelf: 'stretch' },
        messageContent: { paddingBottom: Spacing.xl },
        message: { fontSize: FontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
        actions: { flexDirection: 'row', alignSelf: 'stretch', gap: Spacing.md },
        button: {
            flex: 1,
            minHeight: 48,
            paddingHorizontal: Spacing.xl,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        buttonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
        cancel: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.borderLight },
        cancelText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textSecondary },
        accept: { backgroundColor: colors.accent },
        destructive: { backgroundColor: colors.btnAgain },
        acceptText: { fontSize: FontSize.md, fontWeight: '600', color: colors.white },
    });
}
