import type { Dispatch, SetStateAction } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing } from '../../constants/theme';
import { CUSTOM_TOOLBAR_PRESETS, type CustomToolbarPreset, type LocalizedPresetText } from '../../lib/customToolbar';
import { AppDialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/Card';
import { Chip } from '../ui/Choice';
import { TextField } from '../ui/Fields';
import type { ToolbarButtonDraft } from './types';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';
import LockGlyph from '../LockGlyph';

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
    styles,
    l,
    t,
}: CustomToolbarEditorModalProps) {
    const presetText = (text: LocalizedPresetText) => l(text.tr, text.en);

    return (
        <AppDialog
            visible={visible}
            onClose={onClose}
            title={isEditingButton
                ? l('Araç çubuğu öğesini düzenle', 'Edit Toolbar Item')
                : l('Araç çubuğu öğesi oluştur', 'Create Toolbar Item')}
            message={l(
                'Seçili metnin önüne ve arkasına eklenecek HTML’yi girin. Bir öğeyi düzenlemek veya kaldırmak için öğeye basılı tutun.',
                'Enter HTML to be inserted before and after the selected text. Long press a toolbar item to edit or remove it.',
            )}
            actions={(
                <>
                    <Button variant="plain" label={l('Yardım', 'Help')} onPress={onShowHelp} />
                    {isEditingButton
                        ? <Button variant="plain" tone="danger" label={l('Sil', 'Delete')} onPress={onDelete} />
                        : <View style={local.actionSpacer} />}
                    <Button variant="plain" label={t('common.cancel')} onPress={onClose} />
                    <Button label={isEditingButton ? l('Kaydet', 'Save') : t('common.create')} onPress={onSave} />
                </>
            )}
        >
            {/* Quick Presets Carousel */}
            <View style={local.presets}>
                <SectionLabel>{l('Hızlı Şablonlar', 'Quick Presets')}</SectionLabel>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.customToolbarPresetScroll}
                >
                    {CUSTOM_TOOLBAR_PRESETS.map((preset) => (
                        <Chip key={preset.id} label={presetText(preset.label)} onPress={() => onApplyPreset(preset)} />
                    ))}
                </ScrollView>
            </View>

            <View>
                <TextField
                    value={draft.buttonText}
                    onChangeText={(buttonText) => onDraftChange((draft) => ({ ...draft, buttonText }))}
                    placeholder={l('Düğme metni', 'Button text')}
                    maxLength={16}
                />
                <TextField
                    style={styles.customToolbarInput}
                    value={draft.prefix}
                    onChangeText={(prefix) => onDraftChange((draft) => ({ ...draft, prefix }))}
                    placeholder={l('Seçimden önceki HTML', 'HTML before selection')}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <TextField
                    style={styles.customToolbarInput}
                    value={draft.suffix}
                    onChangeText={(suffix) => onDraftChange((draft) => ({ ...draft, suffix }))}
                    placeholder={l('Seçimden sonraki HTML', 'HTML after selection')}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

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
                <View style={local.securityRow}>
                    <LockGlyph color={styles.customToolbarSecurityNote.color} size={13} />
                    <Text style={[styles.customToolbarSecurityNote, local.securityNote]}>
                        {l('Güvenlik Korumalı: Komut dosyaları ve form etiketleri filtrelenir.', 'Security Protected: Scripts and forms are automatically filtered.')}
                    </Text>
                </View>
            </View>
        </AppDialog>
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
        <AppDialog
            visible={visible}
            onClose={onClose}
            title={l('Özel araç düğmeleri', 'Custom Toolbar Buttons')}
            message={l(
                'Düğmeye dokunulduğunda, seçili metin “önce” ve “sonra” alanlarındaki HTML ile sarılır. Metin seçili değilse imleç iki değer arasına yerleşir.',
                'When tapped, the selected text is wrapped with the HTML in the before and after fields. If no text is selected, the cursor is placed between them.',
            )}
            actions={<Button variant="plain" label={t('common.close')} onPress={onClose} />}
        >
            <ScrollView style={styles.customToolbarHelpScroll} showsVerticalScrollIndicator={false}>
                {CUSTOM_TOOLBAR_PRESETS.map((preset) => (
                    <View key={preset.id} style={styles.customToolbarTemplate}>
                        <View style={styles.customToolbarTemplateHeader}>
                            <Text style={styles.customToolbarTemplateTitle}>{presetText(preset.label)}</Text>
                            <Button
                                variant="plain"
                                size="compact"
                                label={l('Kullan', 'Use')}
                                onPress={() => onUseTemplate(preset)}
                                style={local.useButton}
                            />
                        </View>
                        <Text style={styles.customToolbarPresetDesc}>{presetText(preset.description)}</Text>
                        <Text style={styles.customToolbarCode}>{l('Düğme:', 'Button:')} {presetText(preset.buttonText)}</Text>
                        <Text style={styles.customToolbarCode}>{l('Önce:', 'Before:')} {preset.prefix}</Text>
                        <Text style={styles.customToolbarCode}>{l('Sonra:', 'After:')} {preset.suffix}</Text>
                    </View>
                ))}
            </ScrollView>
        </AppDialog>
    );
}

const local = StyleSheet.create({
    presets: { gap: Spacing.xs },
    actionSpacer: { flex: 1 },
    // A finger's height, without making each template's heading row that tall.
    useButton: { marginVertical: -Spacing.sm },
    securityRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    securityNote: { flex: 1 },
});
