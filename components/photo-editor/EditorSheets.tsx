import type { Dispatch, SetStateAction } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PhotoTextAlign, PhotoTextStyle } from '../../lib/photoEditor';
import { BLANK_CANVAS_BACKGROUNDS, BLANK_CANVAS_PAPERS, type BlankCanvasPaper } from '../../lib/blankCanvas';
import PaperSwatch, { pageColorLabel, paperLabel } from '../PaperSwatch';
import SwipeDismissSheet from '../SwipeDismissSheet';
import { DRAW_COLORS, type EditorPage, type PhotoEditorI18n } from './editorModel';
import type { PhotoEditorStyles } from './photoEditorStyles';

interface PageSheetProps {
    pageSheet: boolean;
    page: EditorPage | null;
    setPageSheet: Dispatch<SetStateAction<boolean>>;
    changePaper: (paper: BlankCanvasPaper) => void;
    changePageColor: (background: string) => void;
    styles: PhotoEditorStyles;
    l: PhotoEditorI18n['l'];
    t: PhotoEditorI18n['t'];
}

/** Paper and page colour for a drawn page, changeable while drawing. */
export function PageSheet({
    pageSheet,
    page,
    setPageSheet,
    changePaper,
    changePageColor,
    styles,
    l,
    t,
}: PageSheetProps) {
    return (
        <Modal visible={pageSheet && page !== null} transparent animationType="fade" onRequestClose={() => setPageSheet(false)}>
            <View style={styles.pageSheetOverlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setPageSheet(false)}
                    accessibilityLabel={l('Kağıt seçimini kapat', 'Close paper options')}
                />
                <SwipeDismissSheet active={pageSheet} style={styles.pageSheet} onDismiss={() => setPageSheet(false)}>
                    <Text style={styles.pageSheetTitle}>{l('Sayfa', 'Page')}</Text>

                    <Text style={styles.pageSheetLabel}>{l('Kağıt', 'Paper')}</Text>
                    <View style={styles.pageChipRow}>
                        {BLANK_CANVAS_PAPERS.map((option) => {
                            const isSelected = page?.paper === option;
                            return (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                    onPress={() => changePaper(option)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={paperLabel(option, l)}
                                >
                                    <PaperSwatch
                                        paper={option}
                                        background={page?.background ?? BLANK_CANVAS_BACKGROUNDS[0].color}
                                        width={44}
                                        height={34}
                                        style={styles.pageChipSwatch}
                                    />
                                    <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                        {paperLabel(option, l)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.pageSheetLabel}>{l('Zemin', 'Page colour')}</Text>
                    <View style={styles.pageChipRow}>
                        {BLANK_CANVAS_BACKGROUNDS.map((option) => {
                            const isSelected = page?.background === option.color;
                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                    onPress={() => changePageColor(option.color)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={pageColorLabel(option.id, l)}
                                >
                                    <View style={[styles.pageColorDot, { backgroundColor: option.color }]} />
                                    <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                        {pageColorLabel(option.id, l)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={styles.pageSheetDone}
                        onPress={() => setPageSheet(false)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kağıt seçimini bitir', 'Done choosing paper')}
                    >
                        <Text style={styles.pageSheetDoneText}>{t('common.completed')}</Text>
                    </TouchableOpacity>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

interface PictureSourceSheetProps {
    pictureSourceSheet: boolean;
    setPictureSourceSheet: Dispatch<SetStateAction<boolean>>;
    addPictureFrom: (from: 'library' | 'camera') => void;
    styles: PhotoEditorStyles;
    l: PhotoEditorI18n['l'];
    t: PhotoEditorI18n['t'];
}

/** Where a picture placed on the page comes from: the library or the camera. */
export function PictureSourceSheet({
    pictureSourceSheet,
    setPictureSourceSheet,
    addPictureFrom,
    styles,
    l,
    t,
}: PictureSourceSheetProps) {
    return (
        <Modal
            visible={pictureSourceSheet}
            transparent
            animationType="fade"
            onRequestClose={() => setPictureSourceSheet(false)}
        >
            <View style={styles.pageSheetOverlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setPictureSourceSheet(false)}
                    accessibilityLabel={l('Görsel kaynağı seçimini kapat', 'Close picture source options')}
                />
                <SwipeDismissSheet
                    active={pictureSourceSheet}
                    style={styles.pageSheet}
                    onDismiss={() => setPictureSourceSheet(false)}
                >
                    <Text style={styles.pageSheetTitle}>{l('Görsel ekle', 'Add a picture')}</Text>
                    <TouchableOpacity
                        style={styles.sourceRow}
                        onPress={() => addPictureFrom('library')}
                        accessibilityRole="button"
                        accessibilityLabel={l('Galeriden görsel seç', 'Choose a picture from the library')}
                    >
                        <Text style={styles.sourceRowIcon}>🖼️</Text>
                        <Text style={styles.sourceRowText}>{l('Galeriden seç', 'Choose from Library')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.sourceRow}
                        onPress={() => addPictureFrom('camera')}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kamerayla fotoğraf çek', 'Take a photo with the camera')}
                    >
                        <Text style={styles.sourceRowIcon}>📷</Text>
                        <Text style={styles.sourceRowText}>{l('Fotoğraf çek', 'Take Photo')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.sourceCancel}
                        onPress={() => setPictureSourceSheet(false)}
                        accessibilityRole="button"
                    >
                        <Text style={styles.sourceCancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

interface TextComposerModalProps {
    textModal: boolean;
    setTextModal: Dispatch<SetStateAction<boolean>>;
    textDraft: string;
    setTextDraft: Dispatch<SetStateAction<string>>;
    textBgStyle: PhotoTextStyle;
    setTextBgStyle: Dispatch<SetStateAction<PhotoTextStyle>>;
    textAlign: PhotoTextAlign;
    setTextAlign: Dispatch<SetStateAction<PhotoTextAlign>>;
    fontSize: number;
    setFontSize: Dispatch<SetStateAction<number>>;
    color: string;
    setColor: Dispatch<SetStateAction<string>>;
    confirmText: () => void;
    styles: PhotoEditorStyles;
    l: PhotoEditorI18n['l'];
    t: PhotoEditorI18n['t'];
}

/** The full-screen composer a label is written in, with its style, alignment, size and colour. */
export function TextComposerModal({
    textModal,
    setTextModal,
    textDraft,
    setTextDraft,
    textBgStyle,
    setTextBgStyle,
    textAlign,
    setTextAlign,
    fontSize,
    setFontSize,
    color,
    setColor,
    confirmText,
    styles,
    l,
    t,
}: TextComposerModalProps) {
    return (
        <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
            <KeyboardAvoidingView
                style={styles.instagramTextOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => setTextModal(false)}
                    accessibilityLabel={l('Metin düzenleyiciyi kapat', 'Close text composer')}
                />

                {/* Top Action Bar */}
                <SafeAreaView edges={['top']} style={styles.instagramTextHeader}>
                    <TouchableOpacity
                        style={styles.instagramHeaderBtn}
                        onPress={() => setTextModal(false)}
                        accessibilityRole="button"
                    >
                        <Text style={styles.instagramHeaderBtnText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>

                    <View style={styles.instagramHeaderCenter}>
                        {/* Style Toggle Button */}
                        <TouchableOpacity
                            style={[styles.instagramToolPill, textBgStyle !== 'classic' && styles.instagramToolPillActive]}
                            onPress={() => {
                                const stylesList: PhotoTextStyle[] = ['classic', 'badge', 'frosted', 'outline'];
                                setTextBgStyle(stylesList[(stylesList.indexOf(textBgStyle) + 1) % stylesList.length]);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={l('Stil', 'Style')}
                        >
                            <View style={[
                                styles.instagramStyleBadge,
                                textBgStyle === 'badge' && styles.textStyleBadgeSolid,
                                textBgStyle === 'frosted' && styles.textStyleBadgeFrosted,
                                textBgStyle === 'outline' && styles.textStyleBadgeOutline,
                            ]}>
                                <Text style={styles.instagramStyleBadgeText}>A</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Alignment Toggle Button */}
                        <TouchableOpacity
                            style={styles.instagramToolPill}
                            onPress={() => {
                                const aligns: PhotoTextAlign[] = ['center', 'right', 'left'];
                                setTextAlign(aligns[(aligns.indexOf(textAlign) + 1) % aligns.length]);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={l('Hizalama', 'Alignment')}
                        >
                            <Text style={styles.instagramAlignText}>
                                {textAlign === 'left' ? '⇤' : textAlign === 'right' ? '⇥' : '≡'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.instagramDoneBtn, !textDraft.trim() && styles.instagramDoneBtnDisabled]}
                        onPress={confirmText}
                        disabled={!textDraft.trim()}
                        accessibilityRole="button"
                    >
                        <Text style={styles.instagramDoneBtnText}>{t('common.completed')}</Text>
                    </TouchableOpacity>
                </SafeAreaView>

                {/* Center Area with Vertical Size Slider & Multiline Input */}
                <View style={styles.instagramCenterWrapper}>
                    {/* Left Vertical Font Size Slider (Instagram Story Style) */}
                    <View style={styles.instagramSliderColumn}>
                        <Text style={styles.instagramSliderLabel}>{fontSize}</Text>
                        <View
                            style={styles.instagramSliderTrack}
                            onStartShouldSetResponder={() => true}
                            onMoveShouldSetResponder={() => true}
                            onResponderGrant={(evt) => {
                                const y = evt.nativeEvent.locationY;
                                const ratio = Math.max(0, Math.min(1, 1 - y / 160));
                                const newSize = Math.round(14 + ratio * 38);
                                setFontSize(newSize);
                            }}
                            onResponderMove={(evt) => {
                                const y = evt.nativeEvent.locationY;
                                const ratio = Math.max(0, Math.min(1, 1 - y / 160));
                                const newSize = Math.round(14 + ratio * 38);
                                setFontSize(newSize);
                            }}
                        >
                            <View
                                style={[
                                    styles.instagramSliderThumb,
                                    {
                                        bottom: `${Math.max(0, Math.min(100, Math.round(((fontSize - 14) / 38) * 100)))}%`,
                                    },
                                ]}
                            />
                        </View>
                        <Text style={styles.instagramSliderMinLabel}>A</Text>
                    </View>

                    {/* Centered Large Multiline Input */}
                    <View style={styles.instagramInputContainer}>
                        <TextInput
                            style={[
                                styles.instagramTextInput,
                                {
                                    fontSize: fontSize,
                                    textAlign: textAlign,
                                    color: textBgStyle === 'badge'
                                        ? (color === '#ffffff' ? '#ffffff' : (['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'].includes(color) ? '#111827' : '#ffffff'))
                                        : (textBgStyle === 'frosted' ? (['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'].includes(color) ? '#ffffff' : '#111827') : color),
                                    backgroundColor: textBgStyle === 'classic'
                                        ? 'transparent'
                                        : textBgStyle === 'badge'
                                            ? (color === '#ffffff' ? '#111827' : color)
                                            : textBgStyle === 'frosted'
                                                ? (['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'].includes(color) ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.85)')
                                                : 'transparent',
                                    borderColor: textBgStyle === 'outline' ? color : 'transparent',
                                    borderWidth: textBgStyle === 'outline' ? 2.5 : 0,
                                },
                            ]}
                            value={textDraft}
                            onChangeText={setTextDraft}
                            placeholder={l('Yazmaya başlayın…', 'Start typing…')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            autoFocus
                            multiline
                            maxLength={200}
                        />
                    </View>
                </View>

                {/* Bottom Color Swatches in Composer */}
                <View style={styles.instagramColorRow}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.instagramColorList}
                    >
                        {DRAW_COLORS.map((itemColor) => (
                            <TouchableOpacity
                                key={`modal-${itemColor}`}
                                style={[styles.instagramColorBtn, color === itemColor && styles.instagramColorBtnActive]}
                                onPress={() => setColor(itemColor)}
                                accessibilityRole="button"
                                accessibilityLabel={l(`Renk ${itemColor}`, `Color ${itemColor}`)}
                            >
                                <View style={[styles.instagramColorDot, { backgroundColor: itemColor }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
