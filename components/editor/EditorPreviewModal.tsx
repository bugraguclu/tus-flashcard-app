import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ColorScheme } from '../../constants/theme';
import CardWebView from '../CardWebView';
import { EyeIcon } from './EditorIcons';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

type CardWebViewProps = ComponentProps<typeof CardWebView>;

/** The unsaved note rendered as a card, with the note, card and note type it would produce. */
export interface EditorPreviewPayload {
    noteType: CardWebViewProps['noteType'];
    note: CardWebViewProps['note'];
    card: CardWebViewProps['card'];
}

interface EditorPreviewModalProps extends EditorI18n {
    visible: boolean;
    deck: CardWebViewProps['deck'];
    side: 'question' | 'answer';
    onSideChange: (side: 'question' | 'answer') => void;
    payload: EditorPreviewPayload | null;
    bodyHeight: number;
    audioPlaybackRate: number;
    onClose: () => void;
    colors: ColorScheme;
    styles: EditorStyles;
}

/** Shows the note being written as the reviewer will render it, question or answer side. */
export function EditorPreviewModal({
    visible,
    deck,
    side,
    onSideChange,
    payload,
    bodyHeight,
    audioPlaybackRate,
    onClose,
    colors,
    styles,
    l,
    t,
}: EditorPreviewModalProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityLabel={l('Önizlemeyi kapat', 'Close preview')}
                />
                <View style={styles.previewCard}>
                    <View style={styles.previewHeader}>
                        <View style={styles.previewTitleRow}>
                            <EyeIcon color={colors.textPrimary} size={22} />
                            <Text style={styles.previewTitleText}>{l('Önizleme', 'Preview')}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.previewHeaderClose}
                            onPress={onClose}
                            accessibilityLabel={t('common.close')}
                        >
                            <Text style={styles.previewHeaderCloseText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.previewMeta} numberOfLines={1}>
                        {deck?.name.replaceAll('::', ' › ') ?? '—'}
                    </Text>
                    <View style={styles.previewToggleRow}>
                        <TouchableOpacity
                            style={[
                                styles.previewToggleButton,
                                side === 'question' && styles.previewToggleButtonActive,
                            ]}
                            onPress={() => onSideChange('question')}
                        >
                            <Text
                                style={[
                                    styles.previewToggleText,
                                    side === 'question' && styles.previewToggleTextActive,
                                ]}
                            >
                                {l('Soru', 'Question')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.previewToggleButton,
                                side === 'answer' && styles.previewToggleButtonActive,
                            ]}
                            onPress={() => onSideChange('answer')}
                        >
                            <Text
                                style={[
                                    styles.previewToggleText,
                                    side === 'answer' && styles.previewToggleTextActive,
                                ]}
                            >
                                {l('Cevap', 'Answer')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.previewBody, { height: bodyHeight }]}>
                        {payload && (
                            <CardWebView
                                noteType={payload.noteType}
                                note={payload.note}
                                card={payload.card}
                                deck={deck}
                                side={side}
                                scrollMode="contained"
                                maxHeight={bodyHeight}
                                audioPlaybackRate={audioPlaybackRate}
                            />
                        )}
                    </View>
                    <TouchableOpacity
                        style={styles.previewCloseButton}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.close')}
                    >
                        <Text style={styles.previewCloseButtonText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
