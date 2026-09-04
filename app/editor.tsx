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
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { resolveSubjectDeckId } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { confirm, alert } from '../lib/confirm';
import {
    blockFormatValue,
    calloutHtml,
    EDITOR_BLOCK_STYLES,
    EDITOR_CALLOUTS,
    EDITOR_TOOLBAR_TABS,
    editorToolKeysForTab,
    linkHtml,
    tableHtml,
    type EditorBlockStyleKey,
    type EditorToolbarTabId,
    type EditorToolKey,
} from '../lib/editorToolbar';
import {
    EMPTY_EDITOR_FORMAT_STATE,
    isEditorToolActive,
    isEditorToolDisabled,
    type EditorFormatState,
} from '../lib/editorFormatState';
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
    type RichTextCommand,
} from '../components/RichTextEditor';
import TagPickerModal from '../components/TagPickerModal';
import DeckPickerModal from '../components/DeckPickerModal';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import { localizeNoteTypeName } from '../lib/i18n';
import { countCardsForNote, extractClozeNumbers, sanitizeUntrustedHtml } from '../lib/templates';
import { getDbSetting, loadSettings, saveSettings, setDbSetting } from '../lib/storage';
import { editorDraftKey, hasEditorDraftChanged, type EditorDraftState } from '../lib/editorDraft';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
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

type AnkiToolbarIconName =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'removeFormat'
    | 'subscript'
    | 'superscript'
    | 'color'
    | 'listBullet'
    | 'listNumber'
    | 'rule'
    | 'heading'
    | 'fontSize'
    | 'math'
    | 'html'
    | 'add'
    | 'alignLeft'
    | 'alignCenter'
    | 'alignRight'
    | 'alignJustify'
    | 'indent'
    | 'outdent'
    | 'table'
    | 'link'
    | 'quote'
    | 'code'
    | 'callout'
    | 'undo'
    | 'redo'
    | 'paragraph';

function AnkiToolbarIcon({ name, color, size = 24 }: { name: AnkiToolbarIconName; color: string; size?: number }) {
    const paths: Record<Exclude<AnkiToolbarIconName, 'math'>, string> = {
        bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42ZM10 6.5h3a1.5 1.5 0 0 1 0 3h-3v-3Zm3.5 9H10v-3h3.5a1.5 1.5 0 0 1 0 3Z',
        italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8Z',
        underline: 'M12 17a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 1 1-7 0V3H6v8a6 6 0 0 0 6 6ZM5 19v2h14v-2H5Z',
        strikethrough: 'M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z',
        removeFormat: 'M4 4h10v2H9v12H7V6H4V4zm11 7l3 3-3 3 1.4 1.4 3-3 3 3 1.4-1.4-3-3 3-3-1.4-1.4-3 3-3-3L15 11z',
        subscript: 'M5 4l3.5 6L5 16h2.2l2.4-4.2 2.4 4.2h2.2l-3.5-6 3.5-6h-2.2L9.6 8.2 7.2 4H5zm14 13h4v1h-5v-1l3-3c.5-.5.7-.9.7-1.3 0-.6-.4-1-1-1s-1 .4-1 1h-1c0-1.1.9-2 2-2s2 .9 2 2c0 .6-.3 1.2-.8 1.7l-2.2 2.2V17h2.3z',
        superscript: 'M5 7l3.5 6L5 19h2.2l2.4-4.2 2.4 4.2h2.2l-3.5-6 3.5-6h-2.2L9.6 11.2 7.2 7H5zm14 3h4v1h-5v-1l3-3c.5-.5.7-.9.7-1.3 0-.6-.4-1-1-1s-1 .4-1 1h-1c0-1.1.9-2 2-2s2 .9 2 2c0 .6-.3 1.2-.8 1.7l-2.2 2.2V10h2.3z',
        color: 'M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.17 19.38 10.53 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z',
        listBullet: 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
        listNumber: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
        rule: 'M2 11h20v2H2z',
        heading: 'M5 4v3h5.5v12h3V7H19V4H5Z',
        fontSize: 'M2.5 4v3h5v12h3V7h5V4h-13Zm19 5h-9v3h3v7h3v-7h3V9Z',
        html: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
        add: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z',
        alignLeft: 'M3 3h18v2H3V3Zm0 4h12v2H3V7Zm0 4h18v2H3v-2Zm0 4h12v2H3v-2Zm0 4h18v2H3v-2Z',
        alignCenter: 'M3 3h18v2H3V3Zm3 4h12v2H6V7Zm-3 4h18v2H3v-2Zm3 4h12v2H6v-2Zm-3 4h18v2H3v-2Z',
        alignRight: 'M3 3h18v2H3V3Zm6 4h12v2H9V7Zm-6 4h18v2H3v-2Zm6 4h12v2H9v-2Zm-6 4h18v2H3v-2Z',
        alignJustify: 'M3 3h18v2H3V3Zm0 4h18v2H3V7Zm0 4h18v2H3v-2Zm0 4h18v2H3v-2Zm0 4h18v2H3v-2Z',
        indent: 'M3 3h18v2H3V3Zm8 4h10v2H11V7Zm0 4h10v2H11v-2Zm0 4h10v2H11v-2ZM3 19h18v2H3v-2ZM3 8l4 3.5L3 15V8Z',
        outdent: 'M3 3h18v2H3V3Zm8 4h10v2H11V7Zm0 4h10v2H11v-2Zm0 4h10v2H11v-2ZM3 19h18v2H3v-2Zm4-11v7l-4-3.5L7 8Z',
        table: 'M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 6v4h6V9H4Zm8 0v4h8V9h-8Zm-8 6v4h6v-4H4Zm8 0v4h8v-4h-8ZM4 5v2h16V5H4Z',
        link: 'M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z',
        quote: 'M6 17h3l2-4V6H4v7h3l-1 4Zm9 0h3l2-4V6h-7v7h3l-1 4Z',
        code: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z',
        callout: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-9 4h2v6h-2V6Zm0 8h2v2h-2v-2Z',
        paragraph: 'M13 4H8a4 4 0 0 0 0 8h2v8h2V6h2v14h2V6h1V4h-4Z',
        undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.98 7.98 0 0 1 12.5 11c2.98 0 5.5 1.94 6.4 4.62l2.37-.78A9.99 9.99 0 0 0 12.5 8Z',
        redo: 'M18.4 10.6A9.94 9.94 0 0 0 11.5 8a9.99 9.99 0 0 0-8.77 6.84l2.37.78A7.98 7.98 0 0 1 11.5 11c2.05 0 3.92.77 5.35 2.02L13 16h9V7l-3.6 3.6Z',
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

import {
    CUSTOM_TOOLBAR_PRESETS,
    loadCustomToolbarButtons,
    persistCustomToolbarButtons,
    sanitizeButtonText,
    sanitizeCustomToolbarButton,
    sanitizeToolbarSnippet,
    type CustomToolbarButton,
    type CustomToolbarPreset,
    type LocalizedPresetText,
} from '../lib/customToolbar';
import {
    loadStickyEditorFields,
    saveStickyEditorFields,
    type EditorField,
    type StickyEditorFields,
} from '../lib/editorStickyFields';

const CARD_TYPE_CHOICES = ANKI_STOCK_NOTE_TYPE_IDS;

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
    const styles = useMemo(() => createStyles(colors), [colors]);
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
    const [previewSide, setPreviewSide] = useState<'question' | 'answer'>('question');
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [showCardTypePicker, setShowCardTypePicker] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [showFontSizePicker, setShowFontSizePicker] = useState(false);
    const [showInlineFontSizePicker, setShowInlineFontSizePicker] = useState(false);
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
    const [activeField, setActiveField] = useState<EditorField>('question');
    const [formatState, setFormatState] = useState<EditorFormatState>(EMPTY_EDITOR_FORMAT_STATE);
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
    // The screen is dirty only once the user changes something, so the baseline is the draft the
    // editor opened with. It is kept as state and not just as its key, so the destination deck
    // resolving on its own can be folded in later without also absorbing an edit made meanwhile.
    const initialDraftRef = useRef<EditorDraftState | null>(
        routeCardId
            ? null
            : {
                question: (params.question as string) || stickyFieldDefaults.question?.value || '',
                answer: (params.answer as string) || stickyFieldDefaults.answer?.value || '',
                reverseAnswer: (routeNoteTypeId === 7 ? routeFieldValues[2] : '') || stickyFieldDefaults.reverseAnswer?.value || '',
                cardTypeId: routeNoteTypeId ?? 1,
                deckId: targetDeckId,
                tags: typeof params.tags === 'string' ? params.tags.split(/\s+/).filter(Boolean) : [],
            },
    );
    const initialDraftKeyRef = useRef<string | null>(
        initialDraftRef.current ? editorDraftKey(initialDraftRef.current) : null,
    );
    const resetDraftBaseline = (draft: EditorDraftState | null) => {
        initialDraftRef.current = draft;
        initialDraftKeyRef.current = draft ? editorDraftKey(draft) : null;
    };

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

        resetDraftBaseline(null);

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
        resetDraftBaseline({
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

    // The destination deck resolves synchronously in almost every case, but an empty or
    // still-initializing collection can leave it null for the first frames. Fold that resolution
    // into the baseline — a deck the screen picked for itself is not an edit the user made —
    // and keep the field values captured at mount so a keystroke in that window still counts.
    const draftDeckSeededRef = useRef(Boolean(routeCardId) || targetDeckId !== null);
    useEffect(() => {
        if (routeCardId || targetDeckId === null || draftDeckSeededRef.current) return;
        draftDeckSeededRef.current = true;
        const baseline = initialDraftRef.current;
        if (baseline) resetDraftBaseline({ ...baseline, deckId: targetDeckId });
    }, [routeCardId, targetDeckId]);

    const currentDraft = useMemo(() => ({
        question,
        answer,
        reverseAnswer,
        cardTypeId,
        deckId: targetDeckId,
        tags: noteTags,
    }), [answer, cardTypeId, noteTags, question, reverseAnswer, targetDeckId]);
    const isDirty = hasEditorDraftChanged(initialDraftKeyRef.current, currentDraft);
    useUnsavedChangesGuard(isDirty, {
        title: l('Değişiklikler atılsın mı?', 'Discard Changes?'),
        message: isEditing
            ? l('Kaydetmeden kart düzenleme ekranından çıkılsın mı?', 'Leave the card editor without saving?')
            : l('Kaydetmeden not ekleme ekranından çıkılsın mı?', 'Leave the add note screen without saving?'),
    });

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

    const runEditorCommand = (command: RichTextCommand, value?: string) => {
        activeEditorRef().current?.runCommand(command, value);
    };

    const insertEditorHtml = (html: string) => {
        activeEditorRef().current?.insertHtml(html);
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
        router.back();
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
        const currentFields = [
            question.trim(),
            answer.trim(),
            cardTypeId === 7 ? reverseAnswer.trim() : '',
            ...preservedFields.slice(3),
        ];
        const mockNote: Note = {
            id: 0,
            guid: '',
            noteTypeId: cardTypeId,
            mod: 0,
            usn: 0,
            tags: noteTags,
            fields: currentFields,
            sfld: currentFields[0] || '',
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

                resetDraftBaseline(currentDraft);
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
                resetDraftBaseline(currentDraft);
                bumpDataVersion();
                alert(
                    t('common.completed'),
                    l(
                        `Not kaydedildi; ${created.cards.length} kart oluşturuldu.`,
                        `Note saved; ${created.cards.length} card${created.cards.length === 1 ? '' : 's'} created.`,
                    ),
                    () => {
                        if (externalSuccessUrl) {
                            void Linking.openURL(externalSuccessUrl).catch(() => router.back());
                        } else {
                            router.back();
                        }
                    },
                );
            }
        } catch (e) {
            console.warn('[Editor] save failed:', e);
            alert(t('common.error'), l('Not kaydedilemedi.', 'Could not save the note.'));
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

    type FormattingTool = {
        icon: AnkiToolbarIconName;
        /** Rendered instead of the icon. Six block-style icons would be indistinguishable. */
        text?: string;
        label: string;
        hint?: string;
        onPress: () => void;
        onLongPress?: () => void;
    };

    const blockStyleTool = (key: EditorBlockStyleKey, icon: AnkiToolbarIconName, text?: string): FormattingTool => {
        const style = EDITOR_BLOCK_STYLES.find((entry) => entry.key === key);
        return {
            icon,
            text,
            label: style ? l(style.tr, style.en) : key,
            onPress: () => runEditorCommand('formatBlock', blockFormatValue(key)),
        };
    };

    // A heading icon repeated three times says nothing, so the levels carry their own caption and
    // only the two blocks with a recognisable shape keep an icon.
    const blockStyleTools = {
        p: blockStyleTool('p', 'paragraph', 'P'),
        h1: blockStyleTool('h1', 'heading', 'H1'),
        h2: blockStyleTool('h2', 'heading', 'H2'),
        h3: blockStyleTool('h3', 'heading', 'H3'),
        blockquote: blockStyleTool('blockquote', 'quote'),
        pre: blockStyleTool('pre', 'code'),
    };

    // One entry per key in `EDITOR_TOOLBAR_LAYOUT`. The record is exhaustive by type, so a tool
    // can never be defined and then left off every tab, and the tabs themselves stay data: the
    // Home/Styles/Insert grouping is decided in lib/editorToolbar.ts and only rendered here.
    //
    // Lit and disabled states are not decided here either. `isEditorToolActive` and
    // `isEditorToolDisabled` read the caret state the document reports, so Bold lights up when
    // the caret moves into bold text and Outdent greys out where it has nowhere to go, instead of
    // only reacting to presses that came from this screen.
    const toolsByKey: Record<EditorToolKey, FormattingTool> = {
        undo: {
            icon: 'undo',
            label: l('Geri al', 'Undo'),
            onPress: () => runEditorCommand('undo'),
        },
        redo: {
            icon: 'redo',
            label: l('Yinele', 'Redo'),
            onPress: () => runEditorCommand('redo'),
        },
        bold: {
            icon: 'bold',
            label: l('Kalın', 'Bold'),
            onPress: () => runEditorCommand('bold'),
        },
        italic: {
            icon: 'italic',
            label: l('İtalik', 'Italic'),
            onPress: () => runEditorCommand('italic'),
        },
        underline: {
            icon: 'underline',
            label: l('Altı çizili', 'Underline'),
            onPress: () => runEditorCommand('underline'),
        },
        strikethrough: {
            icon: 'strikethrough',
            label: l('Üstü çizili', 'Strikethrough'),
            onPress: () => runEditorCommand('strikeThrough'),
        },
        subscript: {
            icon: 'subscript',
            label: l('Alt simge', 'Subscript'),
            onPress: () => runEditorCommand('subscript'),
        },
        superscript: {
            icon: 'superscript',
            label: l('Üst simge', 'Superscript'),
            onPress: () => runEditorCommand('superscript'),
        },
        color: {
            icon: 'color',
            label: l('Renk paleti', 'Color palette'),
            onPress: () => setShowColorPicker(true),
        },
        fontSize: {
            icon: 'fontSize',
            label: l('Yazı boyutu', 'Font size'),
            onPress: () => setShowInlineFontSizePicker(true),
        },
        removeFormat: {
            icon: 'removeFormat',
            label: l('Biçimlendirmeyi temizle', 'Clear formatting'),
            onPress: () => runEditorCommand('removeFormat'),
        },
        justifyLeft: {
            icon: 'alignLeft',
            label: l('Sola hizala', 'Align left'),
            onPress: () => runEditorCommand('justifyLeft'),
        },
        justifyCenter: {
            icon: 'alignCenter',
            label: l('Ortala', 'Center'),
            onPress: () => runEditorCommand('justifyCenter'),
        },
        justifyRight: {
            icon: 'alignRight',
            label: l('Sağa hizala', 'Align right'),
            onPress: () => runEditorCommand('justifyRight'),
        },
        justifyFull: {
            icon: 'alignJustify',
            label: l('İki yana yasla', 'Justify'),
            onPress: () => runEditorCommand('justifyFull'),
        },
        ...blockStyleTools,
        listBullet: {
            icon: 'listBullet',
            label: l('Madde imli liste', 'Bullet list'),
            onPress: () => runEditorCommand('insertUnorderedList'),
        },
        listNumber: {
            icon: 'listNumber',
            label: l('Numaralı liste', 'Numbered list'),
            onPress: () => runEditorCommand('insertOrderedList'),
        },
        indent: {
            icon: 'indent',
            label: l('Girintiyi artır', 'Increase indent'),
            onPress: () => runEditorCommand('indent'),
        },
        outdent: {
            icon: 'outdent',
            label: l('Girintiyi azalt', 'Decrease indent'),
            onPress: () => runEditorCommand('outdent'),
        },
        table: {
            icon: 'table',
            label: l('Tablo ekle', 'Insert table'),
            onPress: () => { Keyboard.dismiss(); setShowTablePicker(true); },
        },
        link: {
            icon: 'link',
            label: l('Bağlantı ekle', 'Insert link'),
            onPress: openLinkEditor,
        },
        callout: {
            icon: 'callout',
            label: l('Bilgi kutusu ekle', 'Insert callout'),
            onPress: () => { Keyboard.dismiss(); setShowCalloutPicker(true); },
        },
        rule: {
            icon: 'rule',
            label: l('Yatay çizgi ekle', 'Insert horizontal line'),
            onPress: () => runEditorCommand('insertHorizontalRule'),
        },
        math: {
            icon: 'math',
            label: l('MathJax ekle', 'Insert MathJax'),
            hint: l('Basılı tutarak diğer MathJax biçimlerini açın', 'Long press for other MathJax formats'),
            onPress: () => wrapEditorSelection('\\(', '\\)'),
            onLongPress: () => setShowMathPicker(true),
        },
        html: {
            icon: 'html',
            label: l('HTML kaynağı', 'HTML source'),
            onPress: () => {
                Keyboard.dismiss();
                const currentVal = activeField === 'question' ? question : activeField === 'answer' ? answer : reverseAnswer;
                setHtmlEditorValue(currentVal);
                setShowHtmlEditor(true);
            },
        },
    };

    const toolbarToolKeys = editorToolKeysForTab(toolbarTab);
    // Cloze and the user's own buttons belong to the Insert tab; they insert, they do not format.
    const showsInsertExtras = toolbarTab === 'insert';

    const toolbarItemCount = toolbarToolKeys.length
        + (showsInsertExtras ? customToolbarButtons.length + 1 + (isCloze ? 1 : 0) : 0);
    const centerToolbar = toolbarItemCount * 44 <= screenWidth;

    const renderFormattingToolbarItems = () => (
        <>
            {isCloze && showsInsertExtras && (
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
            {toolbarToolKeys.map((key) => {
                const tool = toolsByKey[key];
                const isActive = isEditorToolActive(key, formatState);
                const isDisabled = isEditorToolDisabled(key, formatState);
                const tint = isDisabled ? colors.textMuted : isActive ? colors.accent : colors.textPrimary;
                return (
                    <TouchableOpacity
                        key={key}
                        style={[
                            styles.formatButton,
                            isActive && !isDisabled && styles.formatButtonActive,
                            isDisabled && styles.formatButtonDisabled,
                        ]}
                        onPress={tool.onPress}
                        onLongPress={tool.onLongPress}
                        delayLongPress={450}
                        disabled={isDisabled}
                        accessibilityRole="button"
                        accessibilityLabel={tool.label}
                        accessibilityState={{ selected: isActive, disabled: isDisabled }}
                        accessibilityHint={tool.hint}
                    >
                        {tool.text
                            ? (
                                <Text style={[
                                    styles.blockStyleButtonText,
                                    isActive && !isDisabled && styles.blockStyleButtonTextActive,
                                    isDisabled && styles.blockStyleButtonTextDisabled,
                                ]}>
                                    {tool.text}
                                </Text>
                            )
                            : <AnkiToolbarIcon name={tool.icon} color={tint} />}
                    </TouchableOpacity>
                );
            })}
            {showsInsertExtras && customToolbarButtons.map((button, index) => (
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
            {showsInsertExtras && (
                <TouchableOpacity
                    style={styles.formatButton}
                    onPress={openCreateToolbarButton}
                    accessibilityRole="button"
                    accessibilityLabel={l('Araç çubuğu öğesi oluştur', 'Create toolbar item')}
                >
                    <AnkiToolbarIcon name="add" color={colors.textPrimary} />
                </TouchableOpacity>
            )}
        </>
    );

    return (
        <View style={styles.container}>
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
                    {isEditing ? t('root.editCard') : l('Not ekle', 'Add note')}
                </Text>
                <View style={styles.headerSpacer} />
                <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel={isEditing ? l('Değişiklikleri kaydet', 'Save changes') : l('Notu kaydet', 'Save note')}
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
                            onInsert={(snippet) => questionEditorRef.current?.insertHtml(snippet)}
                        />
                    </View>
                </View>
                <RichTextEditor
                    ref={questionEditorRef}
                    value={question}
                    onChange={setQuestion}
                    onFocus={() => {
                        setActiveField('question');
                        // The toolbar now belongs to this field, so it is blanked until this field's
                        // own document answers instead of showing the previous field's state.
                        setFormatState(EMPTY_EDITOR_FORMAT_STATE);
                        questionEditorRef.current?.requestFormatState();
                    }}
                    onFormatStateChange={(state) => {
                        if (activeField === 'question') setFormatState(state);
                    }}
                    placeholder={isCloze
                        ? l('Metni yazın, sonra gizlenecek bölümü seçip […] düğmesine dokunun…', 'Enter text, then select the part to hide and tap […]…')
                        : l('Soruyu yazın…', 'Enter the question…')}
                    colors={colors}
                    fontSize={editorPreferences.fontSize}
                    capitalizeSentences={editorPreferences.capitalizeSentences}
                    pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                    scrollMode="contained"
                    maxHeight={320}
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
                            onInsert={(snippet) => answerEditorRef.current?.insertHtml(snippet)}
                        />
                    </View>
                </View>
                <RichTextEditor
                    ref={answerEditorRef}
                    value={answer}
                    onChange={setAnswer}
                    onFocus={() => {
                        setActiveField('answer');
                        // The toolbar now belongs to this field, so it is blanked until this field's
                        // own document answers instead of showing the previous field's state.
                        setFormatState(EMPTY_EDITOR_FORMAT_STATE);
                        answerEditorRef.current?.requestFormatState();
                    }}
                    onFormatStateChange={(state) => {
                        if (activeField === 'answer') setFormatState(state);
                    }}
                    placeholder={isCloze ? l('İsteğe bağlı ek arka metni…', 'Optional extra text for the back…') : l('Cevabı yazın…', 'Enter the answer…')}
                    colors={colors}
                    fontSize={editorPreferences.fontSize}
                    capitalizeSentences={editorPreferences.capitalizeSentences}
                    pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                    scrollMode="contained"
                    maxHeight={320}
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
                                    onInsert={(snippet) => reverseEditorRef.current?.insertHtml(snippet)}
                                />
                            </View>
                        </View>
                        <RichTextEditor
                            ref={reverseEditorRef}
                            value={reverseAnswer}
                            onChange={setReverseAnswer}
                            onFocus={() => {
                                setActiveField('reverseAnswer');
                                // The toolbar now belongs to this field, so it is blanked until this field's
                                // own document answers instead of showing the previous field's state.
                                setFormatState(EMPTY_EDITOR_FORMAT_STATE);
                                reverseEditorRef.current?.requestFormatState();
                            }}
                            onFormatStateChange={(state) => {
                                if (activeField === 'reverseAnswer') setFormatState(state);
                            }}
                            placeholder={l('Ters kart oluşturmak için herhangi bir metin girin.', 'Enter any text to create a reverse card.')}
                            colors={colors}
                            fontSize={editorPreferences.fontSize}
                            capitalizeSentences={editorPreferences.capitalizeSentences}
                            pasteClipboardImagesAsPng={editorPreferences.pasteClipboardImagesAsPng}
                            scrollMode="contained"
                            maxHeight={320}
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
                <View style={styles.toolbarTabs} accessibilityRole="tablist">
                    {EDITOR_TOOLBAR_TABS.map((tab) => {
                        const selected = toolbarTab === tab.id;
                        return (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.toolbarTab, selected && styles.toolbarTabActive]}
                                onPress={() => setToolbarTab(tab.id)}
                                // The pill is short so the toolbar stays compact; the slop is what
                                // gives it the 44pt target a thumb needs.
                                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                accessibilityRole="tab"
                                accessibilityState={{ selected }}
                                accessibilityLabel={l(tab.tr, tab.en)}
                            >
                                <Text style={[styles.toolbarTabText, selected && styles.toolbarTabTextActive]}>
                                    {l(tab.tr, tab.en)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
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
                visible={showTablePicker}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowTablePicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTablePicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Tablo ekle', 'Insert Table')}</Text>
                        {[[2, 2], [3, 3], [3, 2], [4, 4]].map(([rows, columns]) => (
                            <TouchableOpacity
                                key={`${rows}x${columns}`}
                                style={styles.formatPickerOption}
                                onPress={() => runAfterFormattingDialogClose(
                                    () => setShowTablePicker(false),
                                    () => insertEditorHtml(tableHtml(rows, columns)),
                                )}
                                accessibilityRole="button"
                                accessibilityLabel={l(
                                    `${rows} satır ${columns} sütun tablo`,
                                    `${rows} by ${columns} table`,
                                )}
                            >
                                <Text style={styles.formatPickerOptionText}>{`${rows} × ${columns}`}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowTablePicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showCalloutPicker}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowCalloutPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCalloutPicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Bilgi kutusu ekle', 'Insert Callout')}</Text>
                        {EDITOR_CALLOUTS.map((tone) => (
                            <TouchableOpacity
                                key={tone.key}
                                style={[styles.formatPickerOption, styles.calloutOption, { borderLeftColor: tone.border }]}
                                onPress={() => runAfterFormattingDialogClose(
                                    () => setShowCalloutPicker(false),
                                    () => insertEditorHtml(calloutHtml(tone.key)),
                                )}
                                accessibilityRole="button"
                                accessibilityLabel={l(tone.tr, tone.en)}
                            >
                                <Text style={styles.formatPickerOptionText}>{l(tone.tr, tone.en)}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowCalloutPicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showLinkEditor}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowLinkEditor(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLinkEditor(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Bağlantı ekle', 'Insert Link')}</Text>
                        <TextInput
                            style={styles.linkInput}
                            value={linkDraft.url}
                            onChangeText={(url) => setLinkDraft((draft) => ({ ...draft, url }))}
                            placeholder="https://docs.ankiweb.net"
                            placeholderTextColor={colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            accessibilityLabel={l('Bağlantı adresi', 'Link address')}
                        />
                        <TextInput
                            style={styles.linkInput}
                            value={linkDraft.label}
                            onChangeText={(label) => setLinkDraft((draft) => ({ ...draft, label }))}
                            placeholder={l('Görünecek metin (isteğe bağlı)', 'Display text (optional)')}
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel={l('Bağlantı metni', 'Link text')}
                        />
                        <TouchableOpacity
                            style={styles.formatPickerOption}
                            onPress={confirmLink}
                            accessibilityRole="button"
                        >
                            <Text style={styles.formatPickerOptionText}>{l('Ekle', 'Insert')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowLinkEditor(false)}>
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
                visible={showColorPicker}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowColorPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowColorPicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Metin & Vurgu Rengi', 'Text & Highlight Color')}</Text>
                        <Text style={[styles.fieldName, { marginTop: 4 }]}>{l('Yazı rengi', 'Text color')}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                            {[
                                { label: l('Kırmızı', 'Red'), color: '#ef4444' },
                                { label: l('Turuncu', 'Orange'), color: '#f97316' },
                                { label: l('Yeşil', 'Green'), color: '#16a34a' },
                                { label: l('Mavi', 'Blue'), color: '#3b82f6' },
                                { label: l('Mor', 'Purple'), color: '#a855f7' },
                                { label: l('Varsayılan', 'Default'), color: colors.textPrimary },
                            ].map((item) => (
                                <TouchableOpacity
                                    key={item.color}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: BorderRadius.md,
                                        backgroundColor: colors.bgCard,
                                        borderWidth: 1.5,
                                        borderColor: item.color,
                                    }}
                                    onPress={() => {
                                        runAfterFormattingDialogClose(
                                            () => setShowColorPicker(false),
                                            () => runEditorCommand('foreColor', item.color),
                                        );
                                    }}
                                >
                                    <Text style={{ color: item.color, fontWeight: '600' }}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={[styles.fieldName, { marginTop: 8 }]}>{l('Vurgu rengi', 'Highlight color')}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                            {[
                                { label: l('Sarı', 'Yellow'), bg: '#fef08a' },
                                { label: l('Yeşil', 'Green'), bg: '#bbf7d0' },
                                { label: l('Mavi', 'Blue'), bg: '#bfdbfe' },
                                { label: l('Pembe', 'Pink'), bg: '#fbcfe8' },
                                { label: l('Turuncu', 'Orange'), bg: '#fed7aa' },
                            ].map((item) => (
                                <TouchableOpacity
                                    key={item.bg}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: BorderRadius.md,
                                        backgroundColor: item.bg,
                                    }}
                                    onPress={() => {
                                        runAfterFormattingDialogClose(
                                            () => setShowColorPicker(false),
                                            () => runEditorCommand('hiliteColor', item.bg),
                                        );
                                    }}
                                >
                                    <Text style={{ color: '#1f2937', fontWeight: '600' }}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={[styles.formatPickerOption, { marginTop: 8 }]}
                            onPress={() => {
                                runAfterFormattingDialogClose(
                                    () => setShowColorPicker(false),
                                    () => runEditorCommand('removeFormat'),
                                );
                            }}
                        >
                            <Text style={styles.formatPickerOptionText}>{l('Biçimlendirmeyi temizle', 'Clear formatting')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowColorPicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showHtmlEditor}
                transparent
                animationType="fade"
                presentationStyle="overFullScreen"
                onRequestClose={() => setShowHtmlEditor(false)}
            >
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHtmlEditor(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('HTML Kaynağını Düzenle', 'Edit HTML Source')}</Text>
                        <Text style={styles.customToolbarExplanation}>
                            {l('Alanın ham HTML içeriğini doğrudan düzenleyin. Kaydedildiğinde güvenlik doğrulaması uygulanır.', 'Edit raw HTML content directly. Sanitization is applied upon saving.')}
                        </Text>
                        <TextInput
                            style={[styles.modalInput, { minHeight: 140, maxHeight: 260, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }]}
                            value={htmlEditorValue}
                            onChangeText={setHtmlEditorValue}
                            multiline
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <View style={styles.customToolbarActions}>
                            <TouchableOpacity style={styles.customToolbarTextAction} onPress={() => setShowHtmlEditor(false)}>
                                <Text style={styles.customToolbarTextActionLabel}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.customToolbarTextAction}
                                onPress={() => {
                                    const sanitized = sanitizeUntrustedHtml(htmlEditorValue);
                                    if (activeField === 'question') {
                                        setQuestion(sanitized);
                                    } else if (activeField === 'answer') {
                                        setAnswer(sanitized);
                                    } else {
                                        setReverseAnswer(sanitized);
                                    }
                                    setShowHtmlEditor(false);
                                }}
                            >
                                <Text style={styles.customToolbarTextActionLabel}>{t('common.save')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
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

                        {/* Quick Presets Carousel */}
                        <View style={styles.customToolbarPresetSection}>
                            <Text style={styles.customToolbarSectionTitle}>{l('Hızlı Şablonlar', 'Quick Presets')}</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.customToolbarPresetScroll}
                            >
                                {CUSTOM_TOOLBAR_PRESETS.map((preset) => (
                                    <TouchableOpacity
                                        key={preset.id}
                                        style={styles.customToolbarPresetChip}
                                        onPress={() => applyToolbarPreset(preset)}
                                        accessibilityRole="button"
                                        accessibilityLabel={presetText(preset.label)}
                                    >
                                        <Text style={styles.customToolbarPresetChipText}>{presetText(preset.label)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <TextInput
                            style={styles.modalInput}
                            value={toolbarButtonDraft.buttonText}
                            onChangeText={(buttonText) => setToolbarButtonDraft((draft) => ({ ...draft, buttonText }))}
                            placeholder={l('Düğme metni', 'Button text')}
                            placeholderTextColor={colors.textMuted}
                            maxLength={16}
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

                        {/* Security notice & Live Preview Box */}
                        <View style={styles.customToolbarPreviewCard}>
                            <Text style={styles.customToolbarPreviewLabel}>{l('Önizleme:', 'Preview:')}</Text>
                            <View style={styles.customToolbarPreviewRow}>
                                <View style={styles.customToolbarButtonPreview}>
                                    <Text style={styles.customToolbarButtonPreviewText} numberOfLines={1}>
                                        {toolbarButtonDraft.buttonText.trim() || '1'}
                                    </Text>
                                </View>
                                <View style={styles.customToolbarHtmlPreview}>
                                    <Text style={styles.customToolbarHtmlPreviewCode} numberOfLines={2}>
                                        {toolbarButtonDraft.prefix || ''}{l('Metin', 'Text')}{toolbarButtonDraft.suffix || ''}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.customToolbarSecurityNote}>
                                {l('🛡️ Güvenlik Korumalı: Komut dosyaları ve form etiketleri filtrelenir.', '🛡️ Security Protected: Scripts and forms are automatically filtered.')}
                            </Text>
                        </View>

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
                        <ScrollView style={styles.customToolbarHelpScroll} showsVerticalScrollIndicator={false}>
                            {CUSTOM_TOOLBAR_PRESETS.map((preset) => (
                                <View key={preset.id} style={styles.customToolbarTemplate}>
                                    <View style={styles.customToolbarTemplateHeader}>
                                        <Text style={styles.customToolbarTemplateTitle}>{presetText(preset.label)}</Text>
                                        <TouchableOpacity
                                            style={styles.customToolbarUseChip}
                                            onPress={() => useToolbarButtonTemplate(preset)}
                                        >
                                            <Text style={styles.customToolbarUseChipText}>{l('Kullan', 'Use')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.customToolbarPresetDesc}>{presetText(preset.description)}</Text>
                                    <Text style={styles.customToolbarCode}>{l('Düğme:', 'Button:')} {presetText(preset.buttonText)}</Text>
                                    <Text style={styles.customToolbarCode}>{l('Önce:', 'Before:')} {preset.prefix}</Text>
                                    <Text style={styles.customToolbarCode}>{l('Sonra:', 'After:')} {preset.suffix}</Text>
                                </View>
                            ))}
                        </ScrollView>
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
                    <View style={styles.previewCard}>
                        <View style={styles.previewHeader}>
                            <View style={styles.previewTitleRow}>
                                <EyeIcon color={colors.textPrimary} size={22} />
                                <Text style={styles.previewTitleText}>{l('Önizleme', 'Preview')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.previewHeaderClose}
                                onPress={() => setShowPreview(false)}
                                accessibilityLabel={t('common.close')}
                            >
                                <Text style={styles.previewHeaderCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.previewMeta} numberOfLines={1}>
                            {targetDeck?.name.replaceAll('::', ' › ') ?? '—'}
                        </Text>
                        <View style={styles.previewToggleRow}>
                            <TouchableOpacity
                                style={[
                                    styles.previewToggleButton,
                                    previewSide === 'question' && styles.previewToggleButtonActive,
                                ]}
                                onPress={() => setPreviewSide('question')}
                            >
                                <Text
                                    style={[
                                        styles.previewToggleText,
                                        previewSide === 'question' && styles.previewToggleTextActive,
                                    ]}
                                >
                                    {l('Soru', 'Question')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.previewToggleButton,
                                    previewSide === 'answer' && styles.previewToggleButtonActive,
                                ]}
                                onPress={() => setPreviewSide('answer')}
                            >
                                <Text
                                    style={[
                                        styles.previewToggleText,
                                        previewSide === 'answer' && styles.previewToggleTextActive,
                                    ]}
                                >
                                    {l('Cevap', 'Answer')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.previewBody, { height: previewBodyHeight }]}>
                            {previewPayload && (
                                <CardWebView
                                    noteType={previewPayload.noteType}
                                    note={previewPayload.note}
                                    card={previewPayload.card}
                                    deck={targetDeck}
                                    side={previewSide}
                                    scrollMode="contained"
                                    maxHeight={previewBodyHeight}
                                />
                            )}
                        </View>
                        <TouchableOpacity
                            style={styles.previewCloseButton}
                            onPress={() => setShowPreview(false)}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.close')}
                        >
                            <Text style={styles.previewCloseButtonText}>{t('common.close')}</Text>
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
    blockStyleButtonText: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
    blockStyleButtonTextActive: { color: colors.accent },
    calloutOption: { borderLeftWidth: 4, borderRadius: BorderRadius.sm },
    linkInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        minHeight: 44,
        fontSize: FontSize.md,
        color: colors.textPrimary,
        marginBottom: Spacing.sm,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    toolbarTabs: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        paddingTop: 4,
    },
    toolbarTab: {
        paddingHorizontal: Spacing.md,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
    },
    toolbarTabActive: { backgroundColor: colors.accentLight },
    toolbarTabText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textMuted },
    toolbarTabTextActive: { color: colors.accent },
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
        borderRadius: BorderRadius.sm,
    },
    formatButtonActive: {
        backgroundColor: colors.accentLight,
    },
    // A tool that cannot apply is greyed rather than silently swallowing the press.
    formatButtonDisabled: { opacity: 0.4 },
    blockStyleButtonTextDisabled: { color: colors.textMuted },
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
        ...StyleSheet.absoluteFill,
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
    customToolbarPresetSection: {
        marginBottom: Spacing.sm,
    },
    customToolbarSectionTitle: {
        fontSize: FontSize.xs,
        fontWeight: '700',
        color: colors.textSecondary,
        marginBottom: Spacing.xs,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    customToolbarPresetScroll: {
        flexDirection: 'row',
        gap: Spacing.xs,
        paddingVertical: 2,
    },
    customToolbarPresetChip: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.full,
    },
    customToolbarPresetChipText: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    customToolbarPreviewCard: {
        marginTop: Spacing.sm,
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        gap: 6,
    },
    customToolbarPreviewLabel: {
        fontSize: FontSize.xs,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    customToolbarPreviewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    customToolbarButtonPreview: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    customToolbarButtonPreviewText: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    customToolbarInput: { marginTop: Spacing.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    customToolbarHtmlPreview: {
        flex: 1,
        backgroundColor: colors.bgCard,
        paddingHorizontal: Spacing.xs,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    customToolbarHtmlPreviewCode: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: colors.accent,
    },
    customToolbarSecurityNote: {
        fontSize: 11,
        color: colors.textMuted,
        lineHeight: 15,
    },
    customToolbarHelpScroll: {
        maxHeight: 340,
        marginVertical: Spacing.sm,
    },
    customToolbarTemplateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    customToolbarUseChip: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        backgroundColor: colors.accentLight,
        borderRadius: BorderRadius.full,
    },
    customToolbarUseChipText: {
        fontSize: FontSize.xs,
        fontWeight: '700',
        color: colors.accent,
    },
    customToolbarPresetDesc: {
        fontSize: FontSize.xs,
        color: colors.textSecondary,
        marginBottom: 4,
    },
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
        marginTop: Spacing.sm,
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
    previewCard: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '85%',
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.lg,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    previewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    previewTitleText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    previewHeaderClose: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
    },
    previewHeaderCloseText: {
        fontSize: 16,
        color: colors.textMuted,
        fontWeight: '600',
    },
    previewMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginBottom: Spacing.sm },
    previewToggleRow: {
        flexDirection: 'row',
        backgroundColor: colors.bgSecondary,
        borderRadius: BorderRadius.sm,
        padding: 3,
        alignSelf: 'flex-start',
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
        gap: 2,
    },
    previewToggleButton: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.sm,
    },
    previewToggleButtonActive: {
        backgroundColor: colors.accent,
    },
    previewToggleText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    previewToggleTextActive: {
        color: colors.white,
        fontWeight: '700',
    },
    previewBody: {
        backgroundColor: colors.bgSecondary,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    previewCloseButton: {
        marginTop: Spacing.md,
        height: 38,
        paddingHorizontal: Spacing.xxl,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    previewCloseButtonText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
        color: colors.textSecondary,
    },
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
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    fieldLabelRow: { minHeight: 40, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: colors.textMuted },
    fieldName: { flex: 1, fontSize: FontSize.sm, fontWeight: '500', color: colors.textPrimary },
    fieldActions: { flexDirection: 'row', alignItems: 'center' },
    fieldAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    fieldActionDisabled: { opacity: 0.38 },
    });
}
