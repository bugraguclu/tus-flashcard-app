import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { registerDialogHost, type DialogRequest } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';

/**
 * Web-only dialog surface for confirm()/alert(). React Native Web drops Alert.alert button
 * callbacks, so on web those helpers route here to render a Turkish-labelled, app-styled modal.
 * Native never registers a handler, so this renders nothing there.
 */
export function DialogHost() {
    const { t } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [request, setRequest] = useState<DialogRequest | null>(null);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        return registerDialogHost(setRequest);
    }, []);

    if (!request) return null;

    const isConfirm = request.kind === 'confirm';
    const close = () => setRequest(null);
    const accept = () => {
        close();
        request.onAccept?.();
    };

    // Alerts have a single button, so dismissing (Escape / back) must still run the
    // callback — e.g. a success alert that navigates back. Confirms treat dismiss as cancel.
    return (
        <Modal transparent visible animationType="fade" onRequestClose={isConfirm ? close : accept}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Text style={styles.title}>{request.title}</Text>
                    <Text style={styles.message}>{request.message}</Text>
                    <View style={styles.actions}>
                        {isConfirm && (
                            <TouchableOpacity style={[styles.button, styles.cancel]} onPress={close}>
                                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.button, request.destructive ? styles.destructive : styles.accept]}
                            onPress={accept}
                        >
                            <Text style={styles.acceptText}>{t('common.ok')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
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
            padding: Spacing.xxl,
        },
        card: {
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.xxl,
        },
        title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.sm },
        message: { fontSize: FontSize.md, color: colors.textSecondary, marginBottom: Spacing.xxl, lineHeight: 20 },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md },
        button: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
        cancel: { backgroundColor: colors.bgInput },
        cancelText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textSecondary },
        accept: { backgroundColor: colors.accent },
        destructive: { backgroundColor: colors.btnAgain },
        acceptText: { fontSize: FontSize.md, fontWeight: '600', color: colors.white },
    });
}
