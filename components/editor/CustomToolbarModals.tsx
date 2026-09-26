import type { Dispatch, SetStateAction } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ColorScheme } from '../../constants/theme';
import { CUSTOM_TOOLBAR_PRESETS, type CustomToolbarPreset, type LocalizedPresetText } from '../../lib/customToolbar';
import type { ToolbarButtonDraft } from './types';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

interface CustomToolbarEditorModalProps extends EditorI18n {
    visible: boolean;
    isEditingButton: boolean;
    draft: ToolbarButtonDraft;
    onDraftChange: Dispatch<SetStateAction<ToolbarButtonDraft>>;
    onApplyPreset: (preset: CustomToolbarPreset) => void;
    onShowHelp: () => void;
    onDelete: () => void;
    onSave: () => void;
    onClose: () => void;
    colors: ColorScheme;
    styles: EditorStyles;
}

/** Creates or edits one of the user's own toolbar buttons: the HTML it wraps a selection in. */
export function CustomToolbarEditorModal({
    visible,
    isEditingButton,
    draft,
    onDraftChange,
    onApplyPreset,
    onShowHelp,
    onDelete,
    onSave,
    onClose,
    colors,
    styles,
    l,
    t,
}: CustomToolbarEditorModalProps) {
    const presetText = (text: LocalizedPresetText) => l(text.tr, text.en);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>
                        {isEditingButton
                            ? l('Araç çubuğu öğesini düzenle', 'Edit Toolbar Item')
                            : l('Araç çubuğu öğesi oluştur', 'Create Toolbar Item')}
                    </Text>
                    <Text style={styles.customToolbarExplanation}>
                        {l(
                            'Seçili metnin önüne ve arkasına eklenecek HTML’yi girin. Bir öğeyi düzenlemek veya kaldırmak için öğeye basılı tutun.',
                            'Enter HTML to be inserted before and after the selected text. Long press a toolbar item to edit or remove it.',
                        )}
                    </Text>

                    {/* Quick Presets Carousel */}
                    <View style={styles.customToolbarPresetSection}>
                        <Text style={styles.customToolbarSectionTitle}>{l('Hızlı Şablonlar', 'Quick Presets')}</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.customToolbarPresetScroll}
                        >
                            {CUSTOM_TOOLBAR_PRESETS.map((preset) => (
                                <TouchableOpacity
                                    key={preset.id}
                                    style={styles.customToolbarPresetChip}
                                    onPress={() => onApplyPreset(preset)}
                                    accessibilityRole="button"
                                    accessibilityLabel={presetText(preset.label)}
                                >
                                    <Text style={styles.customToolbarPresetChipText}>{presetText(preset.label)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <TextInput
                        style={styles.modalInput}
                        value={draft.buttonText}
                        onChangeText={(buttonText) => onDraftChange((draft) => ({ ...draft, buttonText }))}
                        placeholder={l('Düğme metni', 'Button text')}
                        placeholderTextColor={colors.textMuted}
                        maxLength={16}
                    />
                    <TextInput
                        style={[styles.modalInput, styles.customToolbarInput]}
                        value={draft.prefix}
                        onChangeText={(prefix) => onDraftChange((draft) => ({ ...draft, prefix }))}
                        placeholder={l('Seçimden önceki HTML', 'HTML before selection')}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TextInput
                        style={[styles.modalInput, styles.customToolbarInput]}
                        value={draft.suffix}
                        onChangeText={(suffix) => onDraftChange((draft) => ({ ...draft, suffix }))}
                        placeholder={l('Seçimden sonraki HTML', 'HTML after selection')}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    {/* Security notice & Live Preview Box */}
                    <View style={styles.customToolbarPreviewCard}>
                        <Text style={styles.customToolbarPreviewLabel}>{l('Önizleme:', 'Preview:')}</Text>
                        <View style={styles.customToolbarPreviewRow}>
                            <View style={styles.customToolbarButtonPreview}>
                                <Text style={styles.customToolbarButtonPreviewText} numberOfLines={1}>
                                    {draft.buttonText.trim() || '1'}
                                </Text>
                            </View>
                            <View style={styles.customToolbarHtmlPreview}>
                                <Text style={styles.customToolbarHtmlPreviewCode} numberOfLines={2}>
                                    {draft.prefix || ''}{l('Metin', 'Text')}{draft.suffix || ''}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.customToolbarSecurityNote}>
                            {l('🛡️ Güvenlik Korumalı: Komut dosyaları ve form etiketleri filtrelenir.', '🛡️ Security Protected: Scripts and forms are automatically filtered.')}
                        </Text>
                    </View>

                    <View style={styles.customToolbarActions}>
                        <TouchableOpacity style={styles.customToolbarTextAction} onPress={onShowHelp}>
                            <Text style={styles.customToolbarTextActionLabel}>{l('Yardım', 'Help')}</Text>
                        </TouchableOpacity>
                        {isEditingButton ? (
                            <TouchableOpacity style={styles.customToolbarTextAction} onPress={onDelete}>
                                <Text style={[styles.customToolbarTextActionLabel, styles.dangerText]}>{l('Sil', 'Delete')}</Text>
                            </TouchableOpacity>
                        ) : <View style={styles.customToolbarActionSpacer} />}
                        <TouchableOpacity style={styles.customToolbarTextAction} onPress={onClose}>
                            <Text style={styles.customToolbarTextActionLabel}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.customToolbarTextAction} onPress={onSave}>
                            <Text style={styles.customToolbarTextActionLabel}>
                                {isEditingButton ? l('Kaydet', 'Save') : t('common.create')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

interface CustomToolbarHelpModalProps extends EditorI18n {
    visible: boolean;
    onUseTemplate: (preset: CustomToolbarPreset) => void;
    onClose: () => void;
    styles: EditorStyles;
}

/** Explains custom buttons and offers the presets as ready-made templates. */
export function CustomToolbarHelpModal({ visible, onUseTemplate, onClose, styles, l, t }: CustomToolbarHelpModalProps) {
    const presetText = (text: LocalizedPresetText) => l(text.tr, text.en);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Özel araç düğmeleri', 'Custom Toolbar Buttons')}</Text>
                    <Text style={styles.customToolbarHelpText}>
                        {l(
                            'Düğmeye dokunulduğunda, seçili metin “önce” ve “sonra” alanlarındaki HTML ile sarılır. Metin seçili değilse imleç iki değer arasına yerleşir.',
                            'When tapped, the selected text is wrapped with the HTML in the before and after fields. If no text is selected, the cursor is placed between them.',
                        )}
                    </Text>
                    <ScrollView style={styles.customToolbarHelpScroll} showsVerticalScrollIndicator={false}>
                        {CUSTOM_TOOLBAR_PRESETS.map((preset) => (
                            <View key={preset.id} style={styles.customToolbarTemplate}>
                                <View style={styles.customToolbarTemplateHeader}>
                                    <Text style={styles.customToolbarTemplateTitle}>{presetText(preset.label)}</Text>
                                    <TouchableOpacity
                                        style={styles.customToolbarUseChip}
                                        onPress={() => onUseTemplate(preset)}
                                    >
                                        <Text style={styles.customToolbarUseChipText}>{l('Kullan', 'Use')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.customToolbarPresetDesc}>{presetText(preset.description)}</Text>
                                <Text style={styles.customToolbarCode}>{l('Düğme:', 'Button:')} {presetText(preset.buttonText)}</Text>
                                <Text style={styles.customToolbarCode}>{l('Önce:', 'Before:')} {preset.prefix}</Text>
                                <Text style={styles.customToolbarCode}>{l('Sonra:', 'After:')} {preset.suffix}</Text>
                            </View>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
