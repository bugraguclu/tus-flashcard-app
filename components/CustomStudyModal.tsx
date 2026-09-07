/**
 * Anki's Custom Study dialog (qt/aqt/customstudy.py): six mutually exclusive options driving one
 * spinner, and the Selective Study tag chooser (qt/aqt/taglimit.py) its "study by card state or
 * tag" option opens. What each option searches for, how it orders the session and whether it
 * reschedules lives in lib/customStudy.ts.
 *
 * The dialog is laid out the way Anki lays it out: the radio list, then one group holding the
 * availability line, the "<label> [spinner] <unit>" sentence and the card-state list, then the
 * Cancel/OK button box whose OK becomes "Choose Tags" for the tag option.
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
import { useRepeatPress } from '../hooks/useRepeatPress';
import { commitBoundedInteger, sanitizeSignedIntegerDraft, stepBoundedIntegerDraft } from '../lib/boundedNumber';
import { alert } from '../lib/confirm';
import {
    CUSTOM_STUDY_CRAM_KINDS,
    CUSTOM_STUDY_MAX_TAGS,
    customStudySessionConfig,
    customStudyValueBounds,
    EMPTY_CUSTOM_STUDY_DEFAULTS,
    type CustomStudyCramKind,
    type CustomStudyDefaults,
    type CustomStudyOption,
    type CustomStudyRequest,
} from '../lib/customStudy';
import {
    createOrReplaceCustomStudySession,
    extendDeckTodayLimits,
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
    /** Anki makes the new session the current deck and lands on its overview. */
    onSessionCreated: (deckName: string) => void;
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

/**
 * Anki's `custom_study_defaults` counts: what the deck itself has available today, uncapped by
 * any daily limit, and the same total for everything nested under it.
 */
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

/** Anki's tag lists show `parent::child` as written but read `_` as a space. */
function tagDisplayName(tag: string): string {
    return tag.replace(/_/g, ' ');
}

export default function CustomStudyModal({
    visible,
    deck,
    settings,
    onClose,
    onChanged,
    onSessionCreated,
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
    const [requireTags, setRequireTags] = useState(false);
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
        // Anki ticks "require one or more of these tags" only when the last session used one.
        setRequireTags(deckDefaults.includeTags.length > 0);
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

    // Stepping reads the draft it is updating, so a burst of taps accumulates instead of
    // every tap re-stepping the same value.
    const stepValue = useCallback((delta: number) => {
        setValueDraft((draft) => String(
            stepBoundedIntegerDraft(draft, bounds.initial, delta, bounds.min, bounds.max),
        ));
    }, [bounds.initial, bounds.max, bounds.min]);

    const decrementRepeat = useRepeatPress(() => stepValue(-1));
    const incrementRepeat = useRepeatPress(() => stepValue(1));

    if (!deck) return null;

    const value = commitBoundedInteger(valueDraft, bounds.initial, bounds.min, bounds.max);

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

    // Anki shows the availability line only for the two options that hand out more of today's
    // allowance; every other option builds a deck from a search instead.
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
            extendDeckTodayLimits(
                deck.id,
                option === 'newLimit' ? delta : 0,
                option === 'reviewLimit' ? delta : 0,
                settings.dayRolloverHour,
                // Anki extends the parents too whenever their limits still cap this deck.
                { includeParents: settings.limitsStartFromTop !== false },
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
            // Anki makes the session the current deck, so the learner lands on its overview.
            onSessionCreated(session.name);
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
                // A deck without a single tag has nothing to choose, so AnkiDroid skips the step
                // rather than opening an empty chooser.
                if (deckTags.length === 0) {
                    buildSession({ option: 'cram', kind: cramKind, cardLimit: value, includeTags: [], excludeTags: [] });
                    return;
                }
                setChoosingTags(true);
        }
    };

    /** Anki's Selective Study OK: an unticked "require" box drops the whole include list. */
    const submitTags = () => {
        const include = requireTags ? includeTags : [];
        if (include.length + excludeTags.length > CUSTOM_STUDY_MAX_TAGS) {
            alert(
                t('anki.customStudy'),
                l(
                    `En fazla ${CUSTOM_STUDY_MAX_TAGS} etiket seçilebilir. İstemediklerinizi değil istediklerinizi listelemek genellikle daha kolaydır; üst etiketi seçtiyseniz alt etiketlerini seçmeniz gerekmez.`,
                    `A maximum of ${CUSTOM_STUDY_MAX_TAGS} tags can be selected. Listing the tags you want instead of the ones you don’t want is usually simpler, and there is no need to select child tags if you have selected a parent tag.`,
                ),
            );
            return;
        }
        buildSession({
            option: 'cram',
            kind: cramKind,
            cardLimit: value,
            includeTags: include,
            excludeTags,
        });
    };

    /**
     * One of Anki's two multi-select tag lists. The "require" list starts disabled and is enabled
     * by its checkbox, exactly as taglimit.ui wires `activeCheck.toggled` to `activeList`.
     */
    const renderTagList = (
        selected: string[],
        setSelected: (next: string[]) => void,
        accessibilityPrefix: string,
        disabled: boolean = false,
    ) => (
        <ScrollView
            style={[styles.panel, styles.tagScroll, disabled && styles.panelDisabled]}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
        >
            {deckTags.map((tag, index) => {
                const active = selected.includes(tag);
                return (
                    <TouchableOpacity
                        key={`${accessibilityPrefix}-${tag}`}
                        style={[
                            styles.listRow,
                            styles.tagRow,
                            index === deckTags.length - 1 && styles.listRowLast,
                            active && styles.listRowActive,
                        ]}
                        onPress={() => setSelected(active ? selected.filter((entry) => entry !== tag) : [...selected, tag])}
                        disabled={disabled}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active, disabled }}
                        accessibilityLabel={`${accessibilityPrefix}: ${tagDisplayName(tag)}`}
                    >
                        <View style={[styles.checkbox, active && styles.checkboxActive]}>
                            {active && <Text style={styles.checkboxMark}>✓</Text>}
                        </View>
                        <Text style={[styles.listText, active && styles.listTextActive]} numberOfLines={2}>
                            {tagDisplayName(tag)}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );

    const renderTagSection = (
        label: string,
        selected: string[],
        setSelected: (next: string[]) => void,
        accessibilityPrefix: string,
        options: { disabled?: boolean; leading?: React.ReactNode } = {},
    ) => (
        <>
            <View style={styles.sectionHeader}>
                {options.leading}
                <Text style={[styles.fieldLabel, options.disabled && styles.fieldLabelDisabled]}>{label}</Text>
                {selected.length > 0 && (
                    <TouchableOpacity
                        onPress={() => setSelected([])}
                        accessibilityRole="button"
                        accessibilityLabel={l('Seçimi temizle', 'Clear selection')}
                    >
                        <Text style={styles.clearText}>{l('Temizle', 'Clear')}</Text>
                    </TouchableOpacity>
                )}
            </View>
            {renderTagList(selected, setSelected, accessibilityPrefix, options.disabled)}
        </>
    );

    // Anki's OK reads "Choose Tags" while the tag option is selected, because the session is
    // only built after the Selective Study step.
    const okLabel = !choosingTags && option === 'cram'
        ? l('Etiketleri seç', 'Choose Tags')
        : t('common.ok');

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
                        style={styles.scroll}
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        showsVerticalScrollIndicator={false}
                    >
                        {choosingTags ? (
                            <>
                                {renderTagSection(
                                    l('Şu etiketlerden en az biri gerekli:', 'Require one or more of these tags:'),
                                    includeTags,
                                    setIncludeTags,
                                    l('Gerekli etiket', 'Required tag'),
                                    {
                                        disabled: !requireTags,
                                        leading: (
                                            <TouchableOpacity
                                                style={[styles.checkbox, requireTags && styles.checkboxActive]}
                                                onPress={() => setRequireTags((previous) => !previous)}
                                                accessibilityRole="checkbox"
                                                accessibilityState={{ checked: requireTags }}
                                                accessibilityLabel={l('Etiket zorunlu kıl', 'Require tags')}
                                            >
                                                {requireTags && <Text style={styles.checkboxMark}>✓</Text>}
                                            </TouchableOpacity>
                                        ),
                                    },
                                )}
                                <View style={styles.sectionSpacer} />
                                {renderTagSection(
                                    l('Hariç tutulacak etiketleri seçin:', 'Select tags to exclude:'),
                                    excludeTags,
                                    setExcludeTags,
                                    l('Hariç tutulan etiket', 'Excluded tag'),
                                )}
                            </>
                        ) : (
                            <>
                                <View style={styles.panel}>
                                    {OPTIONS.map((candidate, index) => (
                                        <TouchableOpacity
                                            key={candidate}
                                            style={[
                                                styles.listRow,
                                                index === OPTIONS.length - 1 && styles.listRowLast,
                                                option === candidate && styles.listRowActive,
                                            ]}
                                            onPress={() => chooseOption(candidate)}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: option === candidate }}
                                        >
                                            <View style={[styles.radio, option === candidate && styles.radioActive]}>
                                                {option === candidate && <View style={styles.radioDot} />}
                                            </View>
                                            <Text style={[styles.listText, option === candidate && styles.listTextActive]}>
                                                {optionLabel(candidate)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={styles.group}>
                                    {availabilityLabel && <Text style={styles.availability}>{availabilityLabel}</Text>}

                                    <Text style={styles.fieldLabel}>{preSpinLabel()}</Text>
                                    <View style={styles.spinnerRow}>
                                        <TouchableOpacity
                                            style={styles.stepButton}
                                            {...decrementRepeat}
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
                                            onSubmitEditing={() => setValueDraft(String(value))}
                                            keyboardType={bounds.min < 0 ? 'numbers-and-punctuation' : 'number-pad'}
                                            inputMode={bounds.min < 0 ? 'text' : 'numeric'}
                                            maxLength={6}
                                            accessibilityLabel={preSpinLabel()}
                                        />
                                        <TouchableOpacity
                                            style={styles.stepButton}
                                            {...incrementRepeat}
                                            accessibilityRole="button"
                                            accessibilityLabel={l('Artır', 'Increase')}
                                        >
                                            <Text style={styles.stepText}>+</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.spinnerSuffix}>{postSpinLabel()}</Text>
                                    </View>

                                    {option === 'cram' && (
                                        <View style={[styles.panel, styles.cramList]}>
                                            {CUSTOM_STUDY_CRAM_KINDS.map((kind, index) => (
                                                <TouchableOpacity
                                                    key={kind}
                                                    style={[
                                                        styles.listRow,
                                                        index === CUSTOM_STUDY_CRAM_KINDS.length - 1 && styles.listRowLast,
                                                        cramKind === kind && styles.listRowActive,
                                                    ]}
                                                    onPress={() => setCramKind(kind)}
                                                    accessibilityRole="radio"
                                                    accessibilityState={{ selected: cramKind === kind }}
                                                >
                                                    <Text style={[styles.listText, cramKind === kind && styles.listTextActive]}>
                                                        {cramKindLabel(kind)}
                                                    </Text>
                                                    {cramKind === kind && <Text style={styles.check}>✓</Text>}
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <Text style={styles.note}>
                                    {l(
                                        'Yeni bir işlem, mevcut “Özel Çalışma Oturumu” destesini yeniden oluşturur. Mevcut oturumu korumak istiyorsanız önce adını değiştirin.',
                                        'A new action rebuilds the existing Custom Study Session deck. Rename the current session first if you want to keep it.',
                                    )}
                                </Text>
                            </>
                        )}
                    </ScrollView>

                    <View style={styles.buttonBox}>
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={choosingTags ? () => setChoosingTags(false) : onClose}
                            accessibilityRole="button"
                        >
                            <Text style={styles.secondaryButtonText}>
                                {choosingTags ? l('Geri', 'Back') : t('common.cancel')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primaryButton, !choosingTags && submitDisabled && styles.primaryButtonDisabled]}
                            onPress={choosingTags ? submitTags : submit}
                            disabled={!choosingTags && submitDisabled}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !choosingTags && submitDisabled }}
                        >
                            <Text style={styles.primaryButtonText}>{okLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </SwipeDismissSheet>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { flex: 1, justifyContent: 'flex-end' },
        backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
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
        // The sheet is sized by its content up to `maxHeight`; shrinking the scroller rather
        // than letting it grow keeps the button box on screen once the options run long.
        scroll: { flexShrink: 1 },
        content: { padding: Spacing.lg, paddingBottom: Spacing.lg },
        panel: {
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            overflow: 'hidden',
        },
        panelDisabled: { opacity: 0.45 },
        // Anki gives each tag list its own bounded, scrollable box so both stay reachable
        // however many tags the deck carries.
        tagScroll: { maxHeight: 260 },
        tagRow: { minHeight: 42, paddingVertical: 6 },
        listRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            minHeight: 50,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        listRowLast: { borderBottomWidth: 0 },
        listRowActive: { backgroundColor: colors.accentLight },
        listText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        listTextActive: { fontWeight: '700' },
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
        checkbox: {
            width: 22,
            height: 22,
            borderRadius: BorderRadius.sm,
            borderWidth: 2,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        checkboxActive: { borderColor: colors.accent, backgroundColor: colors.accent },
        checkboxMark: { fontSize: 13, lineHeight: 15, fontWeight: '900', color: colors.white },
        // Anki's group box: the availability line, the spinner sentence and the card-state list.
        group: {
            marginTop: Spacing.lg,
            padding: Spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgSecondary,
        },
        availability: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.sm },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
        sectionSpacer: { height: Spacing.lg },
        fieldLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary },
        fieldLabelDisabled: { color: colors.textMuted },
        clearText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
        spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
        stepButton: {
            width: 46,
            height: 46,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgCard,
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
            fontVariant: ['tabular-nums'] as any,
            color: colors.textPrimary,
        },
        spinnerSuffix: { flex: 1, fontSize: FontSize.sm, color: colors.textSecondary },
        cramList: { marginTop: Spacing.md },
        check: { fontSize: FontSize.md, color: colors.accent, fontWeight: '800' },
        buttonBox: {
            flexDirection: 'row',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        secondaryButton: {
            flex: 1,
            minHeight: 50,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
        },
        secondaryButtonText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        primaryButton: {
            flex: 1,
            minHeight: 50,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        primaryButtonDisabled: { opacity: 0.45 },
        primaryButtonText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        note: { fontSize: FontSize.xs, lineHeight: 18, color: colors.textMuted, marginTop: Spacing.md },
    });
}
