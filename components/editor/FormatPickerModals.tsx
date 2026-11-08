import type { Dispatch, SetStateAction } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, type ColorScheme } from '../../constants/theme';
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
import { AppDialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { SelectedMark } from '../ui/Choice';
import { TextField } from '../ui/Fields';
import { Radius } from '../ui/tokens';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

/** The props every formatting dialog shares: whether it is open, how it closes, how it looks. */
interface PickerBaseProps extends EditorI18n {
    visible: boolean;
    onClose: () => void;
    styles: EditorStyles;
}

/** The Cancel every picker ends with. */
function cancelAction(t: EditorI18n['t'], onClose: () => void) {
    return <Button variant="plain" label={t('common.cancel')} onPress={onClose} />;
}

/** One option of a picker; the chosen one is tinted and ends in a tick. */
function PickerOption({ styles, label, labelStyle, selected, onPress, accessibilityRole = 'button', accessibilityLabel, extraStyle }: {
    styles: EditorStyles;
    label: string;
    labelStyle?: object | null;
    /** Left out for a list without a current value, such as the table sizes. */
    selected?: boolean;
    onPress: () => void;
    accessibilityRole?: 'button' | 'radio';
    accessibilityLabel?: string;
    extraStyle?: object;
}) {
    return (
        <TouchableOpacity
            style={[styles.formatPickerOption, local.option, selected && styles.pickerOptionActive, extraStyle]}
            onPress={onPress}
            accessibilityRole={accessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={selected === undefined ? undefined : { selected }}
            aria-checked={accessibilityRole === 'radio' ? selected : undefined}
        >
            <Text style={[styles.formatPickerOptionText, local.optionText, labelStyle]}>{label}</Text>
            {selected !== undefined ? <SelectedMark visible={selected} /> : null}
        </TouchableOpacity>
    );
}

/** The editor's default field text size, chosen from the overflow menu. */
export function EditorFontSizeModal({ visible, currentSize, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentSize: number;
    onChoose: (size: number) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Yazı boyutu', 'Font Size')} actions={cancelAction(t, onClose)}>
            <View>
                {[12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
                    <PickerOption
                        key={size}
                        styles={styles}
                        label={String(size)}
                        labelStyle={[styles.fontSizeSample, { fontSize: size }]}
                        selected={currentSize === size}
                        onPress={() => onChoose(size)}
                        accessibilityRole="radio"
                    />
                ))}
            </View>
        </AppDialog>
    );
}

export function TablePickerModal({ visible, onInsertTable, onClose, styles, l, t }: PickerBaseProps & {
    onInsertTable: (rows: number, columns: number) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Tablo ekle', 'Insert Table')} actions={cancelAction(t, onClose)}>
            <View>
                {[[2, 2], [3, 3], [3, 2], [4, 4]].map(([rows, columns]) => (
                    <PickerOption
                        key={`${rows}x${columns}`}
                        styles={styles}
                        label={`${rows} × ${columns}`}
                        onPress={() => onInsertTable(rows, columns)}
                        accessibilityLabel={l(
                            `${rows} satır ${columns} sütun tablo`,
                            `${rows} by ${columns} table`,
                        )}
                    />
                ))}
            </View>
        </AppDialog>
    );
}

export function CalloutPickerModal({ visible, onInsertCallout, onClose, styles, l, t }: PickerBaseProps & {
    onInsertCallout: (tone: Parameters<typeof calloutHtml>[0]) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Bilgi kutusu ekle', 'Insert Callout')} actions={cancelAction(t, onClose)}>
            <View>
                {EDITOR_CALLOUTS.map((tone) => (
                    <PickerOption
                        key={tone.key}
                        styles={styles}
                        label={l(tone.tr, tone.en)}
                        // The tone's own border colour is the card content the callout inserts.
                        extraStyle={[styles.calloutOption, { borderLeftColor: tone.border }]}
                        onPress={() => onInsertCallout(tone.key)}
                        accessibilityLabel={l(tone.tr, tone.en)}
                    />
                ))}
            </View>
        </AppDialog>
    );
}

export function LinkEditorModal({ visible, draft, onDraftChange, onConfirm, onClose, styles, l, t }: PickerBaseProps & {
    draft: { url: string; label: string };
    onDraftChange: Dispatch<SetStateAction<{ url: string; label: string }>>;
    onConfirm: () => void;
    colors: ColorScheme;
}) {
    return (
        <AppDialog
            visible={visible}
            onClose={onClose}
            title={l('Bağlantı ekle', 'Insert Link')}
            actions={(
                <>
                    {cancelAction(t, onClose)}
                    <Button label={l('Ekle', 'Insert')} onPress={onConfirm} />
                </>
            )}
        >
            <TextField
                value={draft.url}
                onChangeText={(url) => onDraftChange((draft) => ({ ...draft, url }))}
                placeholder="https://docs.ankiweb.net"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel={l('Bağlantı adresi', 'Link address')}
            />
            <TextField
                value={draft.label}
                onChangeText={(label) => onDraftChange((draft) => ({ ...draft, label }))}
                placeholder={l('Görünecek metin (isteğe bağlı)', 'Display text (optional)')}
                accessibilityLabel={l('Bağlantı metni', 'Link text')}
            />
        </AppDialog>
    );
}

/** A size for the selected text, as opposed to the editor-wide default above. */
export function InlineFontSizePickerModal({ visible, currentSize, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentSize: EditorFormatState['fontSize'];
    onChoose: (size: EditorFontSize) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Yazı boyutu', 'Font Size')} actions={cancelAction(t, onClose)}>
            <View>
                {EDITOR_FONT_SIZES.map((size) => (
                    <PickerOption key={size} styles={styles} label={size} selected={currentSize === size} onPress={() => onChoose(size)} />
                ))}
            </View>
        </AppDialog>
    );
}

export function FontFamilyPickerModal({ visible, currentFamily, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentFamily: EditorFormatState['fontFamily'];
    onChoose: (family: EditorFontFamilyKey) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Yazı tipi', 'Font')} actions={cancelAction(t, onClose)}>
            <View>
                {EDITOR_FONT_FAMILIES.map((entry) => (
                    <PickerOption
                        key={entry.key}
                        styles={styles}
                        label={l(entry.tr, entry.en)}
                        // Each row is drawn in its own face, the way Word's font list previews itself.
                        labelStyle={entry.css ? { fontFamily: entry.css.split(',')[0]!.trim().replace(/^["']|["']$/g, '') } : null}
                        selected={currentFamily === entry.key}
                        onPress={() => onChoose(entry.key)}
                    />
                ))}
            </View>
        </AppDialog>
    );
}

export function LineSpacingPickerModal({ visible, currentSpacing, onChoose, onClose, styles, l, t }: PickerBaseProps & {
    currentSpacing: EditorFormatState['lineSpacing'];
    onChoose: (spacing: EditorLineSpacing) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Satır aralığı', 'Line spacing')} actions={cancelAction(t, onClose)}>
            <View>
                {EDITOR_LINE_SPACINGS.map((spacing) => (
                    <PickerOption
                        key={spacing}
                        styles={styles}
                        label={spacing.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}
                        selected={currentSpacing === spacing}
                        onPress={() => onChoose(spacing)}
                    />
                ))}
            </View>
        </AppDialog>
    );
}

export function MathPickerModal({ visible, onWrap, onClose, styles, l, t }: PickerBaseProps & {
    onWrap: (prefix: string, suffix: string) => void;
}) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('MathJax ekle', 'Insert MathJax')} actions={cancelAction(t, onClose)}>
            <View>
                <PickerOption styles={styles} label={l('Blok denklem', 'Block equation')} onPress={() => onWrap('\\[', '\\]')} />
                <PickerOption styles={styles} label={l('Kimya denklemi', 'Chemistry equation')} onPress={() => onWrap('\\( \\ce{', '} \\)')} />
            </View>
        </AppDialog>
    );
}

export function ColorPickerModal({ visible, onCommand, onClose, colors, styles, l, t }: PickerBaseProps & {
    onCommand: (command: RichTextCommand, value?: string) => void;
    colors: ColorScheme;
}) {
    // The swatches are the ink and highlight colours written into the note, so they keep their
    // own values in both themes; only "Default" follows the theme's text colour.
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Metin & Vurgu Rengi', 'Text & Highlight Color')} actions={cancelAction(t, onClose)}>
            <View style={local.swatchGroup}>
                <Text style={styles.fieldName}>{l('Yazı rengi', 'Text color')}</Text>
                <View style={local.swatches}>
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
                            style={[local.swatch, { backgroundColor: colors.bgCard, borderWidth: 1.5, borderColor: item.color }]}
                            onPress={() => onCommand('foreColor', item.color)}
                            hitSlop={SWATCH_SLOP}
                            accessibilityRole="button"
                        >
                            <Text style={[local.swatchText, { color: item.color }]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
            <View style={local.swatchGroup}>
                <Text style={styles.fieldName}>{l('Vurgu rengi', 'Highlight color')}</Text>
                <View style={local.swatches}>
                    {[
                        { label: l('Sarı', 'Yellow'), bg: '#fef08a' },
                        { label: l('Yeşil', 'Green'), bg: '#bbf7d0' },
                        { label: l('Mavi', 'Blue'), bg: '#bfdbfe' },
                        { label: l('Pembe', 'Pink'), bg: '#fbcfe8' },
                        { label: l('Turuncu', 'Orange'), bg: '#fed7aa' },
                    ].map((item) => (
                        <TouchableOpacity
                            key={item.bg}
                            style={[local.swatch, { backgroundColor: item.bg }]}
                            onPress={() => onCommand('hiliteColor', item.bg)}
                            hitSlop={SWATCH_SLOP}
                            accessibilityRole="button"
                        >
                            {/* Dark ink on the light highlight, as the highlighted text itself reads. */}
                            <Text style={[local.swatchText, { color: '#1f2937' }]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
            <View>
                <PickerOption styles={styles} label={l('Biçimlendirmeyi temizle', 'Clear formatting')} onPress={() => onCommand('removeFormat')} />
            </View>
        </AppDialog>
    );
}

/** The active field's raw HTML; the screen sanitizes it before it is written back. */
export function HtmlSourceModal({ visible, value, onChangeValue, onSave, onClose, l, t }: PickerBaseProps & {
    value: string;
    onChangeValue: (value: string) => void;
    onSave: () => void;
}) {
    return (
        <AppDialog
            visible={visible}
            onClose={onClose}
            title={l('HTML Kaynağını Düzenle', 'Edit HTML Source')}
            message={l('Alanın ham HTML içeriğini doğrudan düzenleyin. Kaydedildiğinde güvenlik doğrulaması uygulanır.', 'Edit raw HTML content directly. Sanitization is applied upon saving.')}
            actions={(
                <>
                    {cancelAction(t, onClose)}
                    <Button label={t('common.save')} onPress={onSave} />
                </>
            )}
        >
            <TextField
                style={local.htmlSource}
                value={value}
                onChangeText={onChangeValue}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
            />
        </AppDialog>
    );
}

// The swatches are drawn compact; the slop makes them a finger's height.
const SWATCH_SLOP = { top: 5, bottom: 5 };

const local = StyleSheet.create({
    option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    optionText: { flex: 1 },
    swatchGroup: { gap: Spacing.sm },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    swatch: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.inset },
    swatchText: { fontWeight: '600' },
    htmlSource: { minHeight: 140, maxHeight: 260, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
});
