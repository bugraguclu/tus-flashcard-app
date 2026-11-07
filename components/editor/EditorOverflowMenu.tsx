import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { PopoverBackdrop, PopoverItem, PopoverPresence } from '../Popover';
import { EDITOR_HEADER_HEIGHT } from './editorStyles';
import type { EditorPreferences } from './types';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

interface EditorOverflowMenuProps extends Pick<EditorI18n, 'l'> {
    /** Keep the menu mounted and drive it with this, so it can shrink back into ••• as it closes. */
    visible?: boolean;
    topInset: number;
    isCatalog: boolean;
    contentReadOnly: boolean;
    isEditing: boolean;
    preferences: EditorPreferences;
    onUpdatePreferences: (patch: Partial<EditorPreferences>) => void;
    onClearFields: () => void;
    onDeleteNote: () => void;
    onOpenFontSize: () => void;
    onClose: () => void;
    styles: EditorStyles;
}

/**
 * The header's ••• menu: note actions first, then the editor's own preferences. It grows out of
 * ••• at the top right corner and shrinks back into it.
 */
export function EditorOverflowMenu({
    visible = true,
    topInset,
    isCatalog,
    contentReadOnly,
    isEditing,
    preferences,
    onUpdatePreferences,
    onClearFields,
    onDeleteNote,
    onOpenFontSize,
    onClose,
    styles,
    l,
}: EditorOverflowMenuProps) {
    return (
        <PopoverPresence visible={visible}>
            {/* A menu on its way out lets the editor under it take touches again. */}
            <View style={[styles.overflowOverlay, { paddingTop: topInset + EDITOR_HEADER_HEIGHT, pointerEvents: visible ? 'auto' : 'none' }]}>
                <PopoverBackdrop
                    style={[StyleSheet.absoluteFill, styles.overflowBackdrop]}
                    onPress={onClose}
                    accessibilityLabel={l('Seçenekler menüsünü kapat', 'Close options menu')}
                />
                <PopoverItem origin="top right" style={styles.overflowMenu} accessibilityViewIsModal>
                    {!contentReadOnly && (
                        <TouchableOpacity
                            style={styles.overflowItem}
                            onPress={onClearFields}
                            accessibilityRole="button"
                        >
                            <Text style={styles.overflowItemText}>{l('Alanları temizle', 'Clear fields')}</Text>
                        </TouchableOpacity>
                    )}
                    {!isCatalog && isEditing && (
                        <TouchableOpacity
                            style={styles.overflowItem}
                            onPress={onDeleteNote}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.overflowItemText, styles.dangerText]}>{l('Notu sil', 'Delete note')}</Text>
                        </TouchableOpacity>
                    )}
                    {!contentReadOnly && <View style={styles.overflowSeparator} />}
                    <TouchableOpacity
                        style={styles.overflowItem}
                        onPress={onOpenFontSize}
                    >
                        <Text style={styles.overflowItemText}>{l('Yazı boyutu', 'Font size')}</Text>
                        <Text style={styles.overflowItemValue}>{preferences.fontSize}</Text>
                        <Text style={styles.overflowChevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.overflowItem}
                        onPress={() => onUpdatePreferences({ capitalizeSentences: !preferences.capitalizeSentences })}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: preferences.capitalizeSentences }}
                        aria-checked={preferences.capitalizeSentences}
                    >
                        <Text style={styles.overflowItemText}>{l('Cümleleri büyük harfle başlat', 'Capitalize sentences')}</Text>
                        <View style={[styles.overflowCheckbox, preferences.capitalizeSentences && styles.overflowCheckboxChecked]}>
                            {preferences.capitalizeSentences && <Text style={styles.overflowCheckboxMark}>✓</Text>}
                        </View>
                    </TouchableOpacity>
                    {!contentReadOnly && (
                        <TouchableOpacity
                            style={styles.overflowItem}
                            onPress={() => onUpdatePreferences({ toolbarVisible: !preferences.toolbarVisible })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: preferences.toolbarVisible }}
                            aria-checked={preferences.toolbarVisible}
                        >
                            <Text style={styles.overflowItemText}>{l('Araç çubuğunu göster', 'Show toolbar')}</Text>
                            <View style={[styles.overflowCheckbox, preferences.toolbarVisible && styles.overflowCheckboxChecked]}>
                                {preferences.toolbarVisible && <Text style={styles.overflowCheckboxMark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                    )}
                    {!contentReadOnly && (
                        <TouchableOpacity
                            style={[styles.overflowItem, !preferences.toolbarVisible && styles.overflowItemDisabled]}
                            disabled={!preferences.toolbarVisible}
                            onPress={() => onUpdatePreferences({ toolbarScrollable: !preferences.toolbarScrollable })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: preferences.toolbarScrollable, disabled: !preferences.toolbarVisible }}
                            aria-checked={preferences.toolbarScrollable}
                        >
                            <Text style={styles.overflowItemText}>{l('Araç çubuğunu kaydır', 'Scroll toolbar')}</Text>
                            <View style={[styles.overflowCheckbox, preferences.toolbarScrollable && styles.overflowCheckboxChecked]}>
                                {preferences.toolbarScrollable && <Text style={styles.overflowCheckboxMark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                    )}
                </PopoverItem>
            </View>
        </PopoverPresence>
    );
}
