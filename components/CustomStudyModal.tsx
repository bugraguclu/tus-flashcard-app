import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { sanitizeUnsignedIntegerDraft } from '../lib/boundedNumber';
import { alert, confirm } from '../lib/confirm';
import { addDeckTodayBoost, createOrReplaceCustomStudySession } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import SwipeDismissSheet from './SwipeDismissSheet';

interface CustomStudyModalProps {
    visible: boolean;
    deck: Deck | null;
    dayRolloverHour: number;
    onClose: () => void;
    onChanged: () => void;
    onStudy: (deckName: string) => void;
}

function parseCount(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export default function CustomStudyModal({
    visible,
    deck,
    dayRolloverHour,
    onClose,
    onChanged,
    onStudy,
}: CustomStudyModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const [boostNew, setBoostNew] = useState('10');
    const [boostReview, setBoostReview] = useState('20');
    const [customLimit, setCustomLimit] = useState('50');
    const [customTag, setCustomTag] = useState('');
    const [forgottenDays, setForgottenDays] = useState('7');
    const [aheadDays, setAheadDays] = useState('3');

    useEffect(() => {
        if (!visible) return;
        setBoostNew('10');
        setBoostReview('20');
        setCustomLimit('50');
        setCustomTag('');
        setForgottenDays('7');
        setAheadDays('3');
    }, [deck?.id, visible]);

    if (!deck) return null;

    const finishSession = (search: string, options?: { reschedule: boolean; searchOrder: number }) => {
        try {
            const session = createOrReplaceCustomStudySession(
                deck.id,
                search,
                options ? 999 : (parseCount(customLimit, 50) || 50),
                options,
            );
            if (!session) {
                alert(
                    l('Oturum oluşturulamadı', 'Session could not be created'),
                    l(
                        '“Özel çalışma oturumu” adı normal bir deste tarafından kullanılıyor. Bu destenin adını değiştirip yeniden deneyin.',
                        'The name “Custom Study Session” is used by a regular deck. Rename that deck and try again.',
                    ),
                );
                return;
            }
            onClose();
            onChanged();
            setTimeout(() => confirm(
                l('Özel çalışma oturumu hazır', 'Custom Study session ready'),
                l(
                    `“${getDeckDisplayName(session.name)}” oluşturuldu. Şimdi çalışmak ister misiniz?`,
                    `“${getDeckDisplayName(session.name)}” was created. Study now?`,
                ),
                () => onStudy(session.name),
            ), Platform.OS === 'ios' ? 250 : 0);
        } catch (error) {
            console.warn('[CustomStudyModal] session creation failed:', error);
            alert(t('common.error'), l('Özel çalışma oturumu oluşturulamadı.', 'Could not create the Custom Study session.'));
        }
    };

    const applyBoost = (extraNew: number, extraReview: number) => {
        try {
            addDeckTodayBoost(deck.id, extraNew, extraReview, dayRolloverHour);
            onClose();
            onChanged();
            setTimeout(() => alert(
                l('Bugünkü limit artırıldı', 'Today’s limit increased'),
                extraNew > 0
                    ? l(`Bugün bu desteden ${extraNew} ek yeni kart gösterilecek.`, `${extraNew} additional new cards will be shown from this deck today.`)
                    : l(`Bugün bu destede ${extraReview} ek tekrara izin verildi.`, `${extraReview} additional reviews are allowed in this deck today.`),
            ), Platform.OS === 'ios' ? 250 : 0);
        } catch (error) {
            console.warn('[CustomStudyModal] limit boost failed:', error);
            alert(t('common.error'), l('Bugünkü limit güncellenemedi.', 'Today’s limit could not be updated.'));
        }
    };

    const tag = customTag.trim();
    const deckSearch = `deck:"${deck.name.replace(/"/g, '\\"')}"`;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                />
                <SwipeDismissSheet
                    active={visible}
                    style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}
                    onDismiss={onClose}
                    accessibilityViewIsModal
                >
                    <View style={styles.header}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.eyebrow}>{l('ÇALIŞMA KAPSAMI', 'STUDY SCOPE')}</Text>
                            <Text style={styles.title}>{t('anki.customStudy')}</Text>
                            <Text style={styles.subtitle} numberOfLines={2}>{getDeckDisplayName(deck.name)}</Text>
                        </View>
                        <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                            <Text style={styles.closeText}>×</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        showsVerticalScrollIndicator={false}
                    >
                        <StudySection title={l('Bugünkü limitleri artır', 'Increase today’s limits')} styles={styles}>
                            <ActionInput
                                label={l('Ek yeni kart', 'Additional new cards')}
                                value={boostNew}
                                onChangeText={setBoostNew}
                                onPress={() => applyBoost(parseCount(boostNew, 0), 0)}
                                styles={styles}
                                actionLabel={l('Uygula', 'Apply')}
                            />
                            <ActionInput
                                label={l('Ek tekrar', 'Additional reviews')}
                                value={boostReview}
                                onChangeText={setBoostReview}
                                onPress={() => applyBoost(0, parseCount(boostReview, 0))}
                                styles={styles}
                                actionLabel={l('Uygula', 'Apply')}
                            />
                        </StudySection>

                        <StudySection title={l('Seçili kartlardan oturum oluştur', 'Create a session from selected cards')} styles={styles}>
                            <Text style={styles.fieldLabel}>{l('Kart sınırı', 'Card limit')}</Text>
                            <TextInput
                                style={styles.input}
                                value={customLimit}
                                onChangeText={(value) => setCustomLimit(sanitizeUnsignedIntegerDraft(value, 4))}
                                keyboardType="number-pad"
                                maxLength={4}
                                accessibilityLabel={l('Oturum kart sınırı', 'Session card limit')}
                            />
                            <Text style={styles.fieldLabel}>{l('Etiket (isteğe bağlı)', 'Tag (optional)')}</Text>
                            <TextInput
                                style={styles.input}
                                value={customTag}
                                onChangeText={setCustomTag}
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder={l('Örn. Anatomi', 'E.g. Anatomy')}
                                placeholderTextColor={colors.textMuted}
                            />
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={() => finishSession(tag ? `${deckSearch} tag:"${tag.replace(/"/g, '\\"')}"` : deckSearch)}
                            >
                                <Text style={styles.primaryButtonText}>{l('Oturum oluştur', 'Create Session')}</Text>
                            </TouchableOpacity>
                        </StudySection>

                        <StudySection title={l('Hazır çalışma türleri', 'Ready-made study types')} styles={styles}>
                            <PresetRow
                                title={l('Unutulanları çalış', 'Review forgotten cards')}
                                description={l('Son N günde “Tekrar” verdiğiniz kartlar', 'Cards answered Again in the last N days')}
                                value={forgottenDays}
                                onChangeText={setForgottenDays}
                                onPress={() => finishSession(`${deckSearch} rated:${parseCount(forgottenDays, 7) || 7}:1`, { reschedule: true, searchOrder: 6 })}
                                styles={styles}
                                actionLabel={t('common.create')}
                            />
                            <PresetRow
                                title={l('İleriye çalış', 'Study ahead')}
                                description={l('N gün içinde zamanı gelecek kartlar', 'Cards due within N days')}
                                value={aheadDays}
                                onChangeText={setAheadDays}
                                onPress={() => finishSession(`${deckSearch} prop:due<=${parseCount(aheadDays, 3) || 3}`, { reschedule: true, searchOrder: 0 })}
                                styles={styles}
                                actionLabel={t('common.create')}
                            />
                            <TouchableOpacity
                                style={styles.presetButton}
                                onPress={() => finishSession(`${deckSearch} is:new`, { reschedule: false, searchOrder: 4 })}
                            >
                                <View style={styles.presetCopy}>
                                    <Text style={styles.presetTitle}>{l('Yeni kartları önizle', 'Preview new cards')}</Text>
                                    <Text style={styles.presetDescription}>{l('Kartların zamanlamasını değiştirmez', 'Does not affect card scheduling')}</Text>
                                </View>
                                <Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>
                        </StudySection>

                        <Text style={styles.note}>
                            {l(
                                'Yeni bir işlem, mevcut “Özel çalışma” oturumunu yeniden oluşturur. Mevcut oturumu korumak istiyorsanız önce adını değiştirin.',
                                'A new action rebuilds the existing Custom Study session. Rename the current session first if you want to keep it.',
                            )}
                        </Text>
                    </ScrollView>
                </SwipeDismissSheet>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function StudySection({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.sectionBody}>{children}</View>
        </View>
    );
}

interface ActionInputProps {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    onPress: () => void;
    actionLabel: string;
    styles: ReturnType<typeof createStyles>;
}

function ActionInput({ label, value, onChangeText, onPress, actionLabel, styles }: ActionInputProps) {
    return (
        <View>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.actionRow}>
                <TextInput
                    style={[styles.input, styles.actionInput]}
                    value={value}
                    onChangeText={(next) => onChangeText(sanitizeUnsignedIntegerDraft(next, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                />
                <TouchableOpacity style={styles.smallButton} onPress={onPress}>
                    <Text style={styles.smallButtonText}>{actionLabel}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

interface PresetRowProps {
    title: string;
    description: string;
    value: string;
    onChangeText: (value: string) => void;
    onPress: () => void;
    actionLabel: string;
    styles: ReturnType<typeof createStyles>;
}

function PresetRow({ title, description, value, onChangeText, onPress, actionLabel, styles }: PresetRowProps) {
    return (
        <View style={styles.presetRow}>
            <View style={styles.presetCopy}>
                <Text style={styles.presetTitle}>{title}</Text>
                <Text style={styles.presetDescription}>{description}</Text>
            </View>
            <TextInput
                style={styles.compactInput}
                value={value}
                onChangeText={(next) => onChangeText(sanitizeUnsignedIntegerDraft(next, 4))}
                keyboardType="number-pad"
                maxLength={4}
            />
            <TouchableOpacity style={styles.smallButton} onPress={onPress}>
                <Text style={styles.smallButtonText}>{actionLabel}</Text>
            </TouchableOpacity>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { flex: 1, justifyContent: 'flex-end' },
        backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
        sheet: {
            width: '100%',
            maxWidth: 680,
            maxHeight: '92%',
            alignSelf: 'center',
            backgroundColor: colors.bgPrimary,
            borderTopLeftRadius: BorderRadius.xl,
            borderTopRightRadius: BorderRadius.xl,
            overflow: 'hidden',
            ...Shadows.lg,
        },
        header: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.xl, paddingTop: 48, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        headerCopy: { flex: 1, paddingRight: Spacing.md },
        eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: colors.accent, marginBottom: 4 },
        title: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
        subtitle: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 3 },
        closeButton: { width: 44, height: 44, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },
        closeText: { fontSize: 28, lineHeight: 30, color: colors.textSecondary },
        content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
        section: { gap: Spacing.sm },
        sectionTitle: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textSecondary },
        sectionBody: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.md },
        fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: colors.textMuted, marginBottom: 5 },
        input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm, backgroundColor: colors.bgInput, paddingHorizontal: Spacing.md, fontSize: FontSize.md, color: colors.textPrimary },
        actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        actionInput: { flex: 1 },
        smallButton: { minHeight: 44, minWidth: 82, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
        smallButtonText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },
        primaryButton: { minHeight: 48, borderRadius: BorderRadius.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
        primaryButtonText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        presetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
        presetButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
        presetCopy: { flex: 1 },
        presetTitle: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        presetDescription: { fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
        compactInput: { width: 56, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm, textAlign: 'center', color: colors.textPrimary, backgroundColor: colors.bgInput, fontSize: FontSize.md },
        chevron: { fontSize: 28, color: colors.textMuted, marginLeft: Spacing.md },
        note: { fontSize: FontSize.xs, lineHeight: 18, color: colors.textMuted, paddingHorizontal: Spacing.xs },
    });
}
