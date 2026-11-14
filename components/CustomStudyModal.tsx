/**
 * Custom Study follows Anki's dialog (qt/aqt/customstudy.py), with five options driving one
 * spinner (new cards have no daily cap), and the Selective Study tag chooser (qt/aqt/taglimit.py) its "study by card state or
 * tag" option opens. What each option searches for, how it orders the session and whether it
 * reschedules lives in lib/customStudy.ts.
 *
 * The dialog is laid out the way Anki lays it out: the radio list, then one group holding the
 * availability line, the "<label> [spinner] <unit>" sentence and the card-state list, then the
 * Cancel/OK button box whose OK becomes "Choose Tags" for the tag option.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text, TextInput } from './AppText';
import { FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { commitBoundedInteger, sanitizeSignedIntegerDraft, stepBoundedIntegerDraft } from '../lib/boundedNumber';
import { alert } from '../lib/confirm';
import { Button } from './ui/Button';
import { Card, Divider, SectionLabel } from './ui/Card';
import { Checkbox, SelectedMark } from './ui/Choice';
import { AppSheet } from './ui/Sheet';
import { Stepper } from './ui/Stepper';
import { DISABLED_OPACITY, HIT_TARGET, Radius, Type } from './ui/tokens';
import {
    CUSTOM_STUDY_CRAM_KINDS,
    CUSTOM_STUDY_MAX_TAGS,
    customStudyDeckName,
    customStudySessionConfig,
    customStudyTagSelection,
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
    getCustomStudySessionToReplace,
    rememberCustomStudyExtend,
    rememberCustomStudyTags,
} from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { getAllTags } from '../lib/noteManager';
import { getFilteredDeckGatherCount } from '../lib/studyRepository';
import { isValidSearchQuery } from '../lib/searchValidation';
import type { AppSettings } from '../lib/types';

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
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [option, setOption] = useState<CustomStudyOption>('reviewLimit');
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
        const tags = getAllTags({ deckIds: deckSubtreeIds(deck) });
        setDeckTags(tags);
        // Anki marks the deck's current tags as included/excluded rather than replaying the stored
        // lists, so a tag the deck no longer carries drops out of the selection — and with it the
        // "require one or more of these tags" tick, which Anki only sets for a tag it listed.
        const selection = customStudyTagSelection(tags, deckDefaults);
        setIncludeTags(selection.includeTags);
        setExcludeTags(selection.excludeTags);
        setRequireTags(selection.requireTags);
        setChoosingTags(false);
        setCramKind('new');
        setOption('reviewLimit');
        setValueDraft(String(customStudyValueBounds('reviewLimit', deckDefaults).initial));
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
                // Anki extends a parent's allowance only while `apply_all_parent_limits` is on,
                // because only then can that parent still hold this deck back.
                { includeParents: settings.limitsStartFromTop === true },
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
        // The session's search is composed from the deck and tag names; collection reads would
        // treat one the parser cannot read as matching nothing, so say so instead of saving it.
        if (!isValidSearchQuery(config.search)) {
            alert(t('anki.invalidSearchTitle'), t('anki.invalidSearchMessage', { search: config.search }));
            return;
        }

        try {
            // Anki refuses to build an empty session and leaves the dialog open so the criteria
            // can be widened, rather than creating a deck with nothing in it.
            // The run rebuilds the existing session in place, so that session's cards count.
            const matches = getFilteredDeckGatherCount(settings, {
                search: config.search,
                limit: config.limit,
                order: config.order,
            }, getCustomStudySessionToReplace(customStudyDeckName(locale)));
            if (matches === 0) {
                alert(
                    t('anki.customStudy'),
                    l('Verdiğiniz ölçütlere uyan kart bulunamadı.', 'No cards matched the criteria you provided.'),
                );
                return;
            }

            const session = createOrReplaceCustomStudySession(deck.id, config, customStudyDeckName(locale));
            if (!session) {
                alert(
                    t('anki.customStudy'),
                    l(
                        `Lütfen önce mevcut “${customStudyDeckName(locale)}” destesini yeniden adlandırın.`,
                        `Please rename the existing “${customStudyDeckName(locale)}” deck first.`,
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
        // Anki's tag chooser closes before the session is built, so a build that gathers nothing
        // leaves the learner back on the option list — where the criteria can be widened — rather
        // than in front of the tag lists it already accepted.
        setChoosingTags(false);
        buildSession({
            option: 'cram',
            kind: cramKind,
            cardLimit: value,
            includeTags: include,
            excludeTags,
        });
    };

    /**
     * One row of a single-choice list (Anki's radio buttons): the chosen row is tinted and ends in
     * the tick every single-choice list in the app uses.
     */
    const renderChoiceRow = (key: string, label: string, selected: boolean, onPress: () => void) => (
        <TouchableOpacity
            key={key}
            style={[styles.listRow, selected && styles.listRowActive]}
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            aria-checked={selected}
        >
            <Text style={[styles.listText, selected && styles.listTextActive]}>{label}</Text>
            <SelectedMark visible={selected} />
        </TouchableOpacity>
    );

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
        <Card style={disabled && styles.disabled}>
            <ScrollView style={styles.tagScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {deckTags.map((tag, index) => {
                    const active = selected.includes(tag);
                    return (
                        <React.Fragment key={`${accessibilityPrefix}-${tag}`}>
                            {index > 0 ? <Divider /> : null}
                            <TouchableOpacity
                                style={[styles.listRow, styles.tagRow, active && styles.listRowActive]}
                                onPress={() => setSelected(active ? selected.filter((entry) => entry !== tag) : [...selected, tag])}
                                disabled={disabled}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: active, disabled }}
                                aria-checked={active}
                                accessibilityLabel={`${accessibilityPrefix}: ${tagDisplayName(tag)}`}
                            >
                                <Checkbox checked={active} />
                                <Text style={[styles.listText, active && styles.listTextActive]} numberOfLines={2}>
                                    {tagDisplayName(tag)}
                                </Text>
                            </TouchableOpacity>
                        </React.Fragment>
                    );
                })}
            </ScrollView>
        </Card>
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
                <Text style={[styles.fieldLabel, styles.sectionLabel, options.disabled && styles.fieldLabelDisabled]}>{label}</Text>
                {selected.length > 0 && (
                    <Button
                        label={l('Temizle', 'Clear')}
                        accessibilityLabel={l('Seçimi temizle', 'Clear selection')}
                        variant="plain"
                        size="compact"
                        onPress={() => setSelected([])}
                    />
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
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={choosingTags ? l('Seçmeli çalışma', 'Selective Study') : t('anki.customStudy')}
            subtitle={getDeckDisplayName(deck.name)}
            closeButton
            dividedHeader
            avoidKeyboard
            maxHeight="92%"
            backdropLabel={t('common.close')}
        >
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
            >
                <SectionLabel>{l('Çalışma kapsamı', 'Study scope')}</SectionLabel>
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
                                        style={styles.checkTarget}
                                        onPress={() => setRequireTags((previous) => !previous)}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: requireTags }}
                                        aria-checked={requireTags}
                                        accessibilityLabel={l('Etiket zorunlu kıl', 'Require tags')}
                                    >
                                        <Checkbox checked={requireTags} />
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
                        <Card divided>
                            {OPTIONS.map((candidate) => renderChoiceRow(
                                candidate,
                                optionLabel(candidate),
                                option === candidate,
                                () => chooseOption(candidate),
                            ))}
                        </Card>

                        <Card padded style={styles.group}>
                            {availabilityLabel && <Text style={styles.availability}>{availabilityLabel}</Text>}

                            <View style={styles.spinnerBlock}>
                                <Text style={styles.fieldLabel}>{preSpinLabel()}</Text>
                                <View style={styles.spinnerRow}>
                                    <Stepper
                                        onDecrement={() => stepValue(-1)}
                                        onIncrement={() => stepValue(1)}
                                        decrementLabel={l('Azalt', 'Decrease')}
                                        incrementLabel={l('Artır', 'Increase')}
                                    >
                                        <TextInput
                                            style={[styles.spinnerInput, { color: colors.accent }]}
                                            value={valueDraft}
                                            onChangeText={(next) => setValueDraft(sanitizeSignedIntegerDraft(next, 5))}
                                            onBlur={() => setValueDraft(String(value))}
                                            onSubmitEditing={() => setValueDraft(String(value))}
                                            keyboardType={bounds.min < 0 ? 'numbers-and-punctuation' : 'number-pad'}
                                            inputMode={bounds.min < 0 ? 'text' : 'numeric'}
                                            maxLength={6}
                                            selectionColor={colors.accent}
                                            accessibilityLabel={preSpinLabel()}
                                        />
                                    </Stepper>
                                    <Text style={styles.spinnerSuffix}>{postSpinLabel()}</Text>
                                </View>
                            </View>

                            {option === 'cram' && (
                                <View style={styles.insetList}>
                                    {CUSTOM_STUDY_CRAM_KINDS.map((kind, index) => (
                                        <React.Fragment key={kind}>
                                            {index > 0 ? <Divider /> : null}
                                            {renderChoiceRow(kind, cramKindLabel(kind), cramKind === kind, () => setCramKind(kind))}
                                        </React.Fragment>
                                    ))}
                                </View>
                            )}
                        </Card>

                        {buildsSession && (
                            <Text style={styles.note}>
                                {l(
                                    'Yeni bir işlem, mevcut “Özel Çalışma Oturumu” destesini yeniden oluşturur. Mevcut oturumu korumak istiyorsanız önce adını değiştirin.',
                                    'A new action rebuilds the existing Custom Study Session deck. Rename the current session first if you want to keep it.',
                                )}
                            </Text>
                        )}
                    </>
                )}
            </ScrollView>

            <View style={styles.buttonBox}>
                <Button
                    label={choosingTags ? l('Geri', 'Back') : t('common.cancel')}
                    variant="plain"
                    onPress={choosingTags ? () => setChoosingTags(false) : onClose}
                    style={styles.boxButton}
                />
                <Button
                    label={okLabel}
                    onPress={choosingTags ? submitTags : submit}
                    disabled={!choosingTags && submitDisabled}
                    style={styles.boxButton}
                />
            </View>
        </AppSheet>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        // The sheet is sized by its content up to `maxHeight`; shrinking the scroller rather
        // than letting it grow keeps the button box on screen once the options run long.
        scroll: { flexShrink: 1 },
        content: { gap: Spacing.sm, paddingBottom: Spacing.lg },
        disabled: { opacity: DISABLED_OPACITY },
        // Anki gives each tag list its own bounded, scrollable box so both stay reachable
        // however many tags the deck carries.
        tagScroll: { maxHeight: 260 },
        tagRow: { minHeight: HIT_TARGET, paddingVertical: 6 },
        listRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            minHeight: 50,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
        },
        listRowActive: { backgroundColor: colors.accentLight },
        listText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        listTextActive: { fontWeight: '600' },
        // A full-size target around the 22-point box, which stays flush with the lists below it.
        checkTarget: { width: HIT_TARGET, height: HIT_TARGET, marginLeft: -(HIT_TARGET - 22) / 2, alignItems: 'center', justifyContent: 'center' },
        // Anki's group box: the availability line, the spinner sentence and the card-state list.
        group: { marginTop: Spacing.sm },
        availability: { ...Type.caption, fontWeight: '600', color: colors.textPrimary },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: HIT_TARGET },
        sectionLabel: { flex: 1 },
        sectionSpacer: { height: Spacing.sm },
        fieldLabel: { ...Type.caption, fontWeight: '600', color: colors.textSecondary },
        fieldLabelDisabled: { color: colors.textMuted },
        spinnerBlock: { gap: Spacing.sm },
        spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
        spinnerInput: {
            minWidth: 58,
            paddingVertical: 0,
            paddingHorizontal: Spacing.xs,
            textAlign: 'center',
            fontSize: FontSize.lg,
            fontWeight: '600',
            fontVariant: ['tabular-nums'] as any,
        },
        spinnerSuffix: { flex: 1, fontSize: FontSize.sm, color: colors.textSecondary },
        insetList: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.inset, overflow: 'hidden' },
        note: { ...Type.caption, color: colors.textMuted, marginTop: Spacing.sm },
        buttonBox: {
            flexDirection: 'row',
            gap: Spacing.sm,
            paddingTop: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        boxButton: { flex: 1 },
    });
}
