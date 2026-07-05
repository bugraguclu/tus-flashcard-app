import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import { registerDialogHost, type DialogRequest } from '../lib/confirm';

/**
 * Web-only dialog surface for confirm()/alert(). React Native Web drops Alert.alert button
 * callbacks, so on web those helpers route here to render a Turkish-labelled, app-styled modal.
 * Native never registers a handler, so this renders nothing there.
 */
export function DialogHost() {
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

    return (
        <Modal transparent visible animationType="fade" onRequestClose={close}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Text style={styles.title}>{request.title}</Text>
                    <Text style={styles.message}>{request.message}</Text>
                    <View style={styles.actions}>
                        {isConfirm && (
                            <TouchableOpacity style={[styles.button, styles.cancel]} onPress={close}>
                                <Text style={styles.cancelText}>İptal</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.button, request.destructive ? styles.destructive : styles.accept]}
                            onPress={accept}
                        >
                            <Text style={styles.acceptText}>Tamam</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
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
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xxl,
    },
    title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
    message: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.xxl, lineHeight: 20 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md },
    button: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
    cancel: { backgroundColor: Colors.bgInput },
    cancelText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
    accept: { backgroundColor: Colors.accent },
    destructive: { backgroundColor: Colors.btnAgain },
    acceptText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.white },
});
