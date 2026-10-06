import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Pressable,
    useWindowDimensions,
    Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors } from '../constants/theme';
import { resolveSubjectDeckId } from '../lib/subjects';
import { confirm, alert, choose } from '../lib/confirm';
import {
    calloutHtml,
    changeTextCase,
    fontFamilyStyleValue,
    lineHeightStyleValue,
    linkHtml,
    nextCaseMode,
    stepFontSize,
    tableHtml,
    type EditorCaseMode,
    type EditorFontFamilyKey,
    type EditorFontSize,
    type EditorLineSpacing,
    type EditorToolbarTabId,
} from '../lib/editorToolbar';
import {
    EMPTY_EDITOR_FORMAT_STATE,
    type EditorFormatState,
} from '../lib/editorFormatState';
import { useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import {
    createTusCard,
    updateTusCardByCardId,
    deleteTusCardByCardId,
    findDuplicateNote,
    getAnkiCard,
    getAllNoteTypes,
    getCardsForNote,
    getNote,
    getNoteType,
    searchIndexCardFromNote,
    setNoteTagsByCardId,
} from '../lib/noteManager';
import { createDeck, getAllDecks, getAvailableDeckName, getDeck, getDeckByName } from '../lib/deckManager';
import { safeExternalCallbackUrl } from '../lib/externalLinking';
import { goBackOr } from '../lib/backNavigation';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType, type AnkiCard, type Note, type NoteTypeField } from '../lib/models';
import MediaAttachButton from '../components/MediaAttachButton';
import RichTextEditor, {
    type RichTextEditorHandle,
    type RichTextCommand,
} from '../components/RichTextEditor';
import { isCatalogCard, isCatalogDeck } from '../lib/catalogProtection';
import TagPickerModal from '../components/TagPickerModal';
import DeckPickerModal from '../components/DeckPickerModal';
import NoteTypePickerModal from '../components/NoteTypePickerModal';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import { localizeCardTemplateName, localizeFieldName, localizeNoteTypeName } from '../lib/i18n';
import { clozeFieldIndex, countCardsForNote, sanitizeUntrustedHtml } from '../lib/templates';
import { loadSettings, saveSettings } from '../lib/storage';
import { editorDraftKey, hasEditorDraftChanged, type EditorDraftState } from '../lib/editorDraft';
import { editorFieldFontSize } from '../lib/editorFieldStyle';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import {
    CUSTOM_TOOLBAR_PRESETS,
    loadCustomToolbarButtons,
    persistCustomToolbarButtons,
    sanitizeButtonText,
    sanitizeToolbarSnippet,
    type CustomToolbarButton,
    type CustomToolbarPreset,
    type LocalizedPresetText,
} from '../lib/customToolbar';
import { loadNoteTypeStickyFields, saveNoteTypeStickyFields } from '../lib/editorStickyFields';
import { createEditorStyles } from '../components/editor/editorStyles';
import {
    BackIcon,
    CheckIcon,
    ChevronDownIcon,
    EyeIcon,
    KeyboardDismissIcon,
    MoreIcon,
    PinIcon,
} from '../components/editor/EditorIcons';
import { buildEditorTools } from '../components/editor/editorTools';
import { EditorFormattingToolbar } from '../components/editor/EditorFormattingToolbar';
import { EditorOverflowMenu } from '../components/editor/EditorOverflowMenu';
import { EditorPreviewModal } from '../components/editor/EditorPreviewModal';
import { CustomToolbarEditorModal, CustomToolbarHelpModal } from '../components/editor/CustomToolbarModals';
import {
    CalloutPickerModal,
    ColorPickerModal,
    EditorFontSizeModal,
    FontFamilyPickerModal,
    HtmlSourceModal,
    InlineFontSizePickerModal,
    LineSpacingPickerModal,
    LinkEditorModal,
    MathPickerModal,
    TablePickerModal,
} from '../components/editor/FormatPickerModals';

function parseCardId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

// The preview dialog picks its card body height before the card renders, so the sheet never
// resizes once the WebView reports its intrinsic height. Everything else in the dialog — header,
// deck line, side toggle, close button and padding — is fixed, and adds up to this much.
const PREVIEW_CHROME_HEIGHT = 180;
const PREVIEW_BODY_MIN_HEIGHT = 180;
const PREVIEW_BODY_MAX_HEIGHT = 380;

export default function EditorScreen() {
    const { t, l, locale } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const { activeDeckName } = useStudyScope();
    const colors = useThemeColors();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const styles = useMemo(() => createEditorStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const previewBodyHeight = Math.max(
        PREVIEW_BODY_MIN_HEIGHT,
        Math.min(PREVIEW_BODY_MAX_HEIGHT, Math.round(screenHeight * 0.85) - PREVIEW_CHROME_HEIGHT),
    );

    const routeCardId = useMemo(() => {
        const explicitCardId = parseCardId(params.cardId);
        if (explicitCardId) return explicitCardId;

        // Legacy route param fallback.
        const legacyId = parseCardId(params.id);
        if (!legacyId) return null;
        return legacyId;
    }, [params.cardId, params.id]);

    const isCatalog = useMemo(() => {
        if (!routeCardId) return false;
        return isCatalogCard(routeCardId);
    }, [routeCardId, dataVersion]);

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
        if (requestedDeck && !requestedDeck.isFiltered && !isCatalogDeck(requestedDeck)) return requestedDeck.id;
        const legacySubject = typeof params.subject === 'string' ? params.subject : null;
        const legacySubjectDeck = legacySubject ? getDeck(resolveSubjectDeckId(legacySubject)) : null;
        if (legacySubjectDeck && !legacySubjectDeck.isFiltered && !isCatalogDeck(legacySubjectDeck)) return legacySubjectDeck.id;
        if (loadSettings().newCardDeckMode === 'default') {
            const defDeck = getDeckByName('Varsayılan') ?? getDeck(1);
            if (defDeck && !isCatalogDeck(defDeck)) return defDeck.id;
        }
        const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
        if (activeDeck && !activeDeck.isFiltered && !isCatalogDeck(activeDeck)) return activeDeck.id;
        return getDeck(1)?.id ?? getAllDecks().find((deck) => !deck.isFiltered && !isCatalogDeck(deck))?.id ?? null;
    });
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewSide, setPreviewSide] = useState<'question' | 'answer'>('question');
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [showCardTypePicker, setShowCardTypePicker] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [showFontSizePicker, setShowFontSizePicker] = useState(false);
    const [showInlineFontSizePicker, setShowInlineFontSizePicker] = useState(false);
    const [showFontFamilyPicker, setShowFontFamilyPicker] = useState(false);
    const [showLineSpacingPicker, setShowLineSpacingPicker] = useState(false);
    // Word's Shift+F3 walks Sentence → lower → UPPER, and the ribbon's Aa button walks the same
    // cycle. The mode is remembered per run of presses so the third press returns to the start
    // rather than sticking on UPPERCASE.
    const caseModeRef = useRef<EditorCaseMode | null>(null);
    /** The text the last Change Case press wrote, so its own echo does not restart the cycle. */
    const caseTextRef = useRef<string>('');
    const [showMathPicker, setShowMathPicker] = useState(false);
    const [toolbarTab, setToolbarTab] = useState<EditorToolbarTabId>('home');
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [showCalloutPicker, setShowCalloutPicker] = useState(false);
    const [showLinkEditor, setShowLinkEditor] = useState(false);
    const [linkDraft, setLinkDraft] = useState({ url: '', label: '' });
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showHtmlEditor, setShowHtmlEditor] = useState(false);
    const [htmlEditorValue, setHtmlEditorValue] = useState('');
    const [showCustomToolbarEditor, setShowCustomToolbarEditor] = useState(false);
    const [showCustomToolbarHelp, setShowCustomToolbarHelp] = useState(false);
    const [editingToolbarButtonId, setEditingToolbarButtonId] = useState<string | null>(null);
    const [toolbarButtonDraft, setToolbarButtonDraft] = useState({ buttonText: '', prefix: '', suffix: '' });
    const [customToolbarButtons, setCustomToolbarButtons] = useState<CustomToolbarButton[]>(loadCustomToolbarButtons);

    const passiveOverlayOpen = showPreview
        || showCardTypePicker
        || showOverflowMenu
        || showFontSizePicker
        || showInlineFontSizePicker
        || showFontFamilyPicker
        || showLineSpacingPicker
        || showMathPicker
        || showTablePicker
        || showCalloutPicker
        || showLinkEditor
        || showColorPicker
        || showHtmlEditor
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
    const [formatState, setFormatState] = useState<EditorFormatState>(EMPTY_EDITOR_FORMAT_STATE);
    const [cardTypeId, setCardTypeId] = useState(() => routeNoteTypeId ?? 1);

    const selectedNoteType = useMemo(
        () => getNoteType(cardTypeId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === cardTypeId) ?? null,
        [cardTypeId, dataVersion],
    );
    const isCloze = selectedNoteType?.kind === 'cloze';

    const availableNoteTypes = useMemo(() => {
        const list = getAllNoteTypes().filter((nt) => !isLegacyTusNoteType(nt));
        if (selectedNoteType && !list.some((nt) => nt.id === selectedNoteType.id)) {
            list.unshift(selectedNoteType);
        }
        return list;
    }, [dataVersion, selectedNoteType]);

    // The stand-in pair only appears when the chosen note type has gone missing; it carries no
    // font or size of its own so those fall back to the editor's own preference rather than to a
    // zero that would render the field's text at no height at all.
    const fieldsToRender: NoteTypeField[] = useMemo(() => {
        if (selectedNoteType && selectedNoteType.fields.length > 0) {
            return selectedNoteType.fields;
        }
        return [
            { ord: 0, name: 'Front', sticky: false, rtl: false },
            { ord: 1, name: 'Back', sticky: false, rtl: false },
        ];
    }, [selectedNoteType]);

    const stickyFieldDefaults = useMemo(
        () => (routeCardId ? {} : loadNoteTypeStickyFields(cardTypeId)),
        [routeCardId, cardTypeId],
    );

    const [fieldValues, setFieldValuesState] = useState<string[]>(() => {
        if (routeFieldValues.length > 0) return routeFieldValues;
        const noteType = getNoteType(routeNoteTypeId ?? 1) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === (routeNoteTypeId ?? 1));
        const count = noteType?.fields.length ?? 2;
        const initial = new Array(count).fill('');
        if (params.question && typeof params.question === 'string') {
            initial[0] = params.question;
        } else if (!routeCardId && stickyFieldDefaults[0]?.value) {
            initial[0] = stickyFieldDefaults[0].value;
        }
        if (params.answer && typeof params.answer === 'string') {
            initial[1] = params.answer;
        } else if (!routeCardId && stickyFieldDefaults[1]?.value) {
            initial[1] = stickyFieldDefaults[1].value;
        }
        for (let i = 2; i < count; i++) {
            if (!routeCardId && stickyFieldDefaults[i]?.value) {
                initial[i] = stickyFieldDefaults[i].value;
            }
        }
        return initial;
    });
    // Each field reports its edits from its own document, and React applies them on a later
    // render. A save pressed in between would otherwise write the previous render's fields and
    // drop the last words typed, so every write also lands here at once and saving reads this.
    const fieldValuesRef = useRef(fieldValues);
    const setFieldValues = useCallback((next: React.SetStateAction<string[]>) => {
        const resolved = typeof next === 'function' ? next(fieldValuesRef.current) : next;
        fieldValuesRef.current = resolved;
        setFieldValuesState(resolved);
    }, []);

    const [pinnedFields, setPinnedFields] = useState<Set<number>>(() => {
        return new Set(
            Object.entries(stickyFieldDefaults)
                .filter(([_, entry]) => entry.pinned)
                .map(([ord]) => Number(ord)),
        );
    });

    const [activeFieldIndex, setActiveFieldIndex] = useState<number>(0);
    const fieldEditorRefs = useRef<(RichTextEditorHandle | null)[]>([]);
    const toolbarScrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        toolbarScrollRef.current?.scrollTo({ x: 0, animated: false });
    }, [toolbarTab]);

    const [noteTags, setNoteTags] = useState<string[]>(() => (
        typeof params.tags === 'string' ? params.tags.split(/\s+/).filter(Boolean) : []
    ));
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));

    const initialDraftRef = useRef<EditorDraftState | null>(
        routeCardId
            ? null
            : {
                fields: fieldValues,
                question: fieldValues[0] || '',
                answer: fieldValues[1] || '',
                reverseAnswer: cardTypeId === 7 ? (fieldValues[2] || '') : '',
                cardTypeId: routeNoteTypeId ?? 1,
                deckId: targetDeckId,
                tags: typeof params.tags === 'string' ? params.tags.split(/\s+/).filter(Boolean) : [],
            },
    );
    const [initialDraftKey, setInitialDraftKey] = useState<string | null>(() => (
        initialDraftRef.current ? editorDraftKey(initialDraftRef.current, isEditing) : null
    ));
    const initialDraftKeyRef = useRef<string | null>(
        initialDraftRef.current ? editorDraftKey(initialDraftRef.current, isEditing) : null
    );
    const resetDraftBaseline = (draft: EditorDraftState | null) => {
        initialDraftRef.current = draft;
        const nextKey = draft ? editorDraftKey(draft, isEditing) : null;
        initialDraftKeyRef.current = nextKey;
        setInitialDraftKey(nextKey);
    };

    const targetDeck = useMemo(() => {
        if (targetDeckId) return getDeck(targetDeckId);
        if (activeDeckName) return getDeckByName(activeDeckName) ?? getDeck(1);
        return getDeck(1);
    }, [targetDeckId, activeDeckName, dataVersion]);

    const deckPickerDecks = useMemo(
        () => showDeckPicker
            ? getAllDecks().filter((deck) => !deck.isFiltered && !isCatalogDeck(deck))
            : [],
        [dataVersion, showDeckPicker],
    );

    // Read once per opening rather than on every render the open dialog goes through.
    const previewAudioPlaybackRate = useMemo(
        () => (showPreview ? loadSettings().audioPlaybackRate ?? 1.0 : 1.0),
        [showPreview],
    );

    const previewPayload = useMemo(() => {
        if (!showPreview) return null;
        const noteType = selectedNoteType;
        if (!noteType) return null;
        const fields = noteType.fields.map((_, i) => fieldValues[i] || '');
        if (fields.length > 0 && !fields[0]) {
            fields[0] = l('(boş soru)', '(empty question)');
        }
        if (fields.length > 1 && !fields[1]) {
            fields[1] = l('(boş cevap)', '(empty answer)');
        }
        const note: Note = {
            id: -1,
            guid: 'preview',
            noteTypeId: noteType.id,
            mod: 0,
            usn: -1,
            tags: noteTags,
            fields,
            sfld: fields[noteType.sortFieldIdx] || fields[0] || '',
            csum: 0,
            flags: 0,
        };
        const card: AnkiCard = {
            id: -1, noteId: -1, deckId: targetDeck?.id ?? 1, ord: 0, mod: 0, usn: -1,
            type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0,
            left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        };
        return { noteType, note, card };
    }, [showPreview, fieldValues, targetDeck?.id, cardTypeId, noteTags, selectedNoteType, l]);

    useEffect(() => {
        if (!routeCardId) return;

        resetDraftBaseline(null);

        const card = getAnkiCard(routeCardId);
        if (!card) return;
        const note = getNote(card.noteId);
        if (!note) return;

        const noteType = getNoteType(note.noteTypeId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === note.noteTypeId);
        const count = Math.max(noteType?.fields.length ?? 0, note.fields.length, 2);
        const loadedFields = new Array(count).fill('').map((_, i) => note.fields[i] || '');

        setTargetDeckId(card.deckId);
        setFieldValues(loadedFields);
        setNoteTags(note.tags);
        setCardTypeId(note.noteTypeId);
        setIsEditing(true);
        resetDraftBaseline({
            fields: loadedFields,
            question: loadedFields[0] || '',
            answer: loadedFields[1] || '',
            reverseAnswer: note.noteTypeId === 7 ? loadedFields[2] || '' : '',
            cardTypeId: note.noteTypeId,
            deckId: card.deckId,
            tags: note.tags,
        });
    }, [routeCardId]);

    useEffect(() => {
        if (routeCardId || targetDeckId !== null) return;
        if (loadSettings().newCardDeckMode === 'default') {
            const defDeck = getDeckByName('Varsayılan') ?? getDeck(1);
            setTargetDeckId(defDeck && !isCatalogDeck(defDeck) ? defDeck.id : (getDeck(1)?.id ?? null));
            return;
        }
        const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
        setTargetDeckId(activeDeck && !activeDeck.isFiltered && !isCatalogDeck(activeDeck) ? activeDeck.id : (getDeck(1)?.id ?? null));
    }, [routeCardId, targetDeckId, activeDeckName]);

    useEffect(() => {
        if (routeCardId) return;
        if (!routeDeckId) return;
        const requestedDeck = getDeck(routeDeckId);
        if (requestedDeck && !requestedDeck.isFiltered && !isCatalogDeck(requestedDeck)) {
            setTargetDeckId(requestedDeck.id);
            const baseline = initialDraftRef.current;
            if (baseline && baseline.deckId !== requestedDeck.id) {
                resetDraftBaseline({ ...baseline, deckId: requestedDeck.id });
            }
        }
    }, [routeCardId, routeDeckId]);

    const draftDeckSeededRef = useRef(Boolean(routeCardId) || targetDeckId !== null);
    useEffect(() => {
        if (routeCardId || targetDeckId === null || draftDeckSeededRef.current) return;
        draftDeckSeededRef.current = true;
        const baseline = initialDraftRef.current;
        if (baseline) resetDraftBaseline({ ...baseline, deckId: targetDeckId });
    }, [routeCardId, targetDeckId]);

    const draftFromFields = (fields: string[]): EditorDraftState => ({
        fields,
        question: fields[0] || '',
        answer: fields[1] || '',
        reverseAnswer: cardTypeId === 7 ? (fields[2] || '') : '',
        cardTypeId,
        deckId: targetDeckId,
        tags: noteTags,
    });
    const currentDraft: EditorDraftState = useMemo(
        () => draftFromFields(fieldValues),
        [fieldValues, cardTypeId, targetDeckId, noteTags],
    );
    const isDirty = hasEditorDraftChanged(initialDraftKey, currentDraft, isEditing);
    useUnsavedChangesGuard(isDirty, {
        title: l('Değişiklikler atılsın mı?', 'Discard Changes?'),
        message: isEditing
            ? l('Kaydetmeden kart düzenleme ekranından çıkılsın mı?', 'Leave the card editor without saving?')
            : l('Kaydetmeden not ekleme ekranından çıkılsın mı?', 'Leave the add note screen without saving?'),
    });

    const cardTypeLabel = selectedNoteType
        ? localizeNoteTypeName(locale, selectedNoteType.name)
        : l('Bilinmeyen', 'Unknown');

    const handleFieldChange = (index: number, value: string) => {
        setFieldValues((prev) => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    // The note this screen has just added, until the fields move on to the next one. The fields
    // still hold its text while the save is acknowledged, and it must not be reported as a
    // duplicate of itself.
    const [savedNoteId, setSavedNoteId] = useState<number | null>(null);

    const duplicateNote = useMemo(() => {
        const firstField = fieldValues[0];
        if (!firstField || !firstField.trim()) return null;
        const currentCard = routeCardId ? getAnkiCard(routeCardId) : null;
        return findDuplicateNote(cardTypeId, firstField, currentCard?.noteId ?? savedNoteId ?? undefined);
    }, [fieldValues[0], cardTypeId, routeCardId, savedNoteId, dataVersion]);

    // `findDuplicateNote` already joins the first card's deck, so the name is read off its result
    // rather than fetched again: this runs on every keystroke in the first field.
    const duplicateDeckName = duplicateNote?.deckName
        ? duplicateNote.deckName.replaceAll('::', ' › ')
        : null;

    const handleSelectNoteType = (newId: number) => {
        if (newId === cardTypeId) {
            setShowCardTypePicker(false);
            return;
        }
        const newType = getNoteType(newId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === newId);
        if (!newType) return;

        const count = newType.fields.length;
        const nextFields = new Array(count).fill('').map((_, i) => fieldValuesRef.current[i] || '');

        const stickyDefaults = routeCardId ? {} : loadNoteTypeStickyFields(newId);
        for (let i = 0; i < count; i++) {
            if (!nextFields[i] && stickyDefaults[i]?.value) {
                nextFields[i] = stickyDefaults[i].value;
            }
        }

        setCardTypeId(newId);
        setFieldValues(nextFields);
        setPinnedFields(new Set(
            Object.entries(stickyDefaults)
                .filter(([_, entry]) => entry.pinned)
                .map(([ord]) => Number(ord)),
        ));
        setShowCardTypePicker(false);
    };

    const getActiveEditor = () => {
        return fieldEditorRefs.current[activeFieldIndex] ?? fieldEditorRefs.current[0] ?? null;
    };

    /** Bring every field's newest edit into `fieldValuesRef` before a handler reads the fields. */
    const flushFieldEdits = () => {
        fieldEditorRefs.current.forEach((fieldEditor) => fieldEditor?.flushChange());
    };

    const persistStickyFieldValues = (pinned: Set<number> = pinnedFields) => {
        const persisted: Record<number, { pinned: boolean; value: string }> = {};
        if (selectedNoteType) {
            selectedNoteType.fields.forEach((field, index) => {
                if (pinned.has(field.ord)) {
                    persisted[field.ord] = { pinned: true, value: fieldValuesRef.current[index] || '' };
                }
            });
        }
        saveNoteTypeStickyFields(cardTypeId, persisted);
    };

    const togglePinnedField = (fieldOrd: number) => {
        if (isEditing) return;
        setPinnedFields((current) => {
            const next = new Set(current);
            if (next.has(fieldOrd)) next.delete(fieldOrd);
            else next.add(fieldOrd);
            persistStickyFieldValues(next);
            return next;
        });
    };

    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            () => setKeyboardVisible(true),
        );
        const hideSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setKeyboardVisible(false),
        );
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const dismissEditorKeyboard = useCallback(() => {
        Keyboard.dismiss();
        fieldEditorRefs.current.forEach((ref) => ref?.blur());
    }, []);

    const wrapEditorSelection = (prefix: string, suffix: string) => {
        getActiveEditor()?.wrapSelection(prefix, suffix);
    };

    const runEditorCommand = (command: RichTextCommand, value?: string) => {
        getActiveEditor()?.runCommand(command, value);
    };

    const insertEditorHtml = (html: string) => {
        getActiveEditor()?.insertHtml(html);
    };

    const applyFontSize = (size: EditorFontSize) => {
        wrapEditorSelection(`<span style="font-size:${size}">`, '</span>');
    };

    /** Word's grow/shrink: one step along the size ladder from whatever the caret already sits in. */
    const stepEditorFontSize = (direction: 1 | -1) => {
        applyFontSize(stepFontSize(formatState.fontSize, direction));
    };

    const applyFontFamily = (key: EditorFontFamilyKey) => {
        const css = fontFamilyStyleValue(key);
        // The default entry writes `inherit` rather than nothing, so choosing it actually clears a
        // family the user set earlier instead of leaving the old span in place.
        wrapEditorSelection(`<span style="font-family:${css ?? 'inherit'}">`, '</span>');
    };

    const applyLineSpacing = (spacing: EditorLineSpacing) => {
        getActiveEditor()?.applyBlockStyle('lineHeight', lineHeightStyleValue(spacing));
    };

    /**
     * Word's Change Case. The selected text is recased here rather than in the document, so the
     * Turkish dotted/dotless i rules in `changeTextCase` apply — WebKit has no locale-aware
     * transform of its own, and an English mapping turns `İSTANBUL` into a broken `i̇stanbul`.
     */
    const cycleTextCase = () => {
        const selected = formatState.selectionText;
        if (!selected) return;
        const mode = nextCaseMode(caseModeRef.current);
        caseModeRef.current = mode;
        const recased = changeTextCase(selected, mode, locale);
        // The replacement stays selected, so the reading that comes back is this text rather than
        // a collapsed caret. Remembering it is what stops that reading from resetting the cycle.
        caseTextRef.current = recased;
        getActiveEditor()?.replaceSelectionText(recased);
    };

    const openLinkEditor = () => {
        Keyboard.dismiss();
        setLinkDraft({ url: '', label: '' });
        setShowLinkEditor(true);
    };

    const confirmLink = () => {
        const html = linkHtml(linkDraft.url, linkDraft.label);
        if (!html) {
            alert(
                l('Bağlantı eklenemedi', 'Link not added'),
                l('Yalnızca http, https ve mailto adresleri eklenebilir.', 'Only http, https and mailto addresses can be added.'),
            );
            return;
        }
        runAfterFormattingDialogClose(() => setShowLinkEditor(false), () => insertEditorHtml(html));
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
        const cleanPrefix = sanitizeToolbarSnippet(toolbarButtonDraft.prefix);
        const cleanSuffix = sanitizeToolbarSnippet(toolbarButtonDraft.suffix);

        if (!cleanPrefix && !cleanSuffix) {
            alert(
                t('common.error'),
                l(
                    'Seçili metnin önüne veya arkasına eklenecek geçerli bir HTML değeri girin (ör. <span>, <mark>, <b>). Güvenlik nedeniyle komut dosyaları ve form etiketleri eklenemez.',
                    'Enter at least one valid HTML value (e.g. <span>, <mark>, <b>). Script and form elements are blocked for security.',
                ),
            );
            return;
        }

        setCustomToolbarButtons((current) => {
            const fallbackIndex = (editingToolbarButtonId
                ? current.findIndex((button) => button.id === editingToolbarButtonId)
                : current.length) + 1;
            const buttonText = sanitizeButtonText(toolbarButtonDraft.buttonText, String(fallbackIndex));

            const nextButton: CustomToolbarButton = {
                id: editingToolbarButtonId ?? `toolbar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                buttonText,
                prefix: cleanPrefix,
                suffix: cleanSuffix,
            };
            const next = editingToolbarButtonId
                ? current.map((button) => button.id === editingToolbarButtonId ? nextButton : button)
                : [...current, nextButton];
            persistCustomToolbarButtons(next);
            return next;
        });
        setShowCustomToolbarEditor(false);
    };

    // Presets carry their own copy rather than a translation key, so the screen resolves them
    // through the same locale helper as everything else it renders.
    const presetText = (text: LocalizedPresetText) => l(text.tr, text.en);

    const applyToolbarPreset = (preset: CustomToolbarPreset) => {
        setToolbarButtonDraft({
            buttonText: presetText(preset.buttonText),
            prefix: preset.prefix,
            suffix: preset.suffix,
        });
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

    const useToolbarButtonTemplate = (preset?: CustomToolbarPreset) => {
        setShowCustomToolbarHelp(false);
        const target = preset ?? CUSTOM_TOOLBAR_PRESETS[0];
        setEditingToolbarButtonId(null);
        setToolbarButtonDraft({
            buttonText: presetText(target.buttonText),
            prefix: target.prefix,
            suffix: target.suffix,
        });
        setTimeout(() => setShowCustomToolbarEditor(true), Platform.OS === 'ios' ? 180 : 0);
    };

    const openPreview = () => {
        Keyboard.dismiss();
        setPreviewSide('question');
        requestAnimationFrame(() => {
            setShowPreview(true);
        });
    };

    const handleBack = () => {
        goBackOr(router);
    };
    const requestClearFields = () => {
        setShowOverflowMenu(false);
        confirm(
            l('Alanları temizle', 'Clear Fields'),
            l('Tüm alanlardaki içerik temizlensin mi?', 'Clear the contents of all fields?'),
            () => {
                setFieldValues(fieldsToRender.map(() => ''));
                fieldEditorRefs.current[0]?.focus();
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

    /**
     * The overflow menu's four rows are app preferences, not part of the note being written, so
     * they are written the moment they are toggled. Persisting them from the save path instead
     * meant hiding the toolbar and then leaving without adding a note silently discarded the
     * choice.
     */
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

    /**
     * A catalog note's fields, note type and deck are all locked, so the only thing that can be
     * dirty on this screen is the tag list. It is written through `setNoteTagsByCardId`, which
     * touches tags and nothing else, instead of the full save path that refuses a protected note.
     */
    const handleSaveCatalogTags = () => {
        if (!routeCardId) return;
        dismissEditorKeyboard();
        setShowOverflowMenu(false);
        try {
            setNoteTagsByCardId(routeCardId, noteTags);
            resetDraftBaseline(currentDraft);
            bumpDataVersion();
            alert(t('common.completed'), l('Etiketler kaydedildi.', 'Tags saved.'), () => goBackOr(router));
        } catch (e) {
            console.warn('[Editor] catalog tag save failed:', e);
            alert(t('common.error'), l('Etiketler kaydedilemedi.', 'Could not save the tags.'));
        }
    };

    /**
     * Reset the screen for the next note the way Anki's Add dialog does: the pinned fields keep
     * what they hold, everything else empties, and the deck, note type and tags stay as they were
     * chosen. The baseline moves with them so the cleared screen is not immediately dirty.
     */
    const startNextNote = () => {
        const nextFields = fieldsToRender.map((field, index) => (
            pinnedFields.has(field.ord) ? (fieldValuesRef.current[index] || '') : ''
        ));
        setFieldValues(nextFields);
        setSavedNoteId(null);
        setActiveFieldIndex(0);
        resetDraftBaseline(draftFromFields(nextFields));
        // The fields are controlled, so their documents are cleared by the render this state
        // change causes; the caret is placed once that has happened.
        requestAnimationFrame(() => fieldEditorRefs.current[0]?.focus());
    };

    const handleSave = () => {
        if (isCatalog) {
            handleSaveCatalogTags();
            return;
        }
        flushFieldEdits();
        dismissEditorKeyboard();
        setShowOverflowMenu(false);
        const latestFields = fieldValuesRef.current;
        const savedDraft = draftFromFields(latestFields);
        const currentFields = selectedNoteType
            ? selectedNoteType.fields.map((_, i) => (latestFields[i] || '').trim())
            : latestFields.map((f) => f.trim());

        const mockNote: Note = {
            id: 0,
            guid: '',
            noteTypeId: cardTypeId,
            mod: 0,
            usn: 0,
            tags: noteTags,
            fields: currentFields,
            sfld: currentFields[selectedNoteType?.sortFieldIdx ?? 0] || currentFields[0] || '',
            csum: 0,
            flags: 0,
        };
        const cardsCount = selectedNoteType ? countCardsForNote(selectedNoteType, mockNote) : 0;
        if (cardsCount === 0) {
            alert(
                t('common.error'),
                isCloze
                    ? l('En az bir boşluk ekleyin. Metni seçip araç çubuğundaki […] düğmesine dokunun.', 'Add at least one cloze deletion. Select text, then tap […] in the toolbar.')
                    : l('Girilen alanlar hiç kart oluşturmuyor. Lütfen kart oluşturacak en az bir alan doldurun.', 'The entered fields do not generate any cards. Please fill in at least one field that generates a card.'),
            );
            return;
        }
        if (!targetDeck || targetDeck.isFiltered) {
            alert(t('common.error'), l('Lütfen not için bir deste seçin.', 'Please choose a deck for the note.'));
            return;
        }

        try {
            if (isEditing && routeCardId) {
                const updated = updateTusCardByCardId(routeCardId, {
                    question: currentFields[0] || '',
                    answer: currentFields[1] || '',
                    tags: noteTags,
                    reverseAnswer: cardTypeId === 7 ? currentFields[2] : undefined,
                    deckId: targetDeck.id,
                    fieldValues: currentFields,
                });

                if (!updated) {
                    alert(t('common.error'), l('Kart güncellenemedi.', 'Could not update the card.'));
                    return;
                }

                // Sibling cards indexing
                for (const sibling of getCardsForNote(updated.note.id)) {
                    dbUpsertFtsCard(searchIndexCardFromNote(updated.note, sibling.id));
                }

                resetDraftBaseline(savedDraft);
                bumpDataVersion();
                alert(t('common.completed'), l('Kart güncellendi.', 'Card updated.'), () => goBackOr(router));
            } else {
                const created = createTusCard({
                    question: currentFields[0] || '',
                    answer: currentFields[1] || '',
                    tags: noteTags,
                    deckId: targetDeck.id,
                    noteTypeId: cardTypeId,
                    reverseAnswer: cardTypeId === 7 ? currentFields[2] : undefined,
                    fieldValues: currentFields,
                });

                for (const generatedCard of created.cards) {
                    dbUpsertFtsCard(searchIndexCardFromNote(created.note, generatedCard.id));
                }

                persistStickyFieldValues();
                resetDraftBaseline(savedDraft);
                setSavedNoteId(created.note.id);
                bumpDataVersion();
                const savedMessage = l(
                    `Not kaydedildi; ${created.cards.length} kart oluşturuldu.`,
                    `Note saved; ${created.cards.length} card${created.cards.length === 1 ? '' : 's'} created.`,
                );

                // A Shortcuts/x-callback add has one note to write and a caller waiting for it, so
                // it keeps the single acknowledgement and hands control straight back.
                if (externalSuccessUrl) {
                    alert(t('common.completed'), savedMessage, () => {
                        void Linking.openURL(externalSuccessUrl).catch(() => goBackOr(router));
                    });
                    return;
                }

                // Anki's Add dialog stays open so a run of notes is one visit rather than one
                // round trip through the deck list each. Leaving is still the other button, and
                // it is what the acknowledgement offered before this choice existed.
                void choose(
                    t('common.completed'),
                    savedMessage,
                    l('Yeni not ekle', 'Add another'),
                    l('Bitti', 'Done'),
                ).then((addAnother) => {
                    if (addAnother) startNextNote();
                    else goBackOr(router);
                });
            }
        } catch (e) {
            console.warn('[Editor] save failed:', e);
            alert(t('common.error'), l('Not kaydedilemedi.', 'Could not save the note.'));
        }
    };

    /**
     * Anki deletes the note, not the one card that was opened, so the confirmation names the note
     * and counts the siblings that go with it rather than promising to remove a single card.
     */
    const handleDelete = () => {
        if (!routeCardId) return;
        setShowOverflowMenu(false);
        if (isCatalog) {
            alert(l('Korumalı Kart', 'Protected Card'), l('Dahili TUS kartları silinemez.', 'Built-in TUS cards cannot be deleted.'));
            return;
        }

        const card = getAnkiCard(routeCardId);
        const siblingCount = card ? getCardsForNote(card.noteId).length : 1;
        confirm(
            l('Notu sil', 'Delete Note'),
            siblingCount > 1
                ? l(
                    `Bu not ve ondan üretilen ${siblingCount} kart silinsin mi? Bu işlem geri alınamaz.`,
                    `Delete this note and the ${siblingCount} cards it generates? This cannot be undone.`,
                )
                : l(
                    'Bu not silinsin mi? Bu işlem geri alınamaz.',
                    'Delete this note? This cannot be undone.',
                ),
            () => {
                try {
                    deleteTusCardByCardId(routeCardId);
                    // The note is gone, so the unsaved-changes guard must not stop the screen from
                    // closing over a draft that no longer has anything to be saved into.
                    resetDraftBaseline(draftFromFields(fieldValuesRef.current));
                    bumpDataVersion();
                    alert(l('Silindi', 'Deleted'), l('Not silindi.', 'Note deleted.'), () => goBackOr(router));
                } catch (e) {
                    console.warn('[Editor] delete failed:', e);
                    alert(t('common.error'), l('Not silinemedi.', 'Could not delete the note.'));
                }
            },
            { destructive: true },
        );
    };

    const toolsByKey = buildEditorTools(l, {
        runCommand: runEditorCommand,
        wrapSelection: wrapEditorSelection,
        stepFontSize: stepEditorFontSize,
        cycleTextCase,
        openColorPicker: () => setShowColorPicker(true),
        openFontFamilyPicker: () => { Keyboard.dismiss(); setShowFontFamilyPicker(true); },
        openInlineFontSizePicker: () => setShowInlineFontSizePicker(true),
        openLineSpacingPicker: () => { Keyboard.dismiss(); setShowLineSpacingPicker(true); },
        openTablePicker: () => { Keyboard.dismiss(); setShowTablePicker(true); },
        openLinkEditor,
        openCalloutPicker: () => { Keyboard.dismiss(); setShowCalloutPicker(true); },
        openMathPicker: () => setShowMathPicker(true),
        openHtmlSource: () => {
            Keyboard.dismiss();
            flushFieldEdits();
            const currentVal = fieldValuesRef.current[activeFieldIndex] ?? '';
            setHtmlEditorValue(currentVal);
            setShowHtmlEditor(true);
        },
    });

    return (
        <View style={styles.container}>
            <View style={[{ height: insets.top, backgroundColor: colors.accent }, { pointerEvents: 'none' }]} />
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
                    {isEditing ? t('root.editCard') : l('Not ekle', 'Add note')}
                </Text>
                <View style={styles.headerSpacer} />
                {/* On a catalog note only the tags can be dirty, so the button appears once they are. */}
                {(!isCatalog || isDirty) && (
                    <TouchableOpacity
                        style={styles.headerAction}
                        onPress={handleSave}
                        accessibilityRole="button"
                        accessibilityLabel={isCatalog
                            ? l('Etiketleri kaydet', 'Save tags')
                            : isEditing ? l('Değişiklikleri kaydet', 'Save changes') : l('Notu kaydet', 'Save note')}
                    >
                        <CheckIcon color={colors.white} />
                    </TouchableOpacity>
                )}
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
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
                <View style={styles.selectorGroup}>
                    {/*
                      * The note type is fixed once a note exists, as it is in Anki's edit dialog.
                      * The row still answers a press: a tap that does nothing and says nothing
                      * reads as a broken control rather than a locked one.
                      */}
                    <TouchableOpacity
                        style={styles.ankiSelectorRow}
                        onPress={() => {
                            if (isCatalog) {
                                alert(l('Korumalı Kart', 'Protected Card'), l('Dahili TUS kartlarının not türü değiştirilemez.', 'Note type of built-in TUS cards cannot be changed.'));
                                return;
                            }
                            if (isEditing) {
                                alert(
                                    l('Not türü değiştirilemez', 'Note Type Is Fixed'),
                                    l(
                                        'Var olan bir notun türü bu ekrandan değiştirilemez. Yeni bir not eklerken tür seçebilirsiniz.',
                                        'An existing note keeps the note type it was created with. Choose a type when you add a new note.',
                                    ),
                                );
                                return;
                            }
                            setShowCardTypePicker(true);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isEditing }}
                        accessibilityLabel={l(`Kart türü: ${cardTypeLabel}`, `Note type: ${cardTypeLabel}`)}
                    >
                        <Text style={styles.ankiSelectorLabel}>{l('Tür:', 'Type:')}</Text>
                        <Text style={styles.ankiSelectorValue} numberOfLines={1}>{cardTypeLabel}</Text>
                        <View style={styles.ankiSelectorChevron}>
                            {!isEditing && !isCatalog && <ChevronDownIcon color={colors.textMuted} size={19} />}
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.ankiSelectorRow, styles.ankiSelectorRowLast]}
                        onPress={() => {
                            if (isCatalog) {
                                alert(l('Korumalı Kart', 'Protected Card'), l('Dahili TUS kartları başka bir desteye taşınamaz.', 'Built-in TUS cards cannot be moved to another deck.'));
                                return;
                            }
                            setShowDeckPicker(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Hedef desteyi seç', 'Select target deck')}
                    >
                        <Text style={styles.ankiSelectorLabel}>{l('Deste:', 'Deck:')}</Text>
                        <Text style={styles.ankiSelectorValue} numberOfLines={1}>
                            {targetDeck?.name.replaceAll('::', ' › ') ?? '—'}
                        </Text>
                        <View style={styles.ankiSelectorChevron}>
                            {!isCatalog && <ChevronDownIcon color={colors.textMuted} size={19} />}
                        </View>
                    </TouchableOpacity>
                </View>

                {isCatalog && (
                    <View style={styles.catalogProtectedBanner} accessibilityRole="summary">
                        <Text style={styles.catalogProtectedBadge}>
                            {l('🔒 Dahili TUS Kartı (İçerik Korumalıdır)', '🔒 Built-in TUS Card (Content Protected)')}
                        </Text>
                        <Text style={styles.catalogProtectedDescription}>
                            {l(
                                'TUS ders notları telif hakkı ile korunmaktadır. Kart içeriği değiştirilemez; ancak kendi etiketlerinizi ve bayraklarınızı ekleyebilirsiniz.',
                                'TUS study notes are copyrighted. Card content cannot be modified; however, you can still add your personal tags and flags.',
                            )}
                        </Text>
                    </View>
                )}

                {fieldsToRender.map((field, index) => {
                    const localizedName = localizeFieldName(locale, field.name);
                    const isPinned = pinnedFields.has(field.ord);
                    // Anki stores a font, a size and a right-to-left flag on every field; the
                    // rules for an unset or unusable value live in lib/editorFieldStyle.ts.
                    const fieldFontSize = editorFieldFontSize(field.fontSize, editorPreferences.fontSize);
                    const placeholder = isCloze && index === 0
                        ? l('Metni yazın, sonra gizlenecek bölümü seçip […] düğmesine dokunun…', 'Enter text, then select the part to hide and tap […]…')
                        : isCloze && index === 1
                        ? l('İsteğe bağlı ek arka metni…', 'Optional extra text for the back…')
                        : l(`${localizedName} yazın…`, `Enter ${localizedName}…`);

                    return (
                        <React.Fragment key={`${selectedNoteType?.id ?? cardTypeId}-field-${field.ord}-${index}`}>
                            <View style={styles.fieldLabelRow}>
                                <Text style={styles.fieldName}>{localizedName}</Text>
                                {!isCatalog && (
                                    <View style={styles.fieldActions}>
                                        <TouchableOpacity
                                            style={[styles.fieldAction, isEditing && styles.fieldActionDisabled]}
                                            onPress={() => togglePinnedField(field.ord)}
                                            disabled={isEditing}
                                            accessibilityRole="button"
                                            accessibilityLabel={isPinned
                                                ? l(`${localizedName} alanının sabitlemesini kaldır`, `Unpin ${localizedName} field`)
                                                : l(`${localizedName} alanını sabitle`, `Pin ${localizedName} field`)}
                                            accessibilityState={{ selected: isPinned, disabled: isEditing }}
                                        >
                                            <PinIcon color={isPinned ? colors.accent : colors.textMuted} />
                                        </TouchableOpacity>
                                        <MediaAttachButton
                                            onInsert={(snippet) => fieldEditorRefs.current[index]?.insertHtml(snippet)}
                                        />
                                    </View>
                                )}
                            </View>
                            <RichTextEditor
                                ref={(el) => {
                                    fieldEditorRefs.current[index] = el;
                                }}
                                value={fieldValues[index] || ''}
                                editable={!isCatalog}
                                onChange={(val) => handleFieldChange(index, val)}
                                onFocus={() => {
                                    if (isCatalog) return;
                                    setActiveFieldIndex(index);
                                    // The toolbar now belongs to this field, so it is blanked until this field's
                                    // own document answers instead of showing the previous field's state.
                                    setFormatState(EMPTY_EDITOR_FORMAT_STATE);
                                    fieldEditorRefs.current[index]?.requestFormatState();
                                }}
                                onFormatStateChange={(state) => {
                                    if (activeFieldIndex !== index) return;
                                    // A new selection starts Word's case cycle over at Sentence case;
                                    // the echo of the run this cycle just wrote does not.
                                    if (state.selectionText !== caseTextRef.current) caseModeRef.current = null;
                                    setFormatState(state);
                                }}
                                onShortcut={(shortcut) => {
                                    if (activeFieldIndex !== index) return;
                                    if (shortcut === 'growFont') stepEditorFontSize(1);
                                    else if (shortcut === 'shrinkFont') stepEditorFontSize(-1);
                                    else if (shortcut === 'changeCase') cycleTextCase();
                                }}
                                placeholder={placeholder}
                                colors={colors}
                                fontSize={fieldFontSize}
                                fontFamily={field.font}
                                rtl={field.rtl}
                                capitalizeSentences={editorPreferences.capitalizeSentences}
                                pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                                scrollMode="contained"
                                maxHeight={320}
                                mountDelayMs={index === 0 ? 0 : Math.min(index * 120, 360)}
                            />
                            {index === 0 && duplicateNote && (
                                <View
                                    style={styles.duplicateWarningBadge}
                                    accessibilityRole="alert"
                                    accessibilityLabel={l(
                                        `Yinelenen not uyarısı: ${duplicateNote.firstField}`,
                                        `Duplicate note warning: ${duplicateNote.firstField}`,
                                    )}
                                >
                                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                                        <Path
                                            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                                            stroke={colors.btnHard}
                                            strokeWidth={2}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </Svg>
                                    <View style={styles.duplicateWarningTextContainer}>
                                        <Text style={styles.duplicateWarningTitle}>
                                            {l('Yinelenen ilk alan bulundu', 'Duplicate first field found')}
                                        </Text>
                                        <Text style={styles.duplicateWarningDetail} numberOfLines={2}>
                                            {duplicateDeckName
                                                ? l(
                                                    `"${duplicateDeckName}" destesinde aynı ilk alana sahip bir not var. Kaydedebilirsiniz ancak kartlar yinelenmiş olabilir.`,
                                                    `A note with the same first field exists in "${duplicateDeckName}". You can still save, but cards may be duplicated.`,
                                                )
                                                : l(
                                                    'Koleksiyonda aynı ilk alana sahip bir not var. Kaydedebilirsiniz ancak kartlar yinelenmiş olabilir.',
                                                    'A note with the same first field exists in the collection. You can still save, but cards may be duplicated.',
                                                )}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </React.Fragment>
                    );
                })}

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
                        {selectedNoteType?.templates.map((template) => localizeCardTemplateName(locale, template.name)).join(' · ') || '—'}
                    </Text>
                    <Text style={styles.summaryChevron}>›</Text>
                </TouchableOpacity>
                <Pressable
                    style={styles.scrollBottomDismissArea}
                    onPress={dismissEditorKeyboard}
                    accessible={false}
                />
            </ScrollView>

            {!isCatalog && editorPreferences.toolbarVisible && (
                <EditorFormattingToolbar
                    toolbarTab={toolbarTab}
                    onSelectTab={setToolbarTab}
                    tools={toolsByKey}
                    formatState={formatState}
                    isCloze={isCloze}
                    onCloze={() => {
                        // The toolbar only offers this button on a cloze note, so the type is known here.
                        if (!selectedNoteType) return;
                        const targetIndex = clozeFieldIndex(selectedNoteType);
                        const targetEditor = fieldEditorRefs.current[targetIndex] ?? getActiveEditor();
                        targetEditor?.runCommand('cloze');
                    }}
                    customButtons={customToolbarButtons}
                    onCustomButtonPress={(button) => wrapEditorSelection(button.prefix, button.suffix)}
                    onCustomButtonLongPress={openEditToolbarButton}
                    onCreateCustomButton={openCreateToolbarButton}
                    keyboardVisible={keyboardVisible}
                    onDismissKeyboard={dismissEditorKeyboard}
                    scrollable={editorPreferences.toolbarScrollable}
                    scrollRef={toolbarScrollRef}
                    screenWidth={screenWidth}
                    colors={colors}
                    styles={styles}
                    l={l}
                />
            )}

            {!isCatalog && !editorPreferences.toolbarVisible && keyboardVisible && (
                <View style={styles.standaloneKeyboardDismissBar}>
                    <TouchableOpacity
                        style={styles.keyboardDismissButton}
                        onPress={dismissEditorKeyboard}
                        accessibilityRole="button"
                        accessibilityLabel={l('Klavyeyi kapat', 'Dismiss keyboard')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <KeyboardDismissIcon color={colors.accent} size={17} />
                        <Text style={styles.keyboardDismissText}>{l('Kapat', 'Done')}</Text>
                    </TouchableOpacity>
                </View>
            )}
            </KeyboardAvoidingView>
            <View style={[{ height: insets.bottom, backgroundColor: colors.bgCard }, { pointerEvents: 'none' }]} />

            {showOverflowMenu && (
                <EditorOverflowMenu
                    topInset={insets.top}
                    isCatalog={isCatalog}
                    isEditing={isEditing}
                    preferences={editorPreferences}
                    onUpdatePreferences={updateEditorPreferences}
                    onClearFields={requestClearFields}
                    onDeleteNote={handleDelete}
                    onOpenFontSize={() => runAfterOverflowClose(() => setShowFontSizePicker(true))}
                    onClose={() => setShowOverflowMenu(false)}
                    styles={styles}
                    l={l}
                />
            )}

            <EditorFontSizeModal
                visible={showFontSizePicker}
                currentSize={editorPreferences.fontSize}
                onChoose={(size) => {
                    updateEditorPreferences({ fontSize: size });
                    setShowFontSizePicker(false);
                }}
                onClose={() => setShowFontSizePicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <TablePickerModal
                visible={showTablePicker}
                onInsertTable={(rows, columns) => runAfterFormattingDialogClose(
                    () => setShowTablePicker(false),
                    () => insertEditorHtml(tableHtml(rows, columns)),
                )}
                onClose={() => setShowTablePicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <CalloutPickerModal
                visible={showCalloutPicker}
                onInsertCallout={(tone) => runAfterFormattingDialogClose(
                    () => setShowCalloutPicker(false),
                    () => insertEditorHtml(calloutHtml(tone)),
                )}
                onClose={() => setShowCalloutPicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <LinkEditorModal
                visible={showLinkEditor}
                draft={linkDraft}
                onDraftChange={setLinkDraft}
                onConfirm={confirmLink}
                colors={colors}
                onClose={() => setShowLinkEditor(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <InlineFontSizePickerModal
                visible={showInlineFontSizePicker}
                currentSize={formatState.fontSize}
                onChoose={(size) => runAfterFormattingDialogClose(
                    () => setShowInlineFontSizePicker(false),
                    () => applyFontSize(size),
                )}
                onClose={() => setShowInlineFontSizePicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <FontFamilyPickerModal
                visible={showFontFamilyPicker}
                currentFamily={formatState.fontFamily}
                onChoose={(family) => runAfterFormattingDialogClose(
                    () => setShowFontFamilyPicker(false),
                    () => applyFontFamily(family),
                )}
                onClose={() => setShowFontFamilyPicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <LineSpacingPickerModal
                visible={showLineSpacingPicker}
                currentSpacing={formatState.lineSpacing}
                onChoose={(spacing) => runAfterFormattingDialogClose(
                    () => setShowLineSpacingPicker(false),
                    () => applyLineSpacing(spacing),
                )}
                onClose={() => setShowLineSpacingPicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <MathPickerModal
                visible={showMathPicker}
                onWrap={(prefix, suffix) => runAfterFormattingDialogClose(
                    () => setShowMathPicker(false),
                    () => wrapEditorSelection(prefix, suffix),
                )}
                onClose={() => setShowMathPicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <ColorPickerModal
                visible={showColorPicker}
                onCommand={(command, value) => runAfterFormattingDialogClose(
                    () => setShowColorPicker(false),
                    () => runEditorCommand(command, value),
                )}
                colors={colors}
                onClose={() => setShowColorPicker(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <HtmlSourceModal
                visible={showHtmlEditor}
                value={htmlEditorValue}
                onChangeValue={setHtmlEditorValue}
                onSave={() => {
                    const sanitized = sanitizeUntrustedHtml(htmlEditorValue);
                    handleFieldChange(activeFieldIndex, sanitized);
                    setShowHtmlEditor(false);
                }}
                onClose={() => setShowHtmlEditor(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <CustomToolbarEditorModal
                visible={showCustomToolbarEditor}
                isEditingButton={Boolean(editingToolbarButtonId)}
                draft={toolbarButtonDraft}
                onDraftChange={setToolbarButtonDraft}
                onApplyPreset={applyToolbarPreset}
                onShowHelp={showToolbarHelp}
                onDelete={requestDeleteCustomToolbarButton}
                onSave={saveCustomToolbarButton}
                onClose={() => setShowCustomToolbarEditor(false)}
                colors={colors}
                styles={styles}
                l={l}
                t={t}
            />

            <CustomToolbarHelpModal
                visible={showCustomToolbarHelp}
                onUseTemplate={useToolbarButtonTemplate}
                onClose={() => setShowCustomToolbarHelp(false)}
                styles={styles}
                l={l}
                t={t}
            />

            <NoteTypePickerModal
                visible={showCardTypePicker}
                colors={colors}
                selectedId={cardTypeId}
                noteTypes={availableNoteTypes}
                title={l('Not türü', 'Note Type')}
                onSelect={handleSelectNoteType}
                onClose={() => setShowCardTypePicker(false)}
                onManage={() => {
                    setShowCardTypePicker(false);
                    router.push('/note-types');
                }}
                manageLabel={l('Not türlerini yönet…', 'Manage note types…')}
            />

            <DeckPickerModal
                visible={showDeckPicker}
                colors={colors}
                decks={deckPickerDecks}
                selectedDeckName={targetDeck?.name ?? null}
                activeDeckName={targetDeck?.name ?? null}
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

            <TagPickerModal
                visible={showTagPicker}
                selectedTags={noteTags}
                onCancel={() => setShowTagPicker(false)}
                onConfirm={(tags) => {
                    setNoteTags(tags);
                    setShowTagPicker(false);
                }}
            />

            <EditorPreviewModal
                visible={showPreview}
                deck={targetDeck}
                side={previewSide}
                onSideChange={setPreviewSide}
                payload={previewPayload}
                bodyHeight={previewBodyHeight}
                audioPlaybackRate={previewAudioPlaybackRate}
                onClose={() => setShowPreview(false)}
                colors={colors}
                styles={styles}
                l={l}
                t={t}
            />
        </View>
    );
}
