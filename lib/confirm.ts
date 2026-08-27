import { Alert, Platform } from 'react-native';
import { translateActive } from './i18n';
import { userFacingErrorMessage } from './userFacingError';

export interface ConfirmOptions {
    /** Style the confirm action as destructive (red) — for delete/overwrite actions. */
    destructive?: boolean;
}

/** A dialog request handed to the web DialogHost (see components/DialogHost.tsx). */
export interface DialogRequest {
    kind: 'confirm' | 'alert' | 'choice';
    title: string;
    message: string;
    destructive: boolean;
    acceptLabel?: string;
    cancelLabel?: string;
    /** Runs when the user confirms (confirm) or dismisses (alert). */
    onAccept?: () => void;
    /** Runs when the user selects the alternate action in a choice dialog. */
    onCancel?: () => void;
}

type DialogHandler = (request: DialogRequest) => void;
let webHandler: DialogHandler | null = null;

/**
 * Register the web dialog host. Native intentionally uses Apple's alert surface so dialogs can
 * appear safely above form sheets and nested modals.
 */
export function registerDialogHost(handler: DialogHandler): () => void {
    webHandler = handler;
    return () => {
        if (webHandler === handler) webHandler = null;
    };
}

/**
 * Cross-platform confirm dialog. Web uses the mounted app-styled host; iPhone uses the native,
 * accessible Apple alert surface. Both paths receive sanitized text.
 */
export function confirm(
    title: string,
    message: string,
    onConfirm: () => void,
    options: ConfirmOptions = {},
): void {
    const safeMessage = userFacingErrorMessage(message);
    if (webHandler) {
        webHandler({ kind: 'confirm', title, message: safeMessage, destructive: !!options.destructive, onAccept: onConfirm });
        return;
    }

    if (Platform.OS === 'web') {
        if (window.confirm(`${title}\n${safeMessage}`)) {
            onConfirm();
        }
        return;
    }

    Alert.alert(title, safeMessage, [
        { text: translateActive('common.cancel'), style: 'cancel' },
        { text: translateActive('common.ok'), style: options.destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
}

/** Cross-platform alert (info only, no yes/no). */
export function alert(title: string, message: string, onDismiss?: () => void): void {
    const safeMessage = userFacingErrorMessage(message);
    if (webHandler) {
        webHandler({ kind: 'alert', title, message: safeMessage, destructive: false, onAccept: onDismiss });
        return;
    }

    if (Platform.OS === 'web') {
        window.alert(`${title}\n${safeMessage}`);
        onDismiss?.();
        return;
    }

    Alert.alert(title, safeMessage, onDismiss ? [{ text: translateActive('common.ok'), onPress: onDismiss }] : undefined);
}

/**
 * Cross-platform two-action dialog with explicit labels. Returns true for the primary action.
 * Unlike confirm(), neither action is an implicit dismissal, so callers can model choices such
 * as Anki's Continue/Finish Timebox checkpoint without relabelling Cancel/OK.
 */
export function choose(
    title: string,
    message: string,
    primaryLabel: string,
    alternateLabel: string,
): Promise<boolean> {
    const safeMessage = userFacingErrorMessage(message);

    return new Promise((resolve) => {
        if (webHandler) {
            webHandler({
                kind: 'choice',
                title,
                message: safeMessage,
                destructive: false,
                acceptLabel: primaryLabel,
                cancelLabel: alternateLabel,
                onAccept: () => resolve(true),
                onCancel: () => resolve(false),
            });
            return;
        }

        if (Platform.OS === 'web') {
            resolve(window.confirm(`${title}\n${safeMessage}`));
            return;
        }

        Alert.alert(
            title,
            safeMessage,
            [
                { text: primaryLabel, onPress: () => resolve(true) },
                { text: alternateLabel, onPress: () => resolve(false) },
            ],
            { cancelable: false },
        );
    });
}
