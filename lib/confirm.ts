import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog.
 * On web, uses window.confirm (Alert.alert callbacks don't work on web).
 * On native, uses Alert.alert with cancel/confirm buttons.
 */
export function confirm(title: string, message: string, onConfirm: () => void): void {
    if (Platform.OS === 'web') {
        if (window.confirm(`${title}\n${message}`)) onConfirm();
    } else {
        Alert.alert(title, message, [
            { text: 'İptal', style: 'cancel' },
            { text: 'Tamam', onPress: onConfirm },
        ]);
    }
}

/**
 * Cross-platform alert (info only, no callbacks).
 */
export function alert(title: string, message: string, onDismiss?: () => void): void {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n${message}`);
        onDismiss?.();
    } else {
        Alert.alert(title, message, onDismiss ? [{ text: 'Tamam', onPress: onDismiss }] : undefined);
    }
}
