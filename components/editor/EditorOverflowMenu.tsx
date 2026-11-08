import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { MenuItem, MenuSeparator, PopoverMenu } from '../ui/Menu';
import type { EditorPreferences } from './types';
import type { EditorI18n } from './types';

interface EditorOverflowMenuProps extends Pick<EditorI18n, 'l'> {
    visible: boolean;
    isCatalog: boolean;
    contentReadOnly: boolean;
    isEditing: boolean;
    preferences: EditorPreferences;
    onUpdatePreferences: (patch: Partial<EditorPreferences>) => void;
    onClearFields: () => void;
    onDeleteNote: () => void;
    /** Opens the font size dialog; called once this menu has gone. */
    onOpenFontSize: () => void;
    onClose: () => void;
}

// How long iOS gets to report the menu gone before the next dialog opens anyway.
const DISMISS_FALLBACK_MS = 450;

/** The header's ⋮ menu: note actions first, then the editor's own preferences. */
export function EditorOverflowMenu({
    visible,
    isCatalog,
    contentReadOnly,
    isEditing,
    preferences,
    onUpdatePreferences,
    onClearFields,
    onDeleteNote,
    onOpenFontSize,
    onClose,
    l,
}: EditorOverflowMenuProps) {
    // iOS presents one modal at a time: a dialog opened while this menu is still fading out would
    // not appear, so it waits for the menu's dismissal.
    const pendingRef = useRef<(() => void) | null>(null);
    const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const runPending = () => {
        if (fallbackRef.current) {
            clearTimeout(fallbackRef.current);
            fallbackRef.current = null;
        }
        const action = pendingRef.current;
        pendingRef.current = null;
        action?.();
    };
    useEffect(() => () => {
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
    }, []);
    const openAfterClose = (action: () => void) => {
        onClose();
        if (Platform.OS !== 'ios') {
            action();
            return;
        }
        pendingRef.current = action;
        fallbackRef.current = setTimeout(runPending, DISMISS_FALLBACK_MS);
    };

    return (
        <PopoverMenu
            visible={visible}
            onClose={onClose}
            onDismiss={runPending}
            accessibilityLabel={l('Diğer seçenekler', 'More options')}
        >
            {!contentReadOnly && (
                <MenuItem label={l('Alanları temizle', 'Clear fields')} onPress={onClearFields} />
            )}
            {!isCatalog && isEditing && (
                <MenuItem label={l('Notu sil', 'Delete note')} destructive onPress={onDeleteNote} />
            )}
            {!contentReadOnly && <MenuSeparator />}
            <MenuItem
                label={l('Yazı boyutu', 'Font size')}
                hint={String(preferences.fontSize)}
                onPress={() => openAfterClose(onOpenFontSize)}
            />
            <MenuItem
                label={l('Cümleleri büyük harfle başlat', 'Capitalize sentences')}
                checked={preferences.capitalizeSentences}
                onPress={() => onUpdatePreferences({ capitalizeSentences: !preferences.capitalizeSentences })}
            />
            {!contentReadOnly && (
                <MenuItem
                    label={l('Araç çubuğunu göster', 'Show toolbar')}
                    checked={preferences.toolbarVisible}
                    onPress={() => onUpdatePreferences({ toolbarVisible: !preferences.toolbarVisible })}
                />
            )}
            {!contentReadOnly && (
                <MenuItem
                    label={l('Araç çubuğunu kaydır', 'Scroll toolbar')}
                    checked={preferences.toolbarScrollable}
                    disabled={!preferences.toolbarVisible}
                    onPress={() => onUpdatePreferences({ toolbarScrollable: !preferences.toolbarScrollable })}
                />
            )}
        </PopoverMenu>
    );
}
