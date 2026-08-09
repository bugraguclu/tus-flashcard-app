import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    Modal,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Pressable,
    type TextStyle,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { resolveSubjectDeckId } from '../lib/subjects';
import { confirm, alert } from '../lib/confirm';
import { useApp } from '../contexts/AppContext';
import {
    createTusCard,
    updateTusCardByCardId,
    deleteTusCardByCardId,
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    getSearchIndexCards,
    searchIndexCardFromNote,
} from '../lib/noteManager';
import { buildDeckTree, flattenDeckTree, getAllDecks, getDeck, getDeckByName } from '../lib/deckManager';
import { BUILTIN_NOTE_TYPES, getDeckDisplayName, type AnkiCard, type Note } from '../lib/models';
import CardWebView from '../components/CardWebView';
import MediaAttachButton, { FIELD_MEDIA_RE, type MediaAttachButtonHandle } from '../components/MediaAttachButton';
import RichTextEditor, {
    type RichTextCommand,
    type RichTextEditorHandle,
} from '../components/RichTextEditor';
import TagPickerModal from '../components/TagPickerModal';
import { dbDeleteFtsCard, dbIndexAllCards, dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import { loadSettings } from '../lib/storage';

function parseCardId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function appendSnippet(fieldText: string, snippet: string): string {
    if (!fieldText.trim()) return snippet;
    return `${fieldText}<br>${snippet}`;
}

function fieldHasContent(value: string): boolean {
    if (FIELD_MEDIA_RE.test(value)) return true;
    return value
        .replace(/<br\s*\/?>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .trim().length > 0;
}

type EditorField = 'question' | 'answer' | 'reverseAnswer';

const CARD_TYPE_CHOICES: { id: number; icon: string }[] = [
    { id: 4, icon: '📄' },
    { id: 5, icon: '⌨️' },
    { id: 6, icon: '🔁' },
];

export default function EditorScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { bumpDataVersion, dataVersion, activeDeckName } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const routeCardId = useMemo(() => {
        const explicitCardId = parseCardId(params.cardId);
        if (explicitCardId) return explicitCardId;

        // Legacy route param fallback.
        const legacyId = parseCardId(params.id);
        if (!legacyId) return null;
        return legacyId;
    }, [params.cardId, params.id]);

    const routeDeckId = useMemo(() => parseCardId(params.deckId), [params.deckId]);

    // Anki's add dialog has one explicit destination deck. Legacy routes that still pass a
    // subject are translated to that subject's deck, but subject/topic are no longer editor rows.
    const [targetDeckId, setTargetDeckId] = useState<number | null>(() => {
        if (routeCardId) return null;
        const requestedDeck = routeDeckId ? getDeck(routeDeckId) : null;
        if (requestedDeck && !requestedDeck.isFiltered) return requestedDeck.id;
        const legacySubject = typeof params.subject === 'string' ? params.subject : null;
        const legacySubjectDeck = legacySubject ? getDeck(resolveSubjectDeckId(legacySubject)) : null;
        if (legacySubjectDeck && !legacySubjectDeck.isFiltered) return legacySubjectDeck.id;
        if (loadSettings().newCardDeckMode === 'default') {
            return getDeckByName('Varsayılan')?.id ?? getDeck(1)?.id ?? null;
        }
        const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
        if (activeDeck && !activeDeck.isFiltered) return activeDeck.id;
        return getDeck(1)?.id ?? getAllDecks().find((deck) => !deck.isFiltered)?.id ?? null;
    });
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [showCardTypePicker, setShowCardTypePicker] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [colorPickerMode, setColorPickerMode] = useState<'text' | 'highlight' | null>(null);
    const [activeField, setActiveField] = useState<EditorField>('question');
    const [activeFormats, setActiveFormats] = useState<string[]>([]);
    const questionEditorRef = useRef<RichTextEditorHandle>(null);
    const answerEditorRef = useRef<RichTextEditorHandle>(null);
    const reverseEditorRef = useRef<RichTextEditorHandle>(null);
    const questionMediaRef = useRef<MediaAttachButtonHandle>(null);
    const answerMediaRef = useRef<MediaAttachButtonHandle>(null);
    const reverseMediaRef = useRef<MediaAttachButtonHandle>(null);

    const [question, setQuestion] = useState((params.question as string) || '');
    const [answer, setAnswer] = useState((params.answer as string) || '');
    const [cardTypeId, setCardTypeId] = useState(4);
    const [reverseAnswer, setReverseAnswer] = useState('');
    const [noteTags, setNoteTags] = useState<string[]>([]);
    const [preservedFields, setPreservedFields] = useState<string[]>([]);
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));

    const targetDeck = useMemo(() => {
        if (targetDeckId) return getDeck(targetDeckId);
        if (activeDeckName) return getDeckByName(activeDeckName) ?? getDeck(1);
        return getDeck(1);
    }, [targetDeckId, activeDeckName, dataVersion]);

    const deckPickerRows = useMemo(
        () => flattenDeckTree(buildDeckTree(getAllDecks()), true)
            .filter((node) => !node.deck.isFiltered),
        [dataVersion, showDeckPicker],
    );

    const previewPayload = useMemo(() => {
        if (!showPreview) return null;
        const noteType = getNoteType(cardTypeId) || BUILTIN_NOTE_TYPES.find((entry) => entry.id === cardTypeId)!;
        const fields = preservedFields.length > 0 ? [...preservedFields] : ['', '', ''];
        fields[0] = question || l('(boş soru)', '(empty question)');
        fields[1] = answer || l('(boş cevap)', '(empty answer)');
        if (cardTypeId === 6) fields[3] = reverseAnswer.trim();
        const note: Note = {
            id: -1,
            guid: 'preview',
            noteTypeId: noteType.id,
            mod: 0,
            usn: -1,
            tags: noteTags,
            fields,
            sfld: question,
            csum: 0,
            flags: 0,
        };
        const card: AnkiCard = {
            id: -1, noteId: -1, deckId: targetDeck?.id ?? 1, ord: 0, mod: 0, usn: -1,
            type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0,
            left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        };
        return { noteType, note, card };
    }, [showPreview, question, answer, targetDeck?.id, cardTypeId, reverseAnswer, noteTags, preservedFields, l]);

    useEffect(() => {
        if (!routeCardId) return;

        const card = getAnkiCard(routeCardId);
        if (!card) return;
        const note = getNote(card.noteId);
        if (!note) return;

        // Editing follows the card's actual deck. Extra legacy/imported fields and tags remain
        // intact even though the compact add screen only exposes Anki's Type and Deck selectors.
        setTargetDeckId(card.deckId);
        setQuestion(note.fields[0] || note.sfld || '');
        setAnswer(note.fields[1] || '');
        setNoteTags(note.tags);
        setPreservedFields(note.fields);
        setCardTypeId([4, 5, 6].includes(note.noteTypeId) ? note.noteTypeId : 4);
        setReverseAnswer(note.noteTypeId === 6 ? (note.fields[3] || '') : '');
        setIsEditing(true);
    }, [routeCardId]);

    useEffect(() => {
        if (routeCardId || targetDeckId !== null) return;
        if (loadSettings().newCardDeckMode === 'default') {
            setTargetDeckId(getDeckByName('Varsayılan')?.id ?? getDeck(1)?.id ?? null);
            return;
        }
        const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
        setTargetDeckId(activeDeck && !activeDeck.isFiltered ? activeDeck.id : (getDeck(1)?.id ?? null));
    }, [routeCardId, targetDeckId, activeDeckName]);

    const cardTypeLabel = cardTypeId === 4
        ? l('Temel', 'Basic')
        : cardTypeId === 5
            ? l('Yazarak Yanıtla', 'Basic (type in the answer)')
            : l('Çift Taraflı', 'Basic (and reversed card)');

    const activeEditorRef = () => {
        if (activeField === 'answer') return answerEditorRef;
        if (activeField === 'reverseAnswer') return reverseEditorRef;
        return questionEditorRef;
    };

    const activeMediaRef = () => {
        if (activeField === 'answer') return answerMediaRef;
        if (activeField === 'reverseAnswer') return reverseMediaRef;
        return questionMediaRef;
    };

    const runEditorCommand = (command: RichTextCommand, value?: string) => {
        activeEditorRef().current?.runCommand(command, value);
    };

    const openPreview = () => {
        Keyboard.dismiss();
        setShowPreview(true);
    };

    const handleBack = () => {
        if (!fieldHasContent(question) && !fieldHasContent(answer)) {
            router.back();
            return;
        }
        confirm(
            l('Değişiklikleri At?', 'Discard Changes?'),
            l('Kaydetmeden kart ekleme ekranından çıkılsın mı?', 'Leave the editor without saving?'),
            () => router.back(),
            { destructive: true },
        );
    };

    const requestClearFields = () => {
        setShowOverflowMenu(false);
        confirm(
            l('Alanları Temizle', 'Clear Fields'),
            l('Soru ve cevap alanlarındaki içerik temizlensin mi?', 'Clear the contents of the question and answer fields?'),
            () => {
                setQuestion('');
                setAnswer('');
                setReverseAnswer('');
                questionEditorRef.current?.focus();
            },
            { destructive: true },
        );
    };

    const runAfterOverflowClose = (action: () => void) => {
        setShowOverflowMenu(false);
        setTimeout(action, Platform.OS === 'ios' ? 220 : 0);
    };

    const applyEditorColor = (color: string) => {
        const mode = colorPickerMode;
        setColorPickerMode(null);
        if (!mode) return;
        setTimeout(() => runEditorCommand(mode === 'text' ? 'foreColor' : 'hiliteColor', color), Platform.OS === 'ios' ? 180 : 0);
    };

    const rebuildSearchIndex = () => {
        const cards = getSearchIndexCards();
        dbIndexAllCards(cards);
    };

    const handleSave = () => {
        setShowOverflowMenu(false);
        if (!fieldHasContent(question) || !fieldHasContent(answer)) {
            alert(t('common.error'), l('Soru ve cevap alanları boş bırakılamaz.', 'Question and answer fields cannot be empty.'));
            return;
        }
        if (!targetDeck || targetDeck.isFiltered) {
            alert(t('common.error'), l('Lütfen kart için bir deste seçin.', 'Please choose a deck for the card.'));
            return;
        }

        try {
            if (isEditing && routeCardId) {
                const updated = updateTusCardByCardId(routeCardId, {
                    question: question.trim(),
                    answer: answer.trim(),
                    tags: noteTags,
                    reverseAnswer: cardTypeId === 6 ? reverseAnswer : undefined,
                    deckId: targetDeck.id,
                });

                if (!updated) {
                    alert(t('common.error'), l('Kart güncellenemedi.', 'Could not update the card.'));
                    return;
                }

                // A reversed note has two sibling cards sharing this content — keep both in the
                // search index, not just the one being edited.
                for (const sibling of getCardsForNote(updated.note.id)) {
                    dbUpsertFtsCard(searchIndexCardFromNote(updated.note, sibling.id));
                }

                bumpDataVersion();
                alert(t('common.completed'), l('Kart güncellendi.', 'Card updated.'), () => router.back());
            } else {
                const created = createTusCard({
                    question: question.trim(),
                    answer: answer.trim(),
                    tags: noteTags,
                    deckId: targetDeck.id,
                    noteTypeId: cardTypeId,
                    reverseAnswer: cardTypeId === 6 ? reverseAnswer : undefined,
                });

                for (const generatedCard of created.cards) {
                    dbUpsertFtsCard(searchIndexCardFromNote(created.note, generatedCard.id));
                }

                bumpDataVersion();
                alert(t('common.completed'), l('Kart kaydedildi.', 'Card saved.'), () => router.back());
            }
        } catch (e) {
            console.warn('[Editor] save failed:', e);
            alert(t('common.error'), l('Kart kaydedilemedi.', 'Could not save the card.'));
        }
    };

    const handleDelete = () => {
        if (!routeCardId) return;

        confirm(l('Kartı Sil', 'Delete Card'), l('Bu kartı silmek istediğinizden emin misiniz?', 'Are you sure you want to delete this card?'), () => {
            try {
                deleteTusCardByCardId(routeCardId);
                dbDeleteFtsCard(routeCardId);
                rebuildSearchIndex();
                bumpDataVersion();
                alert(l('Silindi', 'Deleted'), l('Kart silindi.', 'Card deleted.'), () => router.back());
            } catch (e) {
                console.warn('[Editor] delete failed:', e);
                alert(t('common.error'), l('Kart silinemedi.', 'Could not delete the card.'));
            }
        }, { destructive: true });
    };

    const formattingTools: Array<{
        key: string;
        glyph: string;
        label: string;
        command?: RichTextCommand;
        onPress?: () => void;
        textStyle?: TextStyle;
    }> = [
        { key: 'bold', glyph: 'B', label: l('Kalın', 'Bold'), command: 'bold', textStyle: { fontWeight: '900' } },
        { key: 'italic', glyph: 'I', label: l('İtalik', 'Italic'), command: 'italic', textStyle: { fontStyle: 'italic' } },
        { key: 'underline', glyph: 'U', label: l('Altı çizili', 'Underline'), command: 'underline', textStyle: { textDecorationLine: 'underline' } },
        { key: 'strikeThrough', glyph: 'S', label: l('Üstü çizili', 'Strikethrough'), command: 'strikeThrough', textStyle: { textDecorationLine: 'line-through' } },
        { key: 'insertUnorderedList', glyph: '•', label: l('Madde işaretli liste', 'Bulleted list'), command: 'insertUnorderedList' },
        { key: 'insertOrderedList', glyph: '1.', label: l('Numaralı liste', 'Numbered list'), command: 'insertOrderedList' },
        { key: 'superscript', glyph: 'x²', label: l('Üst simge', 'Superscript'), command: 'superscript' },
        { key: 'subscript', glyph: 'x₂', label: l('Alt simge', 'Subscript'), command: 'subscript' },
        { key: 'rule', glyph: '—', label: l('Yatay çizgi', 'Horizontal rule'), command: 'insertHorizontalRule' },
        { key: 'textColor', glyph: 'A', label: l('Metin rengi', 'Text color'), onPress: () => setColorPickerMode('text'), textStyle: { fontWeight: '900', color: colors.accent } },
        { key: 'highlight', glyph: '▧', label: l('Vurgu rengi', 'Highlight color'), onPress: () => setColorPickerMode('highlight') },
        { key: 'cloze', glyph: 'C1', label: l('Boşluk doldurma ekle', 'Add cloze deletion'), command: 'cloze' },
        { key: 'attachment', glyph: '＋', label: l('Ek ekle', 'Add attachment'), onPress: () => activeMediaRef().current?.open() },
        { key: 'removeFormat', glyph: 'Tx', label: l('Biçimlendirmeyi temizle', 'Clear formatting'), command: 'removeFormat' },
        { key: 'undo', glyph: '↶', label: l('Geri al', 'Undo'), command: 'undo' },
        { key: 'redo', glyph: '↷', label: l('İleri al', 'Redo'), command: 'redo' },
    ];

    const formatColors = [
        colors.textPrimary,
        colors.accent,
        '#c0392b',
        '#d68910',
        '#2874a6',
        '#8e44ad',
        '#16a085',
        '#ffffff',
        '#000000',
    ];

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.editorHeader}>
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleBack}
                    accessibilityRole="button"
                    accessibilityLabel={l('Geri dön', 'Go back')}
                >
                    <Text style={styles.headerBackIcon}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {isEditing ? t('root.editCard') : l('Yeni Kart', 'Add')}
                </Text>
                <View style={styles.headerSpacer} />
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel={isEditing ? l('Değişiklikleri kaydet', 'Save changes') : l('Kartı kaydet', 'Save card')}
                >
                    <Text style={styles.headerCheckIcon}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={openPreview}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kartı önizle', 'Preview card')}
                >
                    <View style={styles.headerEyeShape}>
                        <View style={styles.headerEyePupil} />
                    </View>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={() => setShowOverflowMenu(true)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Diğer seçenekler', 'More options')}
                >
                    <Text style={styles.headerMoreIcon}>⋮</Text>
                </TouchableOpacity>
            </View>
            <KeyboardAvoidingView
                style={styles.keyboardArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
            <ScrollView
                style={styles.editorScroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.selectorGroup}>
                    <TouchableOpacity
                        style={styles.ankiSelectorRow}
                        onPress={() => !isEditing && setShowCardTypePicker(true)}
                        disabled={isEditing}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Kart türü: ${cardTypeLabel}`, `Note type: ${cardTypeLabel}`)}
                    >
                        <Text style={styles.ankiSelectorLabel}>{l('Tür:', 'Type:')}</Text>
                        <Text style={styles.ankiSelectorValue} numberOfLines={1}>{cardTypeLabel}</Text>
                        <Text style={styles.ankiSelectorChevron}>{isEditing ? '🔒' : '⌄'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.ankiSelectorRow, styles.ankiSelectorRowLast]}
                        onPress={() => setShowDeckPicker(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Hedef desteyi seç', 'Select target deck')}
                    >
                        <Text style={styles.ankiSelectorLabel}>{l('Deste:', 'Deck:')}</Text>
                        <Text style={styles.ankiSelectorValue} numberOfLines={1}>
                            {targetDeck?.name.replaceAll('::', ' › ') ?? '—'}
                        </Text>
                        <Text style={styles.ankiSelectorChevron}>⌄</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.label}>{l('SORU', 'QUESTION')}</Text>
                    <MediaAttachButton
                        ref={questionMediaRef}
                        hasMedia={FIELD_MEDIA_RE.test(question)}
                        onInsert={(snippet) => setQuestion((prev) => appendSnippet(prev, snippet))}
                    />
                </View>
                <RichTextEditor
                    ref={questionEditorRef}
                    value={question}
                    onChange={setQuestion}
                    onFocus={() => setActiveField('question')}
                    onFormatStateChange={setActiveFormats}
                    placeholder={l('Soruyu yazın…', 'Enter the question…')}
                    colors={colors}
                />

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.label}>{l('CEVAP', 'ANSWER')}</Text>
                    <MediaAttachButton
                        ref={answerMediaRef}
                        hasMedia={FIELD_MEDIA_RE.test(answer)}
                        onInsert={(snippet) => setAnswer((prev) => appendSnippet(prev, snippet))}
                    />
                </View>
                <RichTextEditor
                    ref={answerEditorRef}
                    value={answer}
                    onChange={setAnswer}
                    onFocus={() => setActiveField('answer')}
                    onFormatStateChange={setActiveFormats}
                    placeholder={l('Cevabı yazın…', 'Enter the answer…')}
                    colors={colors}
                />

                {cardTypeId === 6 && (
                    <>
                        <View style={styles.fieldLabelRow}>
                            <Text style={styles.label}>{l('TERS KARTIN CEVABI (İSTEĞE BAĞLI)', 'BACK TEMPLATE ANSWER (OPTIONAL)')}</Text>
                            <MediaAttachButton
                                ref={reverseMediaRef}
                                hasMedia={FIELD_MEDIA_RE.test(reverseAnswer)}
                                onInsert={(snippet) => setReverseAnswer((prev) => appendSnippet(prev, snippet))}
                            />
                        </View>
                        <RichTextEditor
                            ref={reverseEditorRef}
                            value={reverseAnswer}
                            onChange={setReverseAnswer}
                            onFocus={() => setActiveField('reverseAnswer')}
                            onFormatStateChange={setActiveFormats}
                            placeholder={l('Boş bırakılırsa ters kartın cevabı otomatik olarak “Soru” olur.', 'If left blank, the reversed card answer defaults to the Question field.')}
                            colors={colors}
                        />
                    </>
                )}

                <TouchableOpacity
                    style={styles.summaryRow}
                    onPress={() => {
                        Keyboard.dismiss();
                        setShowTagPicker(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={l('Etiketleri düzenle', 'Edit tags')}
                    accessibilityHint={l('Etiket aramak, eklemek veya seçmek için açar', 'Opens tag search, creation and selection')}
                >
                    <Text style={styles.summaryLabel}>{l('Etiketler:', 'Tags:')}</Text>
                    <Text style={styles.summaryValue} numberOfLines={1}>
                        {noteTags.join(' · ') || '—'}
                    </Text>
                    <Text style={styles.summaryChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{l('Kartlar:', 'Cards:')}</Text>
                    <Text style={styles.summaryValue}>
                        {cardTypeId === 6 ? l('Kart 1 ve Kart 2', 'Card 1 and Card 2') : l('Kart 1', 'Card 1')}
                    </Text>
                </View>
            </ScrollView>

            <View style={styles.formatToolbar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    contentContainerStyle={styles.formatToolbarContent}
                >
                    {formattingTools.map((tool) => {
                        const selected = Boolean(tool.command && activeFormats.includes(tool.command));
                        return (
                            <TouchableOpacity
                                key={tool.key}
                                style={[styles.formatButton, selected && styles.formatButtonActive]}
                                onPress={() => tool.onPress ? tool.onPress() : tool.command && runEditorCommand(tool.command)}
                                accessibilityRole="button"
                                accessibilityLabel={tool.label}
                                accessibilityState={{ selected }}
                            >
                                <Text style={[styles.formatButtonText, tool.textStyle, selected && styles.formatButtonTextActive]}>
                                    {tool.glyph}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
            </KeyboardAvoidingView>

            <Modal
                visible={showOverflowMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowOverflowMenu(false)}
            >
                <View style={styles.overflowOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowOverflowMenu(false)}
                        accessibilityLabel={l('Seçenekler menüsünü kapat', 'Close options menu')}
                    />
                    <View style={styles.overflowMenu}>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => runAfterOverflowClose(handleSave)}>
                            <Text style={styles.overflowItemIcon}>✓</Text>
                            <Text style={styles.overflowItemText}>{isEditing ? l('Değişiklikleri Kaydet', 'Save Changes') : l('Kartı Kaydet', 'Save Card')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => runAfterOverflowClose(openPreview)}>
                            <Text style={styles.overflowItemIcon}>◉</Text>
                            <Text style={styles.overflowItemText}>{l('Önizle', 'Preview')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => runAfterOverflowClose(() => setShowDeckPicker(true))}>
                            <Text style={styles.overflowItemIcon}>▤</Text>
                            <Text style={styles.overflowItemText}>{l('Deste Seç', 'Choose Deck')}</Text>
                        </TouchableOpacity>
                        {!isEditing && (
                            <TouchableOpacity style={styles.overflowItem} onPress={() => runAfterOverflowClose(() => setShowCardTypePicker(true))}>
                                <Text style={styles.overflowItemIcon}>▣</Text>
                                <Text style={styles.overflowItemText}>{l('Kart Türü Seç', 'Choose Note Type')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.overflowItem} onPress={() => runAfterOverflowClose(requestClearFields)}>
                            <Text style={styles.overflowItemIcon}>⌫</Text>
                            <Text style={styles.overflowItemText}>{l('Alanları Temizle', 'Clear Fields')}</Text>
                        </TouchableOpacity>
                        {isEditing && routeCardId && (
                            <TouchableOpacity style={styles.overflowItem} onPress={() => runAfterOverflowClose(handleDelete)}>
                                <Text style={[styles.overflowItemIcon, styles.dangerText]}>⌫</Text>
                                <Text style={[styles.overflowItemText, styles.dangerText]}>{l('Kartı Sil', 'Delete Card')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showCardTypePicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowCardTypePicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCardTypePicker(false)} />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Kart Türü', 'Note Type')}</Text>
                        {CARD_TYPE_CHOICES.map((choice) => {
                            const label = choice.id === 4
                                ? l('Temel', 'Basic')
                                : choice.id === 5
                                    ? l('Yazarak Yanıtla', 'Basic (type in the answer)')
                                    : l('Çift Taraflı', 'Basic (and reversed card)');
                            const selected = cardTypeId === choice.id;
                            return (
                                <TouchableOpacity
                                    key={choice.id}
                                    style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                                    onPress={() => {
                                        setCardTypeId(choice.id);
                                        setShowCardTypePicker(false);
                                    }}
                                    accessibilityState={{ selected }}
                                >
                                    <Text style={styles.pickerOptionIcon}>{choice.icon}</Text>
                                    <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>{label}</Text>
                                    {selected && <Text style={styles.pickerCheck}>✓</Text>}
                                </TouchableOpacity>
                            );
                        })}
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowCardTypePicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={colorPickerMode !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setColorPickerMode(null)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setColorPickerMode(null)} />
                    <View style={[styles.modalCard, styles.colorPickerCard]}>
                        <Text style={styles.modalTitle}>
                            {colorPickerMode === 'text' ? l('Metin Rengi', 'Text Color') : l('Vurgu Rengi', 'Highlight Color')}
                        </Text>
                        <View style={styles.colorGrid}>
                            {formatColors.map((color) => (
                                <TouchableOpacity
                                    key={color}
                                    style={[styles.colorSwatch, { backgroundColor: color }]}
                                    onPress={() => applyEditorColor(color)}
                                    accessibilityRole="button"
                                    accessibilityLabel={color}
                                />
                            ))}
                        </View>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setColorPickerMode(null)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showDeckPicker} transparent animationType="fade" onRequestClose={() => setShowDeckPicker(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowDeckPicker(false)}
                        accessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                    />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Hedef Deste', 'Target Deck')}</Text>
                        <ScrollView style={styles.deckList}>
                            {deckPickerRows.map((node) => (
                                <TouchableOpacity
                                    key={node.deck.id}
                                    style={[styles.deckOption, { paddingLeft: Spacing.sm + Math.min(node.depth, 8) * 22 }]}
                                    onPress={() => { setTargetDeckId(node.deck.id); setShowDeckPicker(false); }}
                                    accessibilityLabel={node.deck.name.replaceAll('::', ' › ')}
                                >
                                    <Text
                                        style={[styles.deckOptionText, targetDeck?.id === node.deck.id && styles.deckOptionActive]}
                                        numberOfLines={1}
                                    >
                                        {node.depth > 0 ? '↳  ' : '🗃️  '}{getDeckDisplayName(node.deck.name)}
                                    </Text>
                                    {targetDeck?.id === node.deck.id && <Text style={styles.deckOptionCheck}>✓</Text>}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowDeckPicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <TagPickerModal
                visible={showTagPicker}
                selectedTags={noteTags}
                onCancel={() => setShowTagPicker(false)}
                onConfirm={(tags) => {
                    setNoteTags(tags);
                    setShowTagPicker(false);
                }}
            />

            <Modal visible={showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowPreview(false)}
                        accessibilityLabel={l('Önizlemeyi kapat', 'Close preview')}
                    />
                    <View style={[styles.modalCard, styles.previewCard]}>
                        <Text style={styles.modalTitle}>👁️ {l('Önizleme', 'Preview')}</Text>
                        <ScrollView style={styles.previewScroll}>
                            <Text style={styles.previewMeta} numberOfLines={1}>
                                🗃️ {targetDeck?.name.replaceAll('::', ' › ') ?? '—'}
                            </Text>
                            <Text style={styles.label}>{l('SORU', 'QUESTION')}</Text>
                            {previewPayload && (
                                <CardWebView
                                    noteType={previewPayload.noteType}
                                    note={previewPayload.note}
                                    card={previewPayload.card}
                                    deck={targetDeck}
                                    side="question"
                                />
                            )}
                            <Text style={styles.label}>{l('CEVAP', 'ANSWER')}</Text>
                            {previewPayload && (
                                <CardWebView
                                    noteType={previewPayload.noteType}
                                    note={previewPayload.note}
                                    card={previewPayload.card}
                                    deck={targetDeck}
                                    side="answer"
                                    omitFrontSide
                                />
                            )}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowPreview(false)}>
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgCard },
    keyboardArea: { flex: 1 },
    editorHeader: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accent,
        paddingHorizontal: 4,
    },
    headerAction: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
    },
    headerBackIcon: { color: colors.white, fontSize: 38, lineHeight: 38, fontWeight: '300', marginTop: -2 },
    headerTitle: { color: colors.white, fontSize: FontSize.xl, fontWeight: '600', marginLeft: 4 },
    headerSpacer: { flex: 1 },
    headerCheckIcon: { color: colors.white, fontSize: 26, fontWeight: '500' },
    headerEyeShape: {
        width: 24,
        height: 16,
        borderWidth: 2,
        borderColor: colors.white,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: '-3deg' }],
    },
    headerEyePupil: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
    headerMoreIcon: { color: colors.white, fontSize: 30, lineHeight: 30, fontWeight: '700' },
    editorScroll: { flex: 1, backgroundColor: colors.bgCard },
    content: {
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        gap: Spacing.md,
        paddingBottom: Spacing.xxl,
    },
    selectorGroup: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    ankiSelectorRow: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        paddingHorizontal: Spacing.sm,
    },
    ankiSelectorRowLast: { borderBottomWidth: StyleSheet.hairlineWidth },
    ankiSelectorLabel: { width: 72, fontSize: FontSize.md, fontWeight: '800', color: colors.textPrimary },
    ankiSelectorValue: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
    ankiSelectorChevron: { width: 28, textAlign: 'center', fontSize: FontSize.lg, color: colors.textMuted },
    formatToolbar: {
        backgroundColor: colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        minHeight: 52,
    },
    formatToolbarContent: {
        minHeight: 52,
        alignItems: 'center',
        paddingHorizontal: 6,
        gap: 2,
    },
    formatButton: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    formatButtonActive: { backgroundColor: colors.accentLight },
    formatButtonText: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    formatButtonTextActive: { color: colors.accent },
    summaryRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
    },
    summaryLabel: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
    summaryValue: { flex: 1, fontSize: FontSize.sm, color: colors.textSecondary },
    summaryChevron: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
    overflowOverlay: {
        flex: 1,
        alignItems: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.22)',
        paddingTop: 58,
        paddingRight: Spacing.sm,
    },
    overflowMenu: {
        minWidth: 238,
        paddingVertical: Spacing.xs,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        ...Shadows.lg,
    },
    overflowItem: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        gap: Spacing.md,
    },
    overflowItemIcon: { width: 24, textAlign: 'center', fontSize: 19, color: colors.textSecondary },
    overflowItemText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    dangerText: { color: colors.btnAgain },
    pickerOption: {
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    pickerOptionActive: { backgroundColor: colors.accentLight },
    pickerOptionIcon: { width: 26, textAlign: 'center', fontSize: 18 },
    pickerOptionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
    pickerOptionTextActive: { color: colors.accent, fontWeight: '700' },
    pickerCheck: { fontSize: 20, fontWeight: '800', color: colors.accent },
    colorPickerCard: { maxWidth: 330 },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, justifyContent: 'center' },
    colorSwatch: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: colors.border,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    modalCard: {
        width: '100%',
        maxWidth: 440,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        ...Shadows.lg,
    },
    previewCard: { maxHeight: '85%' },
    modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.md },
    deckList: { maxHeight: 320 },
    deckOption: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckOptionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
    deckOptionActive: { color: colors.accent, fontWeight: '700' },
    deckOptionCheck: { marginLeft: Spacing.sm, color: colors.accent, fontSize: 18, fontWeight: '800' },
    modalClose: { minHeight: 48, marginTop: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
    modalCloseText: { color: colors.textMuted, fontWeight: '600' },
    previewScroll: { flexGrow: 0 },
    previewMeta: { fontSize: FontSize.sm, color: colors.textMuted, marginBottom: Spacing.sm },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    });
}
