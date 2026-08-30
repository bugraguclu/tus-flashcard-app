/**
 * Anki's Custom Study dialog: six mutually exclusive options driving one spinner, plus the
 * tag chooser its "study by card state or tag" option opens. What each option searches for,
 * how it orders the session and whether it reschedules lives in lib/customStudy.ts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { commitBoundedInteger, sanitizeSignedIntegerDraft, stepBoundedIntegerDraft } from '../lib/boundedNumber';
import { alert, confirm } from '../lib/confirm';
import {
    CUSTOM_STUDY_CRAM_KINDS,
    customStudySessionConfig,
    customStudyValueBounds,
    EMPTY_CUSTOM_STUDY_DEFAULTS,
    type CustomStudyCramKind,
    type CustomStudyDefaults,
    type CustomStudyOption,
    type CustomStudyRequest,
} from '../lib/customStudy';
import {
    addDeckTodayBoost,
    createOrReplaceCustomStudySession,
    getAllDecks,
    getCardCountsByDeck,
    getCustomStudyDefaults,
    rememberCustomStudyExtend,
    rememberCustomStudyTags,
} from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { getAllTags } from '../lib/noteManager';
import { getFilteredDeckGatherCount } from '../lib/studyRepository';
import type { AppSettings } from '../lib/types';
import SwipeDismissSheet from './SwipeDismissSheet';

interface CustomStudyModalProps {
    visible: boolean;
    deck: Deck | null;
    settings: AppSettings;
    onClose: () => void;
    onChanged: () => void;
    onStudy: (deckName: string) => void;
}

const OPTIONS: readonly CustomStudyOption[] = [
    'newLimit',
    'reviewLimit',
    'forgot',
    'ahead',
    'preview',
    'cram',
];

interface DeckAvailability {
    newHere: number;
    newInChildren: number;
    reviewHere: number;
    reviewInChildren: number;
    cardCount: number;
}

const EMPTY_AVAILABILITY: DeckAvailability = {
    newHere: 0,
    newInChildren: 0,
    reviewHere: 0,
    reviewInChildren: 0,
    cardCount: 0,
};

/** Deck ids of the deck itself plus everything nested under it, as Anki's `deck:` search scopes. */
function deckSubtreeIds(deck: Deck): number[] {
    const prefix = `${deck.name}::`;
    return getAllDecks()
        .filter((entry) => entry.id === deck.id || entry.name.startsWith(prefix))
        .map((entry) => entry.id);
}

function readAvailability(deck: Deck, settings: AppSettings): DeckAvailability {
    const counts = getCardCountsByDeck(Date.now(), settings.dayRolloverHour, settings.learnAheadMinutes);
    const ids = deckSubtreeIds(deck);
    const own = counts.get(deck.id);
    let newInChildren = 0;
    let reviewInChildren = 0;
    let cardCount = 0;
    for (const id of ids) {
        const row = counts.get(id);
        if (!row) continue;
        cardCount += row.total;
        if (id === deck.id) continue;
        newInChildren += row.new;
        reviewInChildren += row.review;
    }
    return {
        newHere: own?.new ?? 0,
        newInChildren,
        reviewHere: own?.review ?? 0,
        reviewInChildren,
        cardCount,
    };
}

export default function CustomStudyModal({
    visible,
    deck,
    settings,
    onClose,
    onChanged,
    onStudy,
}: CustomStudyModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();

    const [option, setOption] = useState<CustomStudyOption>('newLimit');
    const [valueDraft, setValueDraft] = useState('0');
    const [cramKind, setCramKind] = useState<CustomStudyCramKind>('new');
    const [defaults, setDefaults] = useState<CustomStudyDefaults>(EMPTY_CUSTOM_STUDY_DEFAULTS);
    const [availability, setAvailability] = useState<DeckAvailability>(EMPTY_AVAILABILITY);
    const [deckTags, setDeckTags] = useState<string[]>([]);
    const [includeTags, setIncludeTags] = useState<string[]>([]);
    const [excludeTags, setExcludeTags] = useState<string[]>([]);
    const [choosingTags, setChoosingTags] = useState(false);

    const bounds = useMemo(() => customStudyValueBounds(option, defaults), [option, defaults]);

    useEffect(() => {
        if (!visible || !deck) return;
        const deckDefaults = getCustomStudyDefaults(deck.id);
        setDefaults(deckDefaults);
        setAvailability(readAvailability(deck, settings));
        setDeckTags(getAllTags({ deckIds: deckSubtreeIds(deck) }));
        setIncludeTags(deckDefaults.includeTags);
        setExcludeTags(deckDefaults.excludeTags);
        setChoosingTags(false);
        setCramKind('new');
        setOption('newLimit');
        setValueDraft(String(customStudyValueBounds('newLimit', deckDefaults).initial));
        // Availability and tags are a snapshot of the moment the dialog opens, exactly as Anki
        // fetches them once before showing the window.
    }, [visible, deck?.id]);

    /** Anki resets the spinner to that option's own default whenever the radio changes. */
    const chooseOption = useCallback((next: CustomStudyOption) => {
        setOption(next);
        setValueDraft(String(customStudyValueBounds(next, defaults).initial));
    }, [defaults]);

    if (!deck) return null;

    const value = commitBoundedInteger(valueDraft, bounds.initial, bounds.min, bounds.max);
    const stepValue = (delta: number) => setValueDraft(String(
        stepBoundedIntegerDraft(valueDraft, bounds.initial, delta, bounds.min, bounds.max),
    ));

    const optionLabel = (candidate: CustomStudyOption): string => {
        switch (candidate) {
            case 'newLimit': return l('Bugünkü yeni kart limitini artır', 'Increase today’s new card limit');
            case 'reviewLimit': return l('Bugünkü tekrar kart limitini artır', 'Increase today’s review card limit');
            case 'forgot': return l('Unutulan kartları tekrarla', 'Review forgotten cards');
            case 'ahead': return l('İleriye çalış', 'Review ahead');
            case 'preview': return l('Yeni kartları önizle', 'Preview new cards');
            case 'cram': return l('Kart durumuna veya etikete göre çalış', 'Study by card state or tag');
        }
    };

    const preSpinLabel = (): string => {
        switch (option) {
            case 'newLimit': return l('Bugünkü yeni kart limitini şu kadar artır', 'Increase today’s new card limit by');
            case 'reviewLimit': return l('Bugünkü tekrar limitini şu kadar artır', 'Increase today’s review limit by');
            case 'forgot': return l('Son şu kadar günde unutulan kartları tekrarla', 'Review cards forgotten in the last');
            case 'ahead': return l('Şu kadar gün ileriye çalış', 'Review ahead by');
            case 'preview': return l('Son şu kadar günde eklenen yeni kartları önizle', 'Preview new cards added in the last');
            case 'cram': return l('Seç', 'Select');
        }
    };

    const postSpinLabel = (): string => {
        if (option === 'cram') return l('kart (bu desteden)', value === 1 ? 'card from the deck' : 'cards from the deck');
        if (option === 'newLimit' || option === 'reviewLimit') return l('kart', value === 1 ? 'card' : 'cards');
        return l('gün', value === 1 ? 'day' : 'days');
    };

    const countWithChildren = (parent: number, children: number): string => (children > 0
        ? l(`${parent} (alt destelerde ${children})`, `${parent} (${children} in subdecks)`)
        : String(parent));

    const availabilityLabel = option === 'newLimit'
        ? l(
            `Kullanılabilir yeni kart: ${countWithChildren(availability.newHere, availability.newInChildren)}`,
            `Available new cards: ${countWithChildren(availability.newHere, availability.newInChildren)}`,
        )
        : option === 'reviewLimit'
            ? l(
                `Kullanılabilir tekrar kartı: ${countWithChildren(availability.reviewHere, availability.reviewInChildren)}`,
                `Available review cards: ${countWithChildren(availability.reviewHere, availability.reviewInChildren)}`,
            )
            : null;

    const cramKindLabel = (kind: CustomStudyCramKind): string => {
        switch (kind) {
            case 'new': return l('Yalnızca yeni kartlar', 'New cards only');
            case 'due': return l('Yalnızca zamanı gelmiş kartlar', 'Due cards only');
            case 'review': return l('Tüm tekrar kartları rastgele sırayla', 'All review cards in random order');
            case 'all': return l('Tüm kartlar rastgele sırayla (yeniden zamanlanmaz)', 'All cards in random order (don’t reschedule)');
        }
    };

    // Anki keeps the two limit options usable even for an empty deck; every other option needs
    // cards to gather.
    const buildsSession = option !== 'newLimit' && option !== 'reviewLimit';
    const submitDisabled = buildsSession && availability.cardCount === 0;

    const applyLimitDelta = (delta: number) => {
        const field = option === 'newLimit' ? 'extendNew' : 'extendReview';
        try {
            addDeckTodayBoost(
                deck.id,
                option === 'newLimit' ? delta : 0,
                option === 'reviewLimit' ? delta : 0,
                settings.dayRolloverHour,
            );
            rememberCustomStudyExtend(deck.id, field, delta);
            onClose();
            onChanged();
            setTimeout(() => alert(
                delta >= 0
                    ? l('Bugünkü limit artırıldı', 'Today’s limit increased')
                    : l('Bugünkü limit azaltıldı', 'Today’s limit decreased'),
                option === 'newLimit'
                    ? l(
                        `Bugün bu destede yeni kart limiti ${delta} kart değiştirildi.`,
                        `Today’s new card limit for this deck changed by ${delta} cards.`,
                    )
                    : l(
                        `Bugün bu destede tekrar limiti ${delta} kart değiştirildi.`,
                        `Today’s review limit for this deck changed by ${delta} cards.`,
                    ),
            ), Platform.OS === 'ios' ? 250 : 0);
        } catch (error) {
            console.warn('[CustomStudyModal] limit change failed:', error);
            alert(t('common.error'), l('Bugünkü limit güncellenemedi.', 'Today’s limit could not be updated.'));
        }
    };

    const buildSession = (request: CustomStudyRequest) => {
        const config = customStudySessionConfig(request, deck.name);
        if (!config) return;

        try {
            // Anki refuses to build an empty session and leaves the dialog open so the criteria
            // can be widened, rather than creating a deck with nothing in it.
            const matches = getFilteredDeckGatherCount(settings, {
                search: config.search,
                limit: config.limit,
                order: config.order,
            });
            if (matches === 0) {
                alert(
                    t('anki.customStudy'),
                    l('Verdiğiniz ölçütlere uyan kart bulunamadı.', 'No cards matched the criteria you provided.'),
                );
                return;
            }

            const session = createOrReplaceCustomStudySession(deck.id, config);
            if (!session) {
                alert(
                    t('anki.customStudy'),
                    l(
                        'Lütfen önce mevcut “Özel Çalışma Oturumu” destesini yeniden adlandırın.',
                        'Please rename the existing Custom Study deck first.',
                    ),
                );
                return;
            }

            if (request.option === 'cram') {
                rememberCustomStudyTags(deck.id, request.includeTags, request.excludeTags);
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

    const submit = () => {
        switch (option) {
            case 'newLimit':
            case 'reviewLimit':
                applyLimitDelta(value);
                return;
            case 'forgot':
                buildSession({ option: 'forgot', days: value });
                return;
            case 'ahead':
                buildSession({ option: 'ahead', days: value });
                return;
            case 'preview':
                buildSession({ option: 'preview', days: value });
                return;
            case 'cram':
                // Anki's OK button becomes "Choose Tags": the session is built after that step.
                setChoosingTags(true);
        }
    };

    const toggleTag = (list: string[], setList: (next: string[]) => void, tag: string) => {
        setList(list.includes(tag) ? list.filter((entry) => entry !== tag) : [...list, tag]);
    };

    const renderTagChips = (
        selected: string[],
        setSelected: (next: string[]) => void,
        accessibilityPrefix: string,
    ) => (
        <View style={styles.tagRow}>
            {deckTags.map((tag) => {
                const active = selected.includes(tag);
                return (
                    <TouchableOpacity
                        key={`${accessibilityPrefix}-${tag}`}
                        style={[styles.tagChip, active && styles.tagChipActive]}
                        onPress={() => toggleTag(selected, setSelected, tag)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={`${accessibilityPrefix}: ${tag}`}
                    >
                        <Text style={[styles.tagChipText, active && styles.tagChipTextActive]} numberOfLines={1}>{tag}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

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
                        {choosingTags && (
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => setChoosingTags(false)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Geri', 'Back')}
                            >
                                <Text style={styles.backText}>‹</Text>
                            </TouchableOpacity>
                        )}
                        <View style={styles.headerCopy}>
                            <Text style={styles.eyebrow}>{l('ÇALIŞMA KAPSAMI', 'STUDY SCOPE')}</Text>
                            <Text style={styles.title}>
                                {choosingTags ? l('Seçmeli çalışma', 'Selective Study') : t('anki.customStudy')}
                            </Text>
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
                        {choosingTags ? (
                            <>
                                <Text style={styles.fieldLabel}>
                                    {l('Şu etiketlerden en az biri gerekli:', 'Require one or more of these tags:')}
                                </Text>
                                {deckTags.length > 0
                                    ? renderTagChips(includeTags, setIncludeTags, l('Gerekli etiket', 'Required tag'))
                                    : <Text style={styles.note}>{l('Bu destede etiket yok.', 'This deck has no tags.')}</Text>}

                                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                                    {l('Hariç tutulacak etiketleri seçin:', 'Select tags to exclude:')}
                                </Text>
                                {deckTags.length > 0
                                    ? renderTagChips(excludeTags, setExcludeTags, l('Hariç tutulan etiket', 'Excluded tag'))
                                    : null}

                                <TouchableOpacity
                                    style={styles.primaryButton}
                                    onPress={() => buildSession({
                                        option: 'cram',
                                        kind: cramKind,
                                        cardLimit: value,
                                        includeTags,
                                        excludeTags,
                                    })}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.primaryButtonText}>{t('common.ok')}</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View style={styles.optionList}>
                                    {OPTIONS.map((candidate) => (
                                        <TouchableOpacity
                                            key={candidate}
                                            style={[styles.optionRow, option === candidate && styles.optionRowActive]}
                                            onPress={() => chooseOption(candidate)}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: option === candidate }}
                                        >
                                            <View style={[styles.radio, option === candidate && styles.radioActive]}>
                                                {option === candidate && <View style={styles.radioDot} />}
                                            </View>
                                            <Text style={[styles.optionText, option === candidate && styles.optionTextActive]}>
                                                {optionLabel(candidate)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {availabilityLabel && <Text style={styles.availability}>{availabilityLabel}</Text>}

                                <Text style={styles.fieldLabel}>{preSpinLabel()}</Text>
                                <View style={styles.spinnerRow}>
                                    <TouchableOpacity
                                        style={styles.stepButton}
                                        onPress={() => stepValue(-1)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Azalt', 'Decrease')}
                                    >
                                        <Text style={styles.stepText}>−</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        style={styles.spinnerInput}
                                        value={valueDraft}
                                        onChangeText={(next) => setValueDraft(sanitizeSignedIntegerDraft(next, 5))}
                                        onBlur={() => setValueDraft(String(value))}
                                        keyboardType={bounds.min < 0 ? 'numbers-and-punctuation' : 'number-pad'}
                                        maxLength={6}
                                        accessibilityLabel={preSpinLabel()}
                                    />
                                    <TouchableOpacity
                                        style={styles.stepButton}
                                        onPress={() => stepValue(1)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Artır', 'Increase')}
                                    >
                                        <Text style={styles.stepText}>+</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.spinnerSuffix}>{postSpinLabel()}</Text>
                                </View>

                                {option === 'cram' && (
                                    <View style={styles.cramList}>
                                        {CUSTOM_STUDY_CRAM_KINDS.map((kind) => (
                                            <TouchableOpacity
                                                key={kind}
                                                style={[styles.cramRow, cramKind === kind && styles.cramRowActive]}
                                                onPress={() => setCramKind(kind)}
                                                accessibilityRole="radio"
                                                accessibilityState={{ selected: cramKind === kind }}
                                            >
                                                <Text style={[styles.cramText, cramKind === kind && styles.cramTextActive]}>
                                                    {cramKindLabel(kind)}
                                                </Text>
                                                {cramKind === kind && <Text style={styles.check}>✓</Text>}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[styles.primaryButton, submitDisabled && styles.primaryButtonDisabled]}
                                    onPress={submit}
                                    disabled={submitDisabled}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: submitDisabled }}
                                >
                                    <Text style={styles.primaryButtonText}>
                                        {option === 'cram' ? l('Etiketleri seç', 'Choose Tags') : t('common.ok')}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={styles.note}>
                                    {l(
                                        'Yeni bir işlem, mevcut “Özel Çalışma Oturumu” destesini yeniden oluşturur. Mevcut oturumu korumak istiyorsanız önce adını değiştirin.',
                                        'A new action rebuilds the existing Custom Study Session deck. Rename the current session first if you want to keep it.',
                                    )}
                                </Text>
                            </>
                        )}
                    </ScrollView>
                </SwipeDismissSheet>
            </KeyboardAvoidingView>
        </Modal>
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
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: Spacing.xl,
            paddingTop: 48,
            paddingBottom: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        backButton: { width: 34, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
        backText: { fontSize: 30, lineHeight: 32, color: colors.accent },
        headerCopy: { flex: 1, paddingRight: Spacing.md },
        eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: colors.accent, marginBottom: 4 },
        title: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
        subtitle: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 3 },
        closeButton: {
            width: 44,
            height: 44,
            borderRadius: BorderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgSecondary,
        },
        closeText: { fontSize: 28, lineHeight: 30, color: colors.textSecondary },
        content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
        optionList: {
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            overflow: 'hidden',
        },
        optionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            minHeight: 50,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        optionRowActive: { backgroundColor: colors.accentLight },
        radio: {
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        radioActive: { borderColor: colors.accent },
        radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
        optionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        optionTextActive: { fontWeight: '700' },
        availability: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: Spacing.md },
        fieldLabel: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm },
        fieldLabelSpaced: { marginTop: Spacing.lg },
        spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        stepButton: {
            width: 46,
            height: 46,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
        },
        stepText: { fontSize: 24, lineHeight: 26, color: colors.textPrimary, fontWeight: '700' },
        spinnerInput: {
            width: 92,
            minHeight: 46,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgInput,
            paddingHorizontal: Spacing.md,
            textAlign: 'center',
            fontSize: FontSize.md,
            color: colors.textPrimary,
        },
        spinnerSuffix: { flex: 1, fontSize: FontSize.sm, color: colors.textSecondary },
        cramList: {
            marginTop: Spacing.md,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            overflow: 'hidden',
        },
        cramRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 46,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        cramRowActive: { backgroundColor: colors.accentLight },
        cramText: { flex: 1, fontSize: FontSize.sm, color: colors.textPrimary },
        cramTextActive: { fontWeight: '700', color: colors.accent },
        check: { fontSize: FontSize.md, color: colors.accent, fontWeight: '800' },
        tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        tagChip: {
            minHeight: 40,
            justifyContent: 'center',
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            maxWidth: '100%',
        },
        tagChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        tagChipText: { fontSize: FontSize.sm, color: colors.textPrimary },
        tagChipTextActive: { color: colors.accent, fontWeight: '700' },
        primaryButton: {
            minHeight: 50,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: Spacing.lg,
        },
        primaryButtonDisabled: { opacity: 0.45 },
        primaryButtonText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        note: { fontSize: FontSize.xs, lineHeight: 18, color: colors.textMuted, marginTop: Spacing.md },
    });
}
