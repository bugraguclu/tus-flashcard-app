import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
    /** Style the confirm action as destructive (red) — for delete/overwrite actions. */
    destructive?: boolean;
}

/** A dialog request handed to the web DialogHost (see components/DialogHost.tsx). */
export interface DialogRequest {
    kind: 'confirm' | 'alert';
    title: string;
    message: string;
    destructive: boolean;
    /** Runs when the user confirms (confirm) or dismisses (alert). */
    onAccept?: () => void;
}

type DialogHandler = (request: DialogRequest) => void;
let webHandler: DialogHandler | null = null;

/**
 * Register the web dialog host. Returns an unsubscribe function. Only the web build mounts a host;
 * native uses Alert.alert directly and never registers one.
 */
export function registerDialogHost(handler: DialogHandler): () => void {
    webHandler = handler;
    return () => {
        if (webHandler === handler) webHandler = null;
    };
}

/**
 * Cross-platform confirm dialog. Native uses Alert.alert; web routes through the mounted DialogHost
 * so the buttons carry the app's Turkish labels and styling, falling back to window.confirm when no
 * host is mounted (Alert.alert button callbacks don't fire on web).
 */
export function confirm(
    title: string,
    message: string,
    onConfirm: () => void,
    options: ConfirmOptions = {},
): void {
    if (Platform.OS === 'web') {
        if (webHandler) {
            webHandler({ kind: 'confirm', title, message, destructive: !!options.destructive, onAccept: onConfirm });
        } else if (window.confirm(`${title}\n${message}`)) {
            onConfirm();
        }
        return;
    }

    Alert.alert(title, message, [
        { text: 'İptal', style: 'cancel' },
        { text: 'Tamam', style: options.destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
}

/** Cross-platform alert (info only, no yes/no). */
export function alert(title: string, message: string, onDismiss?: () => void): void {
    if (Platform.OS === 'web') {
        if (webHandler) {
            webHandler({ kind: 'alert', title, message, destructive: false, onAccept: onDismiss });
        } else {
            window.alert(`${title}\n${message}`);
            onDismiss?.();
        }
        return;
    }

    Alert.alert(title, message, onDismiss ? [{ text: 'Tamam', onPress: onDismiss }] : undefined);
}
