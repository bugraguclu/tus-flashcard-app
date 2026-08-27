import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Modal,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Pressable,
    useWindowDimensions,
    Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { resolveSubjectDeckId } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { confirm, alert } from '../lib/confirm';
import { useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import {
    createTusCard,
    updateTusCardByCardId,
    deleteTusCardByCardId,
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    searchIndexCardFromNote,
} from '../lib/noteManager';
import { createDeck, getAllDecks, getAvailableDeckName, getDeck, getDeckByName } from '../lib/deckManager';
import { safeExternalCallbackUrl } from '../lib/externalLinking';
import { ANKI_STOCK_NOTE_TYPE_IDS, BUILTIN_NOTE_TYPES, type AnkiCard, type Note } from '../lib/models';
import CardWebView from '../components/CardWebView';
import MediaAttachButton, { FIELD_MEDIA_RE, type MediaAttachButtonHandle } from '../components/MediaAttachButton';
import RichTextEditor, {
    type RichTextEditorHandle,
} from '../components/RichTextEditor';
import TagPickerModal from '../components/TagPickerModal';
import DeckPickerModal from '../components/DeckPickerModal';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import { localizeNoteTypeName } from '../lib/i18n';
import { extractClozeNumbers } from '../lib/templates';
import { getDbSetting, loadSettings, saveSettings, setDbSetting } from '../lib/storage';
import { editorDraftKey, hasEditorDraftChanged } from '../lib/editorDraft';
import { userFacingErrorMessage } from '../lib/userFacingError';

function parseCardId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function fieldHasContent(value: string): boolean {
    if (FIELD_MEDIA_RE.test(value)) return true;
    return value
        .replace(/<br\s*\/?>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .trim().length > 0;
}

function EyeIcon({ color, size = 24 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path
                d="M2.3 12s3.7-6.1 9.7-6.1 9.7 6.1 9.7 6.1-3.7 6.1-9.7 6.1S2.3 12 2.3 12Z"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Circle cx={12} cy={12} r={2.7} fill={color} />
        </Svg>
    );
}

function BackIcon({ color, size = 26 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="M15 18 9 12l6-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

function CheckIcon({ color, size = 27 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="m5 12.5 4.2 4L19 6.8" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

function MoreIcon({ color, size = 25 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Circle cx={12} cy={5} r={1.7} fill={color} />
            <Circle cx={12} cy={12} r={1.7} fill={color} />
            <Circle cx={12} cy={19} r={1.7} fill={color} />
        </Svg>
    );
}

function ChevronDownIcon({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="m7 9.5 5 5 5-5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

type EditorField = 'question' | 'answer' | 'reverseAnswer';

function PinIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path
                d="M8.2 3.5h7.6l-1.1 5.1 2.8 3.1v1.5H6.5v-1.5l2.8-3.1-1.1-5.1ZM12 13.2v7.3"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

type AnkiToolbarIconName = 'bold' | 'italic' | 'underline' | 'rule' | 'heading' | 'fontSize' | 'math' | 'add';

function AnkiToolbarIcon({ name, color, size = 24 }: { name: AnkiToolbarIconName; color: string; size?: number }) {
    const paths: Record<Exclude<AnkiToolbarIconName, 'math'>, string> = {
        bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42ZM10 6.5h3a1.5 1.5 0 0 1 0 3h-3v-3Zm3.5 9H10v-3h3.5a1.5 1.5 0 0 1 0 3Z',
        italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8Z',
        underline: 'M12 17a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 1 1-7 0V3H6v8a6 6 0 0 0 6 6ZM5 19v2h14v-2H5Z',
        rule: 'M2 11h20v2H2z',
        heading: 'M5 4v3h5.5v12h3V7H19V4H5Z',
        fontSize: 'M2.5 4v3h5v12h3V7h5V4h-13Zm19 5h-9v3h3v7h3v-7h3V9Z',
        add: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z',
    };

    if (name === 'math') {
        return (
            <Svg width={size} height={size} viewBox="0 0 6.35 6.35" accessibilityElementsHidden>
                <Path
                    fill={color}
                    d="M1.559 1.099v.457l1.49 1.808-1.49 1.807v.458h2.345a1.246 1.246 0 0 1-.22-.483H2.321l-.009-.016L3.7 3.404V3.33L2.312 1.597l.009-.016h1.702l.047.52h.526V1.1H1.559Z"
                />
                <Path
                    fill={color}
                    d="M5.018 4.326H4.79v.454h-.454v.227h.454v.455h.228v-.455h.454V4.78h-.454v-.454Zm-.114-.568a1.136 1.136 0 1 0 0 2.271 1.136 1.136 0 0 0 0-2.271Zm0 2.044a.909.909 0 1 1 0-1.817.909.909 0 0 1 0 1.817Z"
                />
            </Svg>
        );
    }

    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path fill={color} d={paths[name]} />
        </Svg>
    );
}

interface CustomToolbarButton {
    id: string;
    buttonText: string;
    prefix: string;
    suffix: string;
}

const CUSTOM_TOOLBAR_BUTTONS_KEY = 'tus_editor_custom_toolbar_buttons_v1';

function loadCustomToolbarButtons(): CustomToolbarButton[] {
    try {
        const raw = getDbSetting(CUSTOM_TOOLBAR_BUTTONS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.flatMap((item): CustomToolbarButton[] => {
            if (!item || typeof item !== 'object') return [];
            const candidate = item as Partial<CustomToolbarButton>;
            if (typeof candidate.id !== 'string' || typeof candidate.buttonText !== 'string'
                || typeof candidate.prefix !== 'string' || typeof candidate.suffix !== 'string') return [];
            return [{
                id: candidate.id,
                buttonText: candidate.buttonText,
                prefix: candidate.prefix,
                suffix: candidate.suffix,
            }];
        });
    } catch {
        return [];
    }
}

function persistCustomToolbarButtons(buttons: CustomToolbarButton[]): void {
    setDbSetting(CUSTOM_TOOLBAR_BUTTONS_KEY, JSON.stringify(buttons));
}

type StickyEditorFields = Partial<Record<EditorField, { pinned: boolean; value: string }>>;
const STICKY_EDITOR_FIELDS_KEY = 'tus_editor_sticky_fields_v1';

function loadStickyEditorFields(): StickyEditorFields {
    try {
        const raw = getDbSetting(STICKY_EDITOR_FIELDS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as StickyEditorFields;
        const clean: StickyEditorFields = {};
        (['question', 'answer', 'reverseAnswer'] as EditorField[]).forEach((field) => {
            const entry = parsed[field];
            if (!entry || typeof entry.value !== 'string') return;
            clean[field] = { pinned: Boolean(entry.pinned), value: entry.value };
        });
        return clean;
    } catch {
        return {};
    }
}

function saveStickyEditorFields(fields: StickyEditorFields): void {
    setDbSetting(STICKY_EDITOR_FIELDS_KEY, JSON.stringify(fields));
}

const CARD_TYPE_CHOICES = ANKI_STOCK_NOTE_TYPE_IDS;

export default function EditorScreen() {
    const { t, l, locale } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const { activeDeckName } = useStudyScope();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const routeCardId = useMemo(() => {
        const explicitCardId = parseCardId(params.cardId);
        if (explicitCardId) return explicitCardId;

        // Legacy route param fallback.
        const legacyId = parseCardId(params.id);
        if (!legacyId) return null;
        return legacyId;
    }, [params.cardId, params.id]);

    const routeDeckId = useMemo(() => parseCardId(params.deckId), [params.deckId]);
    const routeNoteTypeId = useMemo(() => parseCardId(params.noteTypeId), [params.noteTypeId]);
    const routeFieldValues = useMemo(() => {
        if (typeof params.fieldValues !== 'string') return [];
        try {
            const values = JSON.parse(params.fieldValues);
            return Array.isArray(values) ? values.map((value) => String(value ?? '')) : [];
        } catch {
            return [];
        }
    }, [params.fieldValues]);
    const externalSuccessUrl = safeExternalCallbackUrl(
        typeof params.externalSuccessUrl === 'string' ? params.externalSuccessUrl : null,
    ) ?? '';

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
    const [showNewSubject, setShowNewSubject] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [showCardTypePicker, setShowCardTypePicker] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [showFontSizePicker, setShowFontSizePicker] = useState(false);
    const [showHeadingPicker, setShowHeadingPicker] = useState(false);
    const [showInlineFontSizePicker, setShowInlineFontSizePicker] = useState(false);
    const [showMathPicker, setShowMathPicker] = useState(false);
    const [showCustomToolbarEditor, setShowCustomToolbarEditor] = useState(false);
    const [showCustomToolbarHelp, setShowCustomToolbarHelp] = useState(false);
    const [editingToolbarButtonId, setEditingToolbarButtonId] = useState<string | null>(null);
    const [toolbarButtonDraft, setToolbarButtonDraft] = useState({ buttonText: '', prefix: '', suffix: '' });
    const [customToolbarButtons, setCustomToolbarButtons] = useState<CustomToolbarButton[]>(loadCustomToolbarButtons);

    const passiveOverlayOpen = showPreview
        || showCardTypePicker
        || showOverflowMenu
        || showFontSizePicker
        || showHeadingPicker
        || showInlineFontSizePicker
        || showMathPicker
        || showCustomToolbarHelp;

    // Formatting/preview surfaces are not keyboard editors themselves. Let them open against
    // the full iOS window instead of inheriting the rich-text field's keyboard-sized layout.
    useEffect(() => {
        if (passiveOverlayOpen) Keyboard.dismiss();
    }, [passiveOverlayOpen]);
    const [editorPreferences, setEditorPreferences] = useState(() => {
        const settings = loadSettings();
        return {
            fontSize: settings.editorFontSize ?? 16,
            capitalizeSentences: settings.editorCapitalizeSentences !== false,
            toolbarVisible: settings.editorToolbarVisible !== false,
            toolbarScrollable: settings.editorToolbarScrollable !== false,
            pasteClipboardImagesAsPng: Boolean(settings.pasteClipboardImagesAsPng),
        };
    });
    const [activeField, setActiveField] = useState<EditorField>('question');
    const questionEditorRef = useRef<RichTextEditorHandle>(null);
    const answerEditorRef = useRef<RichTextEditorHandle>(null);
    const reverseEditorRef = useRef<RichTextEditorHandle>(null);
    const questionMediaRef = useRef<MediaAttachButtonHandle>(null);
    const answerMediaRef = useRef<MediaAttachButtonHandle>(null);
    const reverseMediaRef = useRef<MediaAttachButtonHandle>(null);

    const stickyFieldDefaults = useMemo(
        () => routeCardId ? {} : loadStickyEditorFields(),
        [routeCardId],
    );

    const [question, setQuestion] = useState((params.question as string) || stickyFieldDefaults.question?.value || '');
    const [answer, setAnswer] = useState((params.answer as string) || stickyFieldDefaults.answer?.value || '');
    const [cardTypeId, setCardTypeId] = useState(() => routeNoteTypeId ?? 1);
    const [reverseAnswer, setReverseAnswer] = useState(
        (routeNoteTypeId === 7 ? routeFieldValues[2] : '') || stickyFieldDefaults.reverseAnswer?.value || '',
    );
    const [pinnedFields, setPinnedFields] = useState<Set<EditorField>>(() => new Set(
        (['question', 'answer', 'reverseAnswer'] as EditorField[])
            .filter((field) => stickyFieldDefaults[field]?.pinned),
    ));
    const [noteTags, setNoteTags] = useState<string[]>(() => (
        typeof params.tags === 'string' ? params.tags.split(/\s+/).filter(Boolean) : []
    ));
    const [preservedFields, setPreservedFields] = useState<string[]>(routeFieldValues);
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));
    const initialDraftKeyRef = useRef<string | null>(null);

    const selectedNoteType = useMemo(
        () => getNoteType(cardTypeId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === cardTypeId) ?? null,
        [cardTypeId, dataVersion],
    );
    const isCloze = selectedNoteType?.kind === 'cloze';
    const isOptionalReverse = cardTypeId === 7;

    const targetDeck = useMemo(() => {
        if (targetDeckId) return getDeck(targetDeckId);
        if (activeDeckName) return getDeckByName(activeDeckName) ?? getDeck(1);
        return getDeck(1);
    }, [targetDeckId, activeDeckName, dataVersion]);

    // The hidden picker needs no data. Loading/building its complete hierarchy during the editor
    // transition only competes with the rich editor WebViews for the first frame.
    const deckPickerDecks = useMemo(
        () => showDeckPicker
            ? getAllDecks().filter((deck) => !deck.isFiltered)
            : [],
        [dataVersion, showDeckPicker],
    );

    const openNewSubject = () => {
        setNewSubjectName('');
        setShowDeckPicker(false);
        setShowNewSubject(true);
    };

    const handleCreateSubject = () => {
        const result = createCourse(newSubjectName);
        if (!result.created) {
            alert(t('common.error'), userFacingErrorMessage(
                result.error,
                l('Ders oluşturulamadı. Lütfen tekrar deneyin.', 'Could not create the course. Please try again.'),
            ));
            return;
        }
        setTargetDeckId(resolveSubjectDeckId(result.subject.id));
        setShowNewSubject(false);
        setNewSubjectName('');
        bumpDataVersion();
    };

    const previewPayload = useMemo(() => {
        if (!showPreview) return null;
        const noteType = selectedNoteType;
        if (!noteType) return null;
        const fields = preservedFields.length > 0
            ? [...preservedFields]
            : noteType.fields.map(() => '');
        while (fields.length < noteType.fields.length) fields.push('');
        fields[0] = question || l('(boş soru)', '(empty question)');
        fields[1] = answer || l('(boş cevap)', '(empty answer)');
        if (cardTypeId === 7) fields[2] = reverseAnswer.trim();
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
    }, [showPreview, question, answer, targetDeck?.id, cardTypeId, reverseAnswer, noteTags, preservedFields, selectedNoteType, l]);

    useEffect(() => {
        if (!routeCardId) return;

        initialDraftKeyRef.current = null;

        const card = getAnkiCard(routeCardId);
        if (!card) return;
        const note = getNote(card.noteId);
        if (!note) return;

        const initialReverseAnswer = note.noteTypeId === 7 ? (note.fields[2] || '') : '';

        // Editing follows the card's actual deck. Extra legacy/imported fields and tags remain
        // intact even though the compact add screen only exposes Anki's Type and Deck selectors.
        setTargetDeckId(card.deckId);
        setQuestion(note.fields[0] || note.sfld || '');
        setAnswer(note.fields[1] || '');
        setNoteTags(note.tags);
        setPreservedFields(note.fields);
        setCardTypeId(note.noteTypeId);
        setReverseAnswer(initialReverseAnswer);
        setIsEditing(true);
        initialDraftKeyRef.current = editorDraftKey({
            question: note.fields[0] || note.sfld || '',
            answer: note.fields[1] || '',
            reverseAnswer: initialReverseAnswer,
            cardTypeId: note.noteTypeId,
            deckId: card.deckId,
            tags: note.tags,
        });
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

    useEffect(() => {
        if (routeCardId || targetDeckId === null || initialDraftKeyRef.current !== null) return;
        initialDraftKeyRef.current = editorDraftKey({
            question,
            answer,
            reverseAnswer,
            cardTypeId,
            deckId: targetDeckId,
            tags: noteTags,
        });
    }, [routeCardId, targetDeckId, question, answer, reverseAnswer, cardTypeId, noteTags]);

    const cardTypeLabel = selectedNoteType
        ? localizeNoteTypeName(locale, selectedNoteType.name)
        : l('Bilinmeyen', 'Unknown');

    const activeEditorRef = () => {
        if (activeField === 'answer') return answerEditorRef;
        if (activeField === 'reverseAnswer') return reverseEditorRef;
        return questionEditorRef;
    };

    const fieldValue = (field: EditorField): string => {
        if (field === 'answer') return answer;
        if (field === 'reverseAnswer') return reverseAnswer;
        return question;
    };

    const persistStickyFieldValues = (fields: Set<EditorField> = pinnedFields) => {
        const persisted: StickyEditorFields = {};
        (['question', 'answer', 'reverseAnswer'] as EditorField[]).forEach((field) => {
            if (fields.has(field)) persisted[field] = { pinned: true, value: fieldValue(field) };
        });
        saveStickyEditorFields(persisted);
    };

    const togglePinnedField = (field: EditorField) => {
        if (isEditing) return;
        setPinnedFields((current) => {
            const next = new Set(current);
            if (next.has(field)) next.delete(field);
            else next.add(field);
            persistStickyFieldValues(next);
            return next;
        });
    };

    const wrapEditorSelection = (prefix: string, suffix: string) => {
        activeEditorRef().current?.wrapSelection(prefix, suffix);
    };

    const openCreateToolbarButton = () => {
        Keyboard.dismiss();
        setEditingToolbarButtonId(null);
        setToolbarButtonDraft({ buttonText: '', prefix: '', suffix: '' });
        setShowCustomToolbarEditor(true);
    };

    const openEditToolbarButton = (button: CustomToolbarButton) => {
        Keyboard.dismiss();
        setEditingToolbarButtonId(button.id);
        setToolbarButtonDraft({ buttonText: button.buttonText, prefix: button.prefix, suffix: button.suffix });
        setShowCustomToolbarEditor(true);
    };

    const saveCustomToolbarButton = () => {
        if (!toolbarButtonDraft.prefix && !toolbarButtonDraft.suffix) {
            alert(
                t('common.error'),
                l('Seçili metnin önüne veya arkasına eklenecek en az bir HTML değeri girin.', 'Enter at least one HTML value to insert before or after the selected text.'),
            );
            return;
        }

        setCustomToolbarButtons((current) => {
            const fallbackText = String((editingToolbarButtonId
                ? current.findIndex((button) => button.id === editingToolbarButtonId)
                : current.length) + 1);
            const nextButton: CustomToolbarButton = {
                id: editingToolbarButtonId ?? `toolbar-${Date.now()}`,
                buttonText: toolbarButtonDraft.buttonText.trim() || fallbackText,
                prefix: toolbarButtonDraft.prefix,
                suffix: toolbarButtonDraft.suffix,
            };
            const next = editingToolbarButtonId
                ? current.map((button) => button.id === editingToolbarButtonId ? nextButton : button)
                : [...current, nextButton];
            persistCustomToolbarButtons(next);
            return next;
        });
        setShowCustomToolbarEditor(false);
    };

    const requestDeleteCustomToolbarButton = () => {
        if (!editingToolbarButtonId) return;
        confirm(
            l('Araç çubuğu öğesi silinsin mi?', 'Remove Toolbar Item?'),
            l('Bu özel düğme araç çubuğundan kaldırılacak.', 'This custom button will be removed from the toolbar.'),
            () => {
                setCustomToolbarButtons((current) => {
                    const next = current.filter((button) => button.id !== editingToolbarButtonId);
                    persistCustomToolbarButtons(next);
                    return next;
                });
                setShowCustomToolbarEditor(false);
            },
            { destructive: true },
        );
    };

    const showToolbarHelp = () => {
        setShowCustomToolbarEditor(false);
        setTimeout(() => setShowCustomToolbarHelp(true), Platform.OS === 'ios' ? 180 : 0);
    };

    const useToolbarButtonTemplate = () => {
        setShowCustomToolbarHelp(false);
        setEditingToolbarButtonId(null);
        setToolbarButtonDraft({
            buttonText: l('Düğme', 'Button'),
            prefix: '<button type="button">',
            suffix: '</button>',
        });
        setTimeout(() => setShowCustomToolbarEditor(true), Platform.OS === 'ios' ? 180 : 0);
    };

    const openPreview = () => {
        Keyboard.dismiss();
        setShowPreview(true);
    };

    const handleBack = () => {
        const hasUnsavedChanges = hasEditorDraftChanged(initialDraftKeyRef.current, {
            question,
            answer,
            reverseAnswer,
            cardTypeId,
            deckId: targetDeckId,
            tags: noteTags,
        });

        if (!hasUnsavedChanges) {
            router.back();
            return;
        }
        confirm(
            l('Değişiklikler atılsın mı?', 'Discard Changes?'),
            isEditing
                ? l('Kaydetmeden kart düzenleme ekranından çıkılsın mı?', 'Leave the card editor without saving?')
                : l('Kaydetmeden kart ekleme ekranından çıkılsın mı?', 'Leave the add card screen without saving?'),
            () => router.back(),
            { destructive: true },
        );
    };

    const requestClearFields = () => {
        setShowOverflowMenu(false);
        confirm(
            l('Alanları temizle', 'Clear Fields'),
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
        requestAnimationFrame(action);
    };

    const runAfterFormattingDialogClose = (close: () => void, action: () => void) => {
        close();
        // iOS keeps a transparent native modal layer alive during dismissal. Waiting for the
        // transition preserves the WebView selection and makes menu-driven formatting reliable.
        setTimeout(action, Platform.OS === 'ios' ? 180 : 0);
    };

    const openCardTemplates = () => {
        Keyboard.dismiss();
        router.push(`/note-type?id=${cardTypeId}`);
    };

    const updateEditorPreferences = (patch: Partial<typeof editorPreferences>) => {
        setEditorPreferences((current) => {
            const next = { ...current, ...patch };
            saveSettings({
                ...loadSettings(),
                editorFontSize: next.fontSize,
                editorCapitalizeSentences: next.capitalizeSentences,
                editorToolbarVisible: next.toolbarVisible,
                editorToolbarScrollable: next.toolbarScrollable,
            });
            return next;
        });
    };

    const handleSave = () => {
        setShowOverflowMenu(false);
        if (!fieldHasContent(question)) {
            alert(t('common.error'), isCloze
                ? l('Metin alanı boş bırakılamaz.', 'The Text field cannot be empty.')
                : l('Ön alanı boş bırakılamaz.', 'The Front field cannot be empty.'));
            return;
        }
        if (isCloze && extractClozeNumbers(question).length === 0) {
            alert(
                t('common.error'),
                l('En az bir boşluk ekleyin. Metni seçip araç çubuğundaki […] düğmesine dokunun.', 'Add at least one cloze deletion. Select text, then tap […] in the toolbar.'),
            );
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
                    reverseAnswer: cardTypeId === 7 ? reverseAnswer : undefined,
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
                    reverseAnswer: cardTypeId === 7 ? reverseAnswer : undefined,
                    fieldValues: preservedFields.length > 0
                        ? preservedFields.map((value, index) => index === 0 ? question.trim() : index === 1 ? answer.trim() : value)
                        : undefined,
                });

                for (const generatedCard of created.cards) {
                    dbUpsertFtsCard(searchIndexCardFromNote(created.note, generatedCard.id));
                }

                persistStickyFieldValues();
                bumpDataVersion();
                alert(t('common.completed'), l('Kart kaydedildi.', 'Card saved.'), () => {
                    if (externalSuccessUrl) {
                        void Linking.openURL(externalSuccessUrl).catch(() => router.back());
                    } else {
                        router.back();
                    }
                });
            }
        } catch (e) {
            console.warn('[Editor] save failed:', e);
            alert(t('common.error'), l('Kart kaydedilemedi.', 'Could not save the card.'));
        }
    };

    const handleDelete = () => {
        if (!routeCardId) return;

        confirm(l('Kartı sil', 'Delete Card'), l('Bu kartı silmek istediğinizden emin misiniz?', 'Are you sure you want to delete this card?'), () => {
            try {
                deleteTusCardByCardId(routeCardId);
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
        icon: AnkiToolbarIconName;
        label: string;
        onPress: () => void;
        onLongPress?: () => void;
    }> = [
        { key: 'bold', icon: 'bold', label: l('Kalın', 'Bold'), onPress: () => wrapEditorSelection('<b>', '</b>') },
        { key: 'italic', icon: 'italic', label: l('İtalik', 'Italic'), onPress: () => wrapEditorSelection('<i>', '</i>') },
        { key: 'underline', icon: 'underline', label: l('Altı çizili', 'Underline'), onPress: () => wrapEditorSelection('<u>', '</u>') },
        { key: 'rule', icon: 'rule', label: l('Yatay çizgi ekle', 'Insert horizontal line'), onPress: () => wrapEditorSelection('<hr>', '') },
        { key: 'heading', icon: 'heading', label: l('Başlık ekle', 'Insert heading'), onPress: () => setShowHeadingPicker(true) },
        { key: 'fontSize', icon: 'fontSize', label: l('Yazı boyutu', 'Font size'), onPress: () => setShowInlineFontSizePicker(true) },
        {
            key: 'math',
            icon: 'math',
            label: l('MathJax ekle', 'Insert MathJax'),
            onPress: () => wrapEditorSelection('\\(', '\\)'),
            onLongPress: () => setShowMathPicker(true),
        },
    ];

    const toolbarItemCount = formattingTools.length + customToolbarButtons.length + 1 + (isCloze ? 1 : 0);
    const centerToolbar = toolbarItemCount * 44 <= screenWidth;

    const renderFormattingToolbarItems = () => (
        <>
            {isCloze && (
                <TouchableOpacity
                    style={styles.formatButton}
                    onPress={() => questionEditorRef.current?.runCommand('cloze')}
                    accessibilityRole="button"
                    accessibilityLabel={l('Boşluk ekle', 'Add cloze deletion')}
                    accessibilityHint={l('Metin alanındaki seçimi bir sonraki boşluk numarasıyla kapatır', 'Wraps the Text field selection in the next cloze number')}
                >
                    <Text style={styles.customFormatButtonText}>[…]</Text>
                </TouchableOpacity>
            )}
            {formattingTools.map((tool) => {
                return (
                    <TouchableOpacity
                        key={tool.key}
                        style={styles.formatButton}
                        onPress={tool.onPress}
                        onLongPress={tool.onLongPress}
                        delayLongPress={450}
                        accessibilityRole="button"
                        accessibilityLabel={tool.label}
                        accessibilityHint={tool.key === 'math' ? l('Basılı tutarak diğer MathJax biçimlerini açın', 'Long press for other MathJax formats') : undefined}
                    >
                        <AnkiToolbarIcon name={tool.icon} color={colors.textPrimary} />
                    </TouchableOpacity>
                );
            })}
            {customToolbarButtons.map((button, index) => (
                <TouchableOpacity
                    key={button.id}
                    style={styles.formatButton}
                    onPress={() => wrapEditorSelection(button.prefix, button.suffix)}
                    onLongPress={() => openEditToolbarButton(button)}
                    delayLongPress={450}
                    accessibilityRole="button"
                    accessibilityLabel={button.buttonText || String(index + 1)}
                    accessibilityHint={l('Basılı tutarak düzenleyin veya kaldırın', 'Long press to edit or remove')}
                >
                    <Text style={styles.customFormatButtonText} numberOfLines={1} adjustsFontSizeToFit>
                        {button.buttonText || String(index + 1)}
                    </Text>
                </TouchableOpacity>
            ))}
            <TouchableOpacity
                style={styles.formatButton}
                onPress={openCreateToolbarButton}
                accessibilityRole="button"
                accessibilityLabel={l('Araç çubuğu öğesi oluştur', 'Create toolbar item')}
            >
                <AnkiToolbarIcon name="add" color={colors.textPrimary} />
            </TouchableOpacity>
        </>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={{ height: insets.top, backgroundColor: colors.accent }} pointerEvents="none" />
            <View style={styles.editorHeader}>
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleBack}
                    accessibilityRole="button"
                    accessibilityLabel={l('Geri dön', 'Go back')}
                >
                    <BackIcon color={colors.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {isEditing ? t('root.editCard') : l('Yeni kart', 'Add')}
                </Text>
                <View style={styles.headerSpacer} />
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel={isEditing ? l('Değişiklikleri kaydet', 'Save changes') : l('Kartı kaydet', 'Save card')}
                >
                    <CheckIcon color={colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={openPreview}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kartı önizle', 'Preview card')}
                >
                    <EyeIcon color={colors.white} size={25} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={() => setShowOverflowMenu(true)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Diğer seçenekler', 'More options')}
                >
                    <MoreIcon color={colors.white} />
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
                        <View style={styles.ankiSelectorChevron}>
                            {!isEditing && <ChevronDownIcon color={colors.textMuted} size={19} />}
                        </View>
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
                        <View style={styles.ankiSelectorChevron}>
                            <ChevronDownIcon color={colors.textMuted} size={19} />
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldName}>{isCloze ? l('Metin', 'Text') : l('Ön', 'Front')}</Text>
                    <View style={styles.fieldActions}>
                        <TouchableOpacity
                            style={[styles.fieldAction, isEditing && styles.fieldActionDisabled]}
                            onPress={() => togglePinnedField('question')}
                            disabled={isEditing}
                            accessibilityRole="button"
                            accessibilityLabel={pinnedFields.has('question')
                                ? (isCloze ? l('Metin alanının sabitlemesini kaldır', 'Unpin Text field') : l('Ön alanının sabitlemesini kaldır', 'Unpin Front field'))
                                : (isCloze ? l('Metin alanını sabitle', 'Pin Text field') : l('Ön alanını sabitle', 'Pin Front field'))}
                            accessibilityState={{ selected: pinnedFields.has('question'), disabled: isEditing }}
                        >
                            <PinIcon color={pinnedFields.has('question') ? colors.accent : colors.textMuted} />
                        </TouchableOpacity>
                        <MediaAttachButton
                            ref={questionMediaRef}
                            hasMedia={FIELD_MEDIA_RE.test(question)}
                            onInsert={(snippet) => questionEditorRef.current?.insertHtml(snippet)}
                        />
                    </View>
                </View>
                <RichTextEditor
                    ref={questionEditorRef}
                    value={question}
                    onChange={setQuestion}
                    onFocus={() => setActiveField('question')}
                    placeholder={isCloze
                        ? l('Metni yazın, sonra gizlenecek bölümü seçip […] düğmesine dokunun…', 'Enter text, then select the part to hide and tap […]…')
                        : l('Soruyu yazın…', 'Enter the question…')}
                    colors={colors}
                    fontSize={editorPreferences.fontSize}
                    capitalizeSentences={editorPreferences.capitalizeSentences}
                    pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                    mountDelayMs={0}
                />

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldName}>{isCloze ? l('Arka Ek', 'Back Extra') : l('Arka', 'Back')}</Text>
                    <View style={styles.fieldActions}>
                        <TouchableOpacity
                            style={[styles.fieldAction, isEditing && styles.fieldActionDisabled]}
                            onPress={() => togglePinnedField('answer')}
                            disabled={isEditing}
                            accessibilityRole="button"
                            accessibilityLabel={pinnedFields.has('answer')
                                ? (isCloze ? l('Arka Ek alanının sabitlemesini kaldır', 'Unpin Back Extra field') : l('Arka alanının sabitlemesini kaldır', 'Unpin Back field'))
                                : (isCloze ? l('Arka Ek alanını sabitle', 'Pin Back Extra field') : l('Arka alanını sabitle', 'Pin Back field'))}
                            accessibilityState={{ selected: pinnedFields.has('answer'), disabled: isEditing }}
                        >
                            <PinIcon color={pinnedFields.has('answer') ? colors.accent : colors.textMuted} />
                        </TouchableOpacity>
                        <MediaAttachButton
                            ref={answerMediaRef}
                            hasMedia={FIELD_MEDIA_RE.test(answer)}
                            onInsert={(snippet) => answerEditorRef.current?.insertHtml(snippet)}
                        />
                    </View>
                </View>
                <RichTextEditor
                    ref={answerEditorRef}
                    value={answer}
                    onChange={setAnswer}
                    onFocus={() => setActiveField('answer')}
                    placeholder={isCloze ? l('İsteğe bağlı ek arka metni…', 'Optional extra text for the back…') : l('Cevabı yazın…', 'Enter the answer…')}
                    colors={colors}
                    fontSize={editorPreferences.fontSize}
                    capitalizeSentences={editorPreferences.capitalizeSentences}
                    pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                    mountDelayMs={140}
                />

                {isOptionalReverse && (
                    <>
                        <View style={styles.fieldLabelRow}>
                            <Text style={styles.fieldName}>{l('Tersini Ekle', 'Add Reverse')}</Text>
                            <View style={styles.fieldActions}>
                                <TouchableOpacity
                                    style={[styles.fieldAction, isEditing && styles.fieldActionDisabled]}
                                    onPress={() => togglePinnedField('reverseAnswer')}
                                    disabled={isEditing}
                                    accessibilityRole="button"
                                    accessibilityLabel={pinnedFields.has('reverseAnswer') ? l('Tersini Ekle alanının sabitlemesini kaldır', 'Unpin Add Reverse field') : l('Tersini Ekle alanını sabitle', 'Pin Add Reverse field')}
                                    accessibilityState={{ selected: pinnedFields.has('reverseAnswer'), disabled: isEditing }}
                                >
                                    <PinIcon color={pinnedFields.has('reverseAnswer') ? colors.accent : colors.textMuted} />
                                </TouchableOpacity>
                                <MediaAttachButton
                                    ref={reverseMediaRef}
                                    hasMedia={FIELD_MEDIA_RE.test(reverseAnswer)}
                                    onInsert={(snippet) => reverseEditorRef.current?.insertHtml(snippet)}
                                />
                            </View>
                        </View>
                        <RichTextEditor
                            ref={reverseEditorRef}
                            value={reverseAnswer}
                            onChange={setReverseAnswer}
                            onFocus={() => setActiveField('reverseAnswer')}
                            placeholder={l('Ters kart oluşturmak için herhangi bir metin girin.', 'Enter any text to create a reverse card.')}
                            colors={colors}
                            fontSize={editorPreferences.fontSize}
                            capitalizeSentences={editorPreferences.capitalizeSentences}
                            pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                            mountDelayMs={280}
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
                <TouchableOpacity
                    style={styles.summaryRow}
                    onPress={openCardTemplates}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kart şablonlarını düzenle', 'Edit card templates')}
                    accessibilityHint={l('Seçili not türünün kart ve alan şablonlarını açar', 'Opens the card and field templates for the selected note type')}
                >
                    <Text style={styles.summaryLabel}>{l('Kartlar:', 'Cards:')}</Text>
                    <Text style={styles.summaryValue}>
                        {selectedNoteType?.templates.map((template) => template.name).join(' · ') || '—'}
                    </Text>
                    <Text style={styles.summaryChevron}>›</Text>
                </TouchableOpacity>
            </ScrollView>

            {editorPreferences.toolbarVisible && (
            <View style={styles.formatToolbar}>
                {editorPreferences.toolbarScrollable ? (
                    <ScrollView
                        horizontal
                        style={styles.formatToolbarScroll}
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="always"
                        contentContainerStyle={[
                            styles.formatToolbarContent,
                            centerToolbar && styles.formatToolbarContentCentered,
                        ]}
                    >
                        {renderFormattingToolbarItems()}
                    </ScrollView>
                ) : (
                    <View style={styles.formatToolbarWrapped}>
                        {renderFormattingToolbarItems()}
                    </View>
                )}
            </View>
            )}
            </KeyboardAvoidingView>
            <View style={{ height: insets.bottom, backgroundColor: colors.bgCard }} pointerEvents="none" />

            {showOverflowMenu && (
                <View style={styles.overflowOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowOverflowMenu(false)}
                        accessibilityLabel={l('Seçenekler menüsünü kapat', 'Close options menu')}
                    />
                    <View style={styles.overflowMenu} accessibilityViewIsModal>
                        <TouchableOpacity
                            style={styles.overflowItem}
                            onPress={() => runAfterOverflowClose(() => setShowFontSizePicker(true))}
                        >
                            <Text style={styles.overflowItemText}>{l('Yazı boyutu', 'Font size')}</Text>
                            <Text style={styles.overflowItemValue}>{editorPreferences.fontSize}</Text>
                            <Text style={styles.overflowChevron}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowItem}
                            onPress={() => updateEditorPreferences({ capitalizeSentences: !editorPreferences.capitalizeSentences })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: editorPreferences.capitalizeSentences }}
                        >
                            <Text style={styles.overflowItemText}>{l('Cümleleri büyük harfle başlat', 'Capitalize sentences')}</Text>
                            <View style={[styles.overflowCheckbox, editorPreferences.capitalizeSentences && styles.overflowCheckboxChecked]}>
                                {editorPreferences.capitalizeSentences && <Text style={styles.overflowCheckboxMark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowItem}
                            onPress={() => updateEditorPreferences({ toolbarVisible: !editorPreferences.toolbarVisible })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: editorPreferences.toolbarVisible }}
                        >
                            <Text style={styles.overflowItemText}>{l('Araç çubuğunu göster', 'Show toolbar')}</Text>
                            <View style={[styles.overflowCheckbox, editorPreferences.toolbarVisible && styles.overflowCheckboxChecked]}>
                                {editorPreferences.toolbarVisible && <Text style={styles.overflowCheckboxMark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.overflowItem, !editorPreferences.toolbarVisible && styles.overflowItemDisabled]}
                            disabled={!editorPreferences.toolbarVisible}
                            onPress={() => updateEditorPreferences({ toolbarScrollable: !editorPreferences.toolbarScrollable })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: editorPreferences.toolbarScrollable, disabled: !editorPreferences.toolbarVisible }}
                        >
                            <Text style={styles.overflowItemText}>{l('Araç çubuğunu kaydır', 'Scroll toolbar')}</Text>
                            <View style={[styles.overflowCheckbox, editorPreferences.toolbarScrollable && styles.overflowCheckboxChecked]}>
                                {editorPreferences.toolbarScrollable && <Text style={styles.overflowCheckboxMark}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <Modal visible={showFontSizePicker} transparent animationType="fade" onRequestClose={() => setShowFontSizePicker(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFontSizePicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Yazı boyutu', 'Font Size')}</Text>
                        {[12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
                            <TouchableOpacity
                                key={size}
                                style={[styles.fontSizeOption, editorPreferences.fontSize === size && styles.pickerOptionActive]}
                                onPress={() => {
                                    updateEditorPreferences({ fontSize: size });
                                    setShowFontSizePicker(false);
                                }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: editorPreferences.fontSize === size }}
                            >
                                <Text style={[styles.fontSizeSample, { fontSize: size }]}>{size}</Text>
                                {editorPreferences.fontSize === size && <Text style={styles.pickerCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowFontSizePicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showHeadingPicker}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowHeadingPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHeadingPicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Başlık ekle', 'Insert Heading')}</Text>
                        {['h1', 'h2', 'h3', 'h4', 'h5'].map((heading) => (
                            <TouchableOpacity
                                key={heading}
                                style={styles.formatPickerOption}
                                onPress={() => {
                                    runAfterFormattingDialogClose(
                                        () => setShowHeadingPicker(false),
                                        () => wrapEditorSelection(`<${heading}>`, `</${heading}>`),
                                    );
                                }}
                            >
                                <Text style={styles.formatPickerOptionText}>{heading}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowHeadingPicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showInlineFontSizePicker}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowInlineFontSizePicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowInlineFontSizePicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Yazı boyutu', 'Font Size')}</Text>
                        {['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large'].map((size) => (
                            <TouchableOpacity
                                key={size}
                                style={styles.formatPickerOption}
                                onPress={() => {
                                    runAfterFormattingDialogClose(
                                        () => setShowInlineFontSizePicker(false),
                                        () => wrapEditorSelection(`<span style="font-size:${size}">`, '</span>'),
                                    );
                                }}
                            >
                                <Text style={styles.formatPickerOptionText}>{size}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowInlineFontSizePicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showMathPicker}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowMathPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMathPicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('MathJax ekle', 'Insert MathJax')}</Text>
                        <TouchableOpacity
                            style={styles.formatPickerOption}
                            onPress={() => {
                                runAfterFormattingDialogClose(
                                    () => setShowMathPicker(false),
                                    () => wrapEditorSelection('\\[', '\\]'),
                                );
                            }}
                        >
                            <Text style={styles.formatPickerOptionText}>{l('Blok denklem', 'Block equation')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.formatPickerOption}
                            onPress={() => {
                                runAfterFormattingDialogClose(
                                    () => setShowMathPicker(false),
                                    () => wrapEditorSelection('\\( \\ce{', '} \\)'),
                                );
                            }}
                        >
                            <Text style={styles.formatPickerOptionText}>{l('Kimya denklemi', 'Chemistry equation')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowMathPicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showCustomToolbarEditor}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowCustomToolbarEditor(false)}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCustomToolbarEditor(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>
                            {editingToolbarButtonId
                                ? l('Araç çubuğu öğesini düzenle', 'Edit Toolbar Item')
                                : l('Araç çubuğu öğesi oluştur', 'Create Toolbar Item')}
                        </Text>
                        <Text style={styles.customToolbarExplanation}>
                            {l(
                                'Seçili metnin önüne ve arkasına eklenecek HTML’yi girin. Bir öğeyi düzenlemek veya kaldırmak için öğeye basılı tutun.',
                                'Enter HTML to be inserted before and after the selected text. Long press a toolbar item to edit or remove it.',
                            )}
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={toolbarButtonDraft.buttonText}
                            onChangeText={(buttonText) => setToolbarButtonDraft((draft) => ({ ...draft, buttonText }))}
                            placeholder={l('Düğme metni', 'Button text')}
                            placeholderTextColor={colors.textMuted}
                            maxLength={12}
                        />
                        <TextInput
                            style={[styles.modalInput, styles.customToolbarInput]}
                            value={toolbarButtonDraft.prefix}
                            onChangeText={(prefix) => setToolbarButtonDraft((draft) => ({ ...draft, prefix }))}
                            placeholder={l('Seçimden önceki HTML', 'HTML before selection')}
                            placeholderTextColor={colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TextInput
                            style={[styles.modalInput, styles.customToolbarInput]}
                            value={toolbarButtonDraft.suffix}
                            onChangeText={(suffix) => setToolbarButtonDraft((draft) => ({ ...draft, suffix }))}
                            placeholder={l('Seçimden sonraki HTML', 'HTML after selection')}
                            placeholderTextColor={colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <View style={styles.customToolbarActions}>
                            <TouchableOpacity style={styles.customToolbarTextAction} onPress={showToolbarHelp}>
                                <Text style={styles.customToolbarTextActionLabel}>{l('Yardım', 'Help')}</Text>
                            </TouchableOpacity>
                            {editingToolbarButtonId ? (
                                <TouchableOpacity style={styles.customToolbarTextAction} onPress={requestDeleteCustomToolbarButton}>
                                    <Text style={[styles.customToolbarTextActionLabel, styles.dangerText]}>{l('Sil', 'Delete')}</Text>
                                </TouchableOpacity>
                            ) : <View style={styles.customToolbarActionSpacer} />}
                            <TouchableOpacity style={styles.customToolbarTextAction} onPress={() => setShowCustomToolbarEditor(false)}>
                                <Text style={styles.customToolbarTextActionLabel}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.customToolbarTextAction} onPress={saveCustomToolbarButton}>
                                <Text style={styles.customToolbarTextActionLabel}>
                                    {editingToolbarButtonId ? l('Kaydet', 'Save') : t('common.create')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                visible={showCustomToolbarHelp}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowCustomToolbarHelp(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCustomToolbarHelp(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Özel araç düğmeleri', 'Custom Toolbar Buttons')}</Text>
                        <Text style={styles.customToolbarHelpText}>
                            {l(
                                'Düğmeye dokunulduğunda, seçili metin “önce” ve “sonra” alanlarındaki HTML ile sarılır. Metin seçili değilse imleç iki değer arasına yerleşir.',
                                'When tapped, the selected text is wrapped with the HTML in the before and after fields. If no text is selected, the cursor is placed between them.',
                            )}
                        </Text>
                        <View style={styles.customToolbarTemplate}>
                            <Text style={styles.customToolbarTemplateTitle}>{l('Örnek HTML düğmesi', 'Example HTML button')}</Text>
                            <Text style={styles.customToolbarCode}>{l('Düğme metni:', 'Button text:')} {l('Düğme', 'Button')}</Text>
                            <Text style={styles.customToolbarCode}>{l('Önce:', 'Before:')} {'<button type="button">'}</Text>
                            <Text style={styles.customToolbarCode}>{l('Sonra:', 'After:')} {'</button>'}</Text>
                        </View>
                        <TouchableOpacity style={styles.modalPrimary} onPress={useToolbarButtonTemplate}>
                            <Text style={styles.modalPrimaryText}>{l('Bu şablonu kullan', 'Use This Template')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowCustomToolbarHelp(false)}>
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                        </TouchableOpacity>
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
                        <Text style={styles.modalTitle}>{l('Not türü', 'Note Type')}</Text>
                        {CARD_TYPE_CHOICES.map((choice) => {
                            const noteType = getNoteType(choice) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === choice);
                            if (!noteType) return null;
                            const label = localizeNoteTypeName(locale, noteType.name);
                            const selected = cardTypeId === choice;
                            return (
                                <TouchableOpacity
                                    key={choice}
                                    style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                                    onPress={() => {
                                        setCardTypeId(choice);
                                        if (choice !== 7) setReverseAnswer('');
                                        setShowCardTypePicker(false);
                                    }}
                                    accessibilityState={{ selected }}
                                >
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

            <DeckPickerModal
                visible={showDeckPicker}
                colors={colors}
                decks={deckPickerDecks}
                selectedDeckName={targetDeck?.name ?? null}
                title={l('Hedef deste', 'Target Deck')}
                allDecksLabel={null}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setShowDeckPicker(false)}
                onSelect={(name) => {
                    if (!name) return;
                    const deck = getDeckByName(name);
                    if (!deck) return;
                    setTargetDeckId(deck.id);
                    setShowDeckPicker(false);
                }}
                onCreateDeck={(name) => {
                    const created = createDeck(getAvailableDeckName(name));
                    bumpDataVersion();
                    return created.name;
                }}
            />

            <Modal visible={showNewSubject} transparent animationType="fade" onRequestClose={() => setShowNewSubject(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowNewSubject(false)}
                        accessibilityLabel={l('Yeni ders penceresini kapat', 'Close new course dialog')}
                    />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Yeni ders', 'New Course')}</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={newSubjectName}
                            onChangeText={setNewSubjectName}
                            placeholder={l('Ders adı', 'Course name')}
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={handleCreateSubject}
                        />
                        <TouchableOpacity style={styles.modalPrimary} onPress={handleCreateSubject}>
                            <Text style={styles.modalPrimaryText}>{t('common.create')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowNewSubject(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
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
                        <View style={styles.previewTitleRow}>
                            <EyeIcon color={colors.textPrimary} size={24} />
                            <Text style={styles.previewTitleText}>{l('Önizleme', 'Preview')}</Text>
                        </View>
                        <ScrollView style={styles.previewScroll}>
                            <Text style={styles.previewMeta} numberOfLines={1}>
                                {targetDeck?.name.replaceAll('::', ' › ') ?? '—'}
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
        </View>
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
    headerTitle: {
        flexShrink: 1,
        color: colors.white,
        fontSize: FontSize.xl,
        fontWeight: '600',
        marginLeft: 4,
    },
    headerSpacer: { flex: 1 },
    editorScroll: { flex: 1, backgroundColor: colors.bgCard },
    content: {
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        paddingHorizontal: 6,
        paddingTop: 5,
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
    ankiSelectorChevron: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center' },
    formatToolbar: {
        backgroundColor: colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        minHeight: 44,
    },
    formatToolbarScroll: { width: '100%' },
    formatToolbarContent: {
        flexGrow: 1,
        minHeight: 44,
        alignItems: 'center',
        paddingHorizontal: 0,
    },
    formatToolbarContentCentered: { justifyContent: 'center' },
    formatToolbarWrapped: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 0,
    },
    formatButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    customFormatButtonText: {
        maxWidth: 38,
        fontSize: 24,
        lineHeight: 28,
        color: colors.textPrimary,
        textAlign: 'center',
    },
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
        marginTop: 5,
    },
    summaryLabel: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
    summaryValue: { flex: 1, fontSize: FontSize.sm, color: colors.textSecondary },
    summaryChevron: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
    overflowOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.18)',
        paddingTop: 58,
        paddingRight: 4,
        zIndex: 100,
        elevation: 100,
    },
    overflowMenu: {
        width: 282,
        paddingVertical: 4,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 2,
        overflow: 'hidden',
        ...Shadows.lg,
    },
    overflowItem: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: Spacing.sm,
    },
    overflowItemDisabled: { opacity: 0.4 },
    overflowItemText: { flex: 1, fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary },
    overflowItemValue: { fontSize: FontSize.sm, color: colors.textSecondary },
    overflowChevron: { fontSize: 23, color: colors.textMuted },
    overflowCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 2,
        borderWidth: 2,
        borderColor: colors.textMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overflowCheckboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    overflowCheckboxMark: { color: colors.white, fontSize: 14, lineHeight: 16, fontWeight: '900' },
    fontSizeOption: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    fontSizeSample: { color: colors.textPrimary },
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
    pickerOptionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
    pickerOptionTextActive: { color: colors.accent, fontWeight: '700' },
    pickerCheck: { fontSize: 20, fontWeight: '800', color: colors.accent },
    formatPickerOption: {
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    formatPickerOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
    customToolbarExplanation: {
        marginBottom: Spacing.md,
        fontSize: FontSize.sm,
        lineHeight: 20,
        color: colors.textSecondary,
    },
    customToolbarInput: { marginTop: Spacing.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    customToolbarActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: Spacing.md,
    },
    customToolbarActionSpacer: { flex: 1 },
    customToolbarTextAction: {
        minWidth: 58,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.sm,
    },
    customToolbarTextActionLabel: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
    customToolbarHelpText: { fontSize: FontSize.md, lineHeight: 22, color: colors.textSecondary },
    customToolbarTemplate: {
        marginTop: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        gap: Spacing.xs,
    },
    customToolbarTemplateTitle: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
    customToolbarCode: {
        fontSize: FontSize.sm,
        lineHeight: 20,
        color: colors.textSecondary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    previewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    previewTitleText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.md },
    modalInput: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        fontSize: FontSize.md,
        color: colors.textPrimary,
        backgroundColor: colors.bgSecondary,
    },
    modalPrimary: {
        minHeight: 48,
        marginTop: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.accent,
    },
    modalPrimaryText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
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
    fieldLabelRow: { minHeight: 40, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldName: { flex: 1, fontSize: FontSize.sm, fontWeight: '500', color: colors.textPrimary },
    fieldActions: { flexDirection: 'row', alignItems: 'center' },
    fieldAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    fieldActionDisabled: { opacity: 0.38 },
    });
}
