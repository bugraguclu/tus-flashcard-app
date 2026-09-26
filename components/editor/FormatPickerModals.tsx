import type { Dispatch, SetStateAction } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BorderRadius, type ColorScheme } from '../../constants/theme';
import {
    calloutHtml,
    EDITOR_CALLOUTS,
    EDITOR_FONT_FAMILIES,
    EDITOR_FONT_SIZES,
    EDITOR_LINE_SPACINGS,
    type EditorFontFamilyKey,
    type EditorFontSize,
    type EditorLineSpacing,
} from '../../lib/editorToolbar';
import type { EditorFormatState } from '../../lib/editorFormatState';
import type { RichTextCommand } from '../RichTextEditor';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

/** The props every formatting dialog shares: whether it is open, how it closes, how it looks. */
interface PickerBaseProps extends EditorI18n {
    visible: boolean;
    onClose: () => void;
    styles: EditorStyles;
}

/** The editor's default field text size, chosen from the overflow menu. */
export function EditorFontSizeModal({ visible, currentSize, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentSize: number;
    onChoose: (size: number) => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Yazı boyutu', 'Font Size')}</Text>
                    {[12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
                        <TouchableOpacity
                            key={size}
                            style={[styles.fontSizeOption, currentSize === size && styles.pickerOptionActive]}
                            onPress={() => onChoose(size)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: currentSize === size }}
                        >
                            <Text style={[styles.fontSizeSample, { fontSize: size }]}>{size}</Text>
                            {currentSize === size && <Text style={styles.pickerCheck}>✓</Text>}
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function TablePickerModal({ visible, onInsertTable, onClose, styles, l, t }: PickerBaseProps & {
    onInsertTable: (rows: number, columns: number) => void;
}) {
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
                    <Text style={styles.modalTitle}>{l('Tablo ekle', 'Insert Table')}</Text>
                    {[[2, 2], [3, 3], [3, 2], [4, 4]].map(([rows, columns]) => (
                        <TouchableOpacity
                            key={`${rows}x${columns}`}
                            style={styles.formatPickerOption}
                            onPress={() => onInsertTable(rows, columns)}
                            accessibilityRole="button"
                            accessibilityLabel={l(
                                `${rows} satır ${columns} sütun tablo`,
                                `${rows} by ${columns} table`,
                            )}
                        >
                            <Text style={styles.formatPickerOptionText}>{`${rows} × ${columns}`}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function CalloutPickerModal({ visible, onInsertCallout, onClose, styles, l, t }: PickerBaseProps & {
    onInsertCallout: (tone: Parameters<typeof calloutHtml>[0]) => void;
}) {
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
                    <Text style={styles.modalTitle}>{l('Bilgi kutusu ekle', 'Insert Callout')}</Text>
                    {EDITOR_CALLOUTS.map((tone) => (
                        <TouchableOpacity
                            key={tone.key}
                            style={[styles.formatPickerOption, styles.calloutOption, { borderLeftColor: tone.border }]}
                            onPress={() => onInsertCallout(tone.key)}
                            accessibilityRole="button"
                            accessibilityLabel={l(tone.tr, tone.en)}
                        >
                            <Text style={styles.formatPickerOptionText}>{l(tone.tr, tone.en)}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function LinkEditorModal({ visible, draft, onDraftChange, onConfirm, onClose, colors, styles, l, t }: PickerBaseProps & {
    draft: { url: string; label: string };
    onDraftChange: Dispatch<SetStateAction<{ url: string; label: string }>>;
    onConfirm: () => void;
    colors: ColorScheme;
}) {
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
                    <Text style={styles.modalTitle}>{l('Bağlantı ekle', 'Insert Link')}</Text>
                    <TextInput
                        style={styles.linkInput}
                        value={draft.url}
                        onChangeText={(url) => onDraftChange((draft) => ({ ...draft, url }))}
                        placeholder="https://docs.ankiweb.net"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        accessibilityLabel={l('Bağlantı adresi', 'Link address')}
                    />
                    <TextInput
                        style={styles.linkInput}
                        value={draft.label}
                        onChangeText={(label) => onDraftChange((draft) => ({ ...draft, label }))}
                        placeholder={l('Görünecek metin (isteğe bağlı)', 'Display text (optional)')}
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel={l('Bağlantı metni', 'Link text')}
                    />
                    <TouchableOpacity
                        style={styles.formatPickerOption}
                        onPress={onConfirm}
                        accessibilityRole="button"
                    >
                        <Text style={styles.formatPickerOptionText}>{l('Ekle', 'Insert')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

/** A size for the selected text, as opposed to the editor-wide default above. */
export function InlineFontSizePickerModal({ visible, currentSize, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentSize: EditorFormatState['fontSize'];
    onChoose: (size: EditorFontSize) => void;
}) {
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
                    <Text style={styles.modalTitle}>{l('Yazı boyutu', 'Font Size')}</Text>
                    {EDITOR_FONT_SIZES.map((size) => (
                        <TouchableOpacity
                            key={size}
                            style={styles.formatPickerOption}
                            accessibilityRole="button"
                            accessibilityState={{ selected: currentSize === size }}
                            onPress={() => onChoose(size)}
                        >
                            <Text style={styles.formatPickerOptionText}>{size}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function FontFamilyPickerModal({ visible, currentFamily, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentFamily: EditorFormatState['fontFamily'];
    onChoose: (family: EditorFontFamilyKey) => void;
}) {
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
                    <Text style={styles.modalTitle}>{l('Yazı tipi', 'Font')}</Text>
                    {EDITOR_FONT_FAMILIES.map((entry) => (
                        <TouchableOpacity
                            key={entry.key}
                            style={styles.formatPickerOption}
                            accessibilityRole="button"
                            accessibilityState={{ selected: currentFamily === entry.key }}
                            onPress={() => onChoose(entry.key)}
                        >
                            {/* Each row is drawn in its own face, the way Word's font list previews itself. */}
                            <Text
                                style={[
                                    styles.formatPickerOptionText,
                                    entry.css ? { fontFamily: entry.css.split(',')[0]!.trim().replace(/^["']|["']$/g, '') } : null,
                                ]}
                            >
                                {l(entry.tr, entry.en)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function LineSpacingPickerModal({ visible, currentSpacing, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentSpacing: EditorFormatState['lineSpacing'];
    onChoose: (spacing: EditorLineSpacing) => void;
}) {
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
                    <Text style={styles.modalTitle}>{l('Satır aralığı', 'Line spacing')}</Text>
                    {EDITOR_LINE_SPACINGS.map((spacing) => (
                        <TouchableOpacity
                            key={spacing}
                            style={styles.formatPickerOption}
                            accessibilityRole="button"
                            accessibilityState={{ selected: currentSpacing === spacing }}
                            onPress={() => onChoose(spacing)}
                        >
                            <Text style={styles.formatPickerOptionText}>{spacing.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function MathPickerModal({ visible, onWrap, onClose, styles, l, t }: PickerBaseProps & {
    onWrap: (prefix: string, suffix: string) => void;
}) {
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
                    <Text style={styles.modalTitle}>{l('MathJax ekle', 'Insert MathJax')}</Text>
                    <TouchableOpacity
                        style={styles.formatPickerOption}
                        onPress={() => onWrap('\\[', '\\]')}
                    >
                        <Text style={styles.formatPickerOptionText}>{l('Blok denklem', 'Block equation')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.formatPickerOption}
                        onPress={() => onWrap('\\( \\ce{', '} \\)')}
                    >
                        <Text style={styles.formatPickerOptionText}>{l('Kimya denklemi', 'Chemistry equation')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function ColorPickerModal({ visible, onCommand, onClose, colors, styles, l, t }: PickerBaseProps & {
    onCommand: (command: RichTextCommand, value?: string) => void;
    colors: ColorScheme;
}) {
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
                    <Text style={styles.modalTitle}>{l('Metin & Vurgu Rengi', 'Text & Highlight Color')}</Text>
                    <Text style={[styles.fieldName, { marginTop: 4 }]}>{l('Yazı rengi', 'Text color')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                        {[
                            { label: l('Kırmızı', 'Red'), color: '#ef4444' },
                            { label: l('Turuncu', 'Orange'), color: '#f97316' },
                            { label: l('Yeşil', 'Green'), color: '#16a34a' },
                            { label: l('Mavi', 'Blue'), color: '#3b82f6' },
                            { label: l('Mor', 'Purple'), color: '#a855f7' },
                            { label: l('Varsayılan', 'Default'), color: colors.textPrimary },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.color}
                                style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: BorderRadius.md,
                                    backgroundColor: colors.bgCard,
                                    borderWidth: 1.5,
                                    borderColor: item.color,
                                }}
                                onPress={() => onCommand('foreColor', item.color)}
                            >
                                <Text style={{ color: item.color, fontWeight: '600' }}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={[styles.fieldName, { marginTop: 8 }]}>{l('Vurgu rengi', 'Highlight color')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                        {[
                            { label: l('Sarı', 'Yellow'), bg: '#fef08a' },
                            { label: l('Yeşil', 'Green'), bg: '#bbf7d0' },
                            { label: l('Mavi', 'Blue'), bg: '#bfdbfe' },
                            { label: l('Pembe', 'Pink'), bg: '#fbcfe8' },
                            { label: l('Turuncu', 'Orange'), bg: '#fed7aa' },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.bg}
                                style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: BorderRadius.md,
                                    backgroundColor: item.bg,
                                }}
                                onPress={() => onCommand('hiliteColor', item.bg)}
                            >
                                <Text style={{ color: '#1f2937', fontWeight: '600' }}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TouchableOpacity
                        style={[styles.formatPickerOption, { marginTop: 8 }]}
                        onPress={() => onCommand('removeFormat')}
                    >
                        <Text style={styles.formatPickerOptionText}>{l('Biçimlendirmeyi temizle', 'Clear formatting')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

/** The active field's raw HTML; the screen sanitizes it before it is written back. */
export function HtmlSourceModal({ visible, value, onChangeValue, onSave, onClose, styles, l, t }: PickerBaseProps & {
    value: string;
    onChangeValue: (value: string) => void;
    onSave: () => void;
}) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('HTML Kaynağını Düzenle', 'Edit HTML Source')}</Text>
                    <Text style={styles.customToolbarExplanation}>
                        {l('Alanın ham HTML içeriğini doğrudan düzenleyin. Kaydedildiğinde güvenlik doğrulaması uygulanır.', 'Edit raw HTML content directly. Sanitization is applied upon saving.')}
                    </Text>
                    <TextInput
                        style={[styles.modalInput, { minHeight: 140, maxHeight: 260, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }]}
                        value={value}
                        onChangeText={onChangeValue}
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <View style={styles.customToolbarActions}>
                        <TouchableOpacity style={styles.customToolbarTextAction} onPress={onClose}>
                            <Text style={styles.customToolbarTextActionLabel}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.customToolbarTextAction}
                            onPress={onSave}
                        >
                            <Text style={styles.customToolbarTextActionLabel}>{t('common.save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
