import type { Dispatch, SetStateAction } from 'react';
import { View, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Text } from '../AppText';
import { useRouter } from 'expo-router';
import { FontSize, type ColorScheme } from '../../constants/theme';
import type { StudyCard, AppSettings, Subject } from '../../lib/types';
import { FLAG_COLORS, type CardFlag, type Deck, type NoteType } from '../../lib/models';
import type { BrowserTableMode } from '../../lib/studyRepository';
import { humanizeCardText } from '../../lib/displayText';
import { cardFlagName, localizeNoteTypeName, localizeTopicName, type SupportedLocale } from '../../lib/i18n';
import { expandSelectedCardsToNotes, toggleSelectedSuspend } from '../../lib/browserSelection';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import { formatLastReview, formatNewPosition, formatNextDue, newQueuePosition } from './browserHelpers';
import PencilGlyph from '../PencilGlyph';
import FlagGlyph from '../FlagGlyph';
import StarGlyph from '../StarGlyph';
import CardsGlyph from '../CardsGlyph';
import { ClockGlyph, NoteGlyph, PauseGlyph, PlayGlyph } from '../UiGlyphs';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Choice';
import { SelectionSuspendIcon } from './BrowserIcons';

interface BrowserCardRowProps {
    item: StudyCard;
    browserFontScale: number;
    bumpDataVersion: () => void;
    colors: ColorScheme;
    deckById: Map<number, Deck>;
    expandedCard: number | null;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    noteTypes: NoteType[];
    reload: () => void;
    router: ReturnType<typeof useRouter>;
    selectedCardIds: Set<number>;
    selectionMode: boolean;
    setExpandedCard: Dispatch<SetStateAction<number | null>>;
    setSelectionMode: Dispatch<SetStateAction<boolean>>;
    settings: AppSettings;
    showAnswerSnippet: boolean;
    showScheduleDetails: boolean;
    styles: BrowserStyles;
    subject: (id: string) => Subject | undefined;
    t: BrowserI18n['t'];
    tableMode: BrowserTableMode;
    toggleCardSelection: (cardId: number) => void;
    toggleSuspend: (cardId: number, isSuspended: boolean) => void;
}

/** One row of the card list: the card or note, its meta line and its expanded details. */
export function BrowserCardRow({
    item,
    browserFontScale,
    bumpDataVersion,
    colors,
    deckById,
    expandedCard,
    l,
    locale,
    noteTypes,
    reload,
    router,
    selectedCardIds,
    selectionMode,
    setExpandedCard,
    setSelectionMode,
    settings,
    showAnswerSnippet,
    showScheduleDetails,
    styles,
    subject,
    t,
    tableMode,
    toggleCardSelection,
    toggleSuspend,
}: BrowserCardRowProps) {
    const isExpanded = expandedCard === item.cardId;
    const isSelected = selectedCardIds.has(item.cardId);
    const sub = subject(item.subject);
    const flag = (item.rawCard?.flags ?? 0) as CardFlag;
    const noteSummary = item.browserNoteSummary;
    const isNotesMode = tableMode === 'notes' && noteSummary !== undefined;
    const rowNoteType = item.rawNote
        ? noteTypes.find((noteType) => noteType.id === item.rawNote?.noteTypeId)
        : undefined;

    const isNewCard = item.state.status === 'new';
    const newPosition = isNewCard ? newQueuePosition(item.rawCard) : null;
    // Anki's Deck column names the home deck of a card a filtered deck holds: "Filter (Home)".
    const deckName = deckById.get(item.deckId)?.name ?? sub?.name ?? item.subject;
    const homeDeckName = item.rawCard?.odid ? deckById.get(item.rawCard.odid)?.name : undefined;
    const cardDeckText = (homeDeckName ? `${deckName} (${homeDeckName})` : deckName).replaceAll('::', ' › ');
    const statusColor = item.state.status === 'learning' ? colors.badgeLearn : colors.badgeReview;
    const statusBg = item.state.status === 'learning' ? colors.badgeLearnBg : colors.badgeReviewBg;
    const noteDeckText = isNotesMode
        ? noteSummary.deckCount > 1
            ? l(`${noteSummary.deckCount} deste`, `${noteSummary.deckCount} decks`)
            : (noteSummary.deckNames[0] ?? deckById.get(item.deckId)?.name ?? item.subject).replaceAll('::', ' › ')
        : '';
    const noteScheduleText = isNotesMode
        ? [
            l(`${noteSummary.cardCount} kart`, `${noteSummary.cardCount} cards`),
            noteSummary.averageIntervalDays == null
                ? null
                : l(`Ort. aralık ${noteSummary.averageIntervalDays.toFixed(1)} gün`, `Avg. interval ${noteSummary.averageIntervalDays.toFixed(1)} days`),
            l(`${noteSummary.totalReviews} tekrar`, `${noteSummary.totalReviews} reviews`),
        ].filter(Boolean).join(' · ')
        : '';

    return (
        <TouchableOpacity
            style={[
                styles.cardItem,
                // The whole row carries the state, so the tint is unbroken rather than painted
                // onto the header, the answer box and the detail block separately. Selection
                // comes last: while picking cards, what is selected matters more than why a
                // row is out of the queue.
                !isNotesMode && item.state.suspended && styles.cardSuspended,
                !isNotesMode && !item.state.suspended && item.state.buried && styles.cardBuried,
                isSelected && styles.cardItemSelected,
            ]}
            onPress={() => selectionMode
                ? toggleCardSelection(item.cardId)
                : setExpandedCard(isExpanded ? null : item.cardId)}
            onLongPress={() => {
                if (!selectionMode) setSelectionMode(true);
                toggleCardSelection(item.cardId);
            }}
            activeOpacity={0.7}
            // react-native-web renders the button role as a <button>, and this row holds the
            // edit button, which a <button> may not contain. On web the row stays a focusable
            // element that Enter toggles, and the edit button keeps the button role.
            accessibilityRole={selectionMode ? 'checkbox' : Platform.OS === 'web' ? undefined : 'button'}
            focusable={Platform.OS === 'web' ? true : undefined}
            accessibilityState={selectionMode ? { checked: isSelected } : undefined}
            aria-checked={selectionMode ? isSelected : undefined}
        >
            <View style={styles.cardItemHeader}>
                {selectionMode && <Checkbox checked={isSelected} />}
                <View style={local.cardIcon}>
                    {isNotesMode
                        ? <NoteGlyph color={colors.textSecondary} size={17} />
                        : <CardsGlyph color={colors.textSecondary} size={17} />}
                </View>
                <View style={styles.cardBody}>
                    <Text
                        style={[
                            styles.cardQuestion,
                            {
                                fontSize: 13 * browserFontScale,
                                lineHeight: 18 * browserFontScale,
                            },
                        ]}
                        numberOfLines={isExpanded ? undefined : 1}
                    >
                        {humanizeCardText(item.question, { showAudioFilenames: settings.showBrowserAudioFilenames }) || l('(boş)', '(empty)')}
                    </Text>
                    <View style={[styles.cardMeta]}>
                        <Text style={[styles.cardTopic]} numberOfLines={1}>
                            {isNotesMode
                                ? `${rowNoteType ? localizeNoteTypeName(locale, rowNoteType.name) : l('Not', 'Note')} · ${noteDeckText}`
                                : `${cardDeckText}${item.topic ? ` · ${localizeTopicName(locale, item.topic)}` : ''}`}
                        </Text>
                        {!isNotesMode && item.state.status !== 'new' ? (
                            <View style={[styles.statusDot, { backgroundColor: statusBg }]}>
                                <Text style={[styles.statusDotText, { color: statusColor }]}>
                                    {item.state.status === 'learning' ? t('anki.learn') : t('anki.review')}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    {showAnswerSnippet && !isExpanded && (
                        <Text
                            style={[
                                styles.answerSnippet,
                                { fontSize: 11 * browserFontScale, lineHeight: 15 * browserFontScale },
                            ]}
                            numberOfLines={1}
                        >
                            {humanizeCardText(item.answer, { showAudioFilenames: settings.showBrowserAudioFilenames }) || '—'}
                        </Text>
                    )}
                    {showScheduleDetails && (
                        <View style={local.scheduleRow}>
                            {isNotesMode
                                ? <CardsGlyph color={styles.scheduleMeta.color} size={Math.round(11 * browserFontScale)} />
                                : <ClockGlyph color={styles.scheduleMeta.color} size={Math.round(11 * browserFontScale)} />}
                            <Text
                                style={[
                                    styles.scheduleMeta,
                                    local.scheduleText,
                                    { fontSize: 10 * browserFontScale, lineHeight: 13 * browserFontScale },
                                ]}
                                numberOfLines={1}
                            >
                                {isNotesMode
                                    ? noteScheduleText
                                    : `${l('Son:', 'Last:')} ${formatLastReview(item.state.lastReviewedAtMs, locale)} · ${l('Sonraki:', 'Next:')} ${formatNextDue(item.state, settings.dayRolloverHour, locale, newPosition)}`}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={[styles.cardActions]}>
                    {!selectionMode && (
                        <TouchableOpacity
                            style={[styles.editBtn]}
                            onPress={() => router.push(`/editor?cardId=${item.cardId}`)}
                            // The pencil is drawn small to keep the row compact; the slop is a finger's target.
                            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={isNotesMode ? l('Notu düzenle', 'Edit note') : l('Kartı düzenle', 'Edit card')}
                        >
                            <PencilGlyph color={colors.textSecondary} size={18} />
                        </TouchableOpacity>
                    )}
                    {item.noteMarked && (
                        <View style={styles.statusIcon} accessible accessibilityLabel={l('Not işaretli', 'Note is marked')}>
                            <StarGlyph color={colors.marked} size={14} />
                        </View>
                    )}
                    {!isNotesMode && flag > 0 && (
                        <View
                            style={styles.statusIcon}
                            accessible
                            accessibilityLabel={l(`Bayrak: ${cardFlagName(locale, flag)}`, `Flag: ${cardFlagName(locale, flag)}`)}
                        >
                            <FlagGlyph color={FLAG_COLORS[flag].color} size={14} filled />
                        </View>
                    )}
                    {!isNotesMode && item.state.suspended && (
                        <View style={styles.statusIcon} accessible accessibilityLabel={l('Askıda', 'Suspended')}>
                            <SelectionSuspendIcon color={colors.warning} size={14} />
                        </View>
                    )}
                </View>
            </View>

            {isExpanded && !selectionMode && (
                <View style={styles.expandedContent}>
                    <View style={styles.answerBox}>
                        <Text style={styles.answerLabel}>{isNotesMode ? l('İLK KARTIN CEVABI', 'FIRST CARD ANSWER') : l('CEVAP', 'ANSWER')}</Text>
                        <Text style={[styles.answerContent, { fontSize: FontSize.md * browserFontScale, lineHeight: 22 * browserFontScale }]}>{humanizeCardText(item.answer, { showAudioFilenames: settings.showBrowserAudioFilenames }) || '—'}</Text>
                    </View>

                    <View style={styles.cardDetails}>
                        {isNotesMode ? (
                            <>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Oluşturulan kartlar', 'Generated cards')}</Text>
                                    <Text style={styles.detailValue}>{noteSummary.cardCount}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Desteler', 'Decks')}</Text>
                                    <Text style={styles.detailValue}>{noteSummary.deckCount}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Ortalama aralık', 'Average interval')}</Text>
                                    <Text style={styles.detailValue}>{noteSummary.averageIntervalDays == null ? '—' : `${noteSummary.averageIntervalDays.toFixed(1)} ${l('gün', 'days')}`}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Ortalama kolaylık', 'Average ease')}</Text>
                                    <Text style={styles.detailValue}>{noteSummary.averageEaseFactor == null ? l('Yeni', 'New') : noteSummary.averageEaseFactor.toFixed(2)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Toplam tekrar / unutma', 'Total reviews / lapses')}</Text>
                                    <Text style={styles.detailValue}>{noteSummary.totalReviews} / {noteSummary.totalLapses}</Text>
                                </View>
                            </>
                        ) : (
                            <>
                                {/* A new card has no interval or ease yet, and its due is a queue
                                    position, not a date: Anki shows "(new)" and "New #12". */}
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Aralık', 'Interval')}</Text>
                                    <Text style={styles.detailValue}>{isNewCard ? l('(yeni)', '(new)') : `${item.state.interval} ${l('gün', 'days')}`}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Kolaylık', 'Ease')}</Text>
                                    <Text style={styles.detailValue}>{isNewCard ? l('(yeni)', '(new)') : item.state.easeFactor.toFixed(2)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>{l('Sonraki gösterim', 'Due')}</Text>
                                    <Text style={styles.detailValue}>
                                        {isNewCard
                                            ? newPosition !== null ? formatNewPosition(newPosition, locale) : l('Yeni', 'New')
                                            : item.state.status === 'learning' ? l('Öğrenme sırasında', 'In learning') : item.state.dueDate}
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>

                    <Button
                        variant="secondary"
                        size="compact"
                        onPress={() => {
                            if (isNotesMode) {
                                toggleSelectedSuspend(expandSelectedCardsToNotes([item.cardId]), settings.dayRolloverHour);
                                bumpDataVersion();
                                reload();
                            } else {
                                toggleSuspend(item.cardId, item.state.suspended);
                            }
                        }}
                        icon={item.state.suspended
                            ? <PlayGlyph color={colors.textPrimary} size={14} />
                            : <PauseGlyph color={colors.textPrimary} size={14} />}
                        label={isNotesMode
                            ? item.state.suspended
                                ? l('Notun kartlarını askıdan çıkar', 'Unsuspend Note Cards')
                                : l('Notun kartlarını askıya al', 'Suspend Note Cards')
                            : item.state.suspended
                                ? l('Askıdan çıkar', 'Unsuspend')
                                : t('anki.suspend')}
                    />
                </View>
            )}
        </TouchableOpacity>
    );
}

const local = StyleSheet.create({
    cardIcon: { marginTop: 1 },
    scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    scheduleText: { flex: 1, minWidth: 0, marginTop: 0 },
});
