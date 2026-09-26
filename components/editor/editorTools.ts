import type { RichTextCommand } from '../RichTextEditor';
import {
    blockFormatValue,
    EDITOR_BLOCK_STYLES,
    type EditorBlockStyleKey,
    type EditorToolKey,
} from '../../lib/editorToolbar';
import type { AnkiToolbarIconName } from './EditorIcons';
import type { EditorI18n } from './types';

export type FormattingTool = {
    icon: AnkiToolbarIconName;
    /** Rendered instead of the icon. Six block-style icons would be indistinguishable. */
    text?: string;
    label: string;
    hint?: string;
    onPress: () => void;
    onLongPress?: () => void;
};

/** The screen actions the toolbar's buttons run; each is bound to the editor that owns it. */
export interface EditorToolActions {
    runCommand: (command: RichTextCommand, value?: string) => void;
    wrapSelection: (prefix: string, suffix: string) => void;
    stepFontSize: (direction: 1 | -1) => void;
    cycleTextCase: () => void;
    openColorPicker: () => void;
    openFontFamilyPicker: () => void;
    openInlineFontSizePicker: () => void;
    openLineSpacingPicker: () => void;
    openTablePicker: () => void;
    openLinkEditor: () => void;
    openCalloutPicker: () => void;
    openMathPicker: () => void;
    openHtmlSource: () => void;
}

/** Every formatting tool the toolbar can show, keyed the way `EDITOR_TOOLBAR_LAYOUT` names them. */
export function buildEditorTools(l: EditorI18n['l'], actions: EditorToolActions): Record<EditorToolKey, FormattingTool> {
    const blockStyleTool = (key: EditorBlockStyleKey, icon: AnkiToolbarIconName, text?: string): FormattingTool => {
        const style = EDITOR_BLOCK_STYLES.find((entry) => entry.key === key);
        return {
            icon,
            text,
            label: style ? l(style.tr, style.en) : key,
            onPress: () => actions.runCommand('formatBlock', blockFormatValue(key)),
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
    return {
        undo: {
            icon: 'undo',
            label: l('Geri al', 'Undo'),
            onPress: () => actions.runCommand('undo'),
        },
        redo: {
            icon: 'redo',
            label: l('Yinele', 'Redo'),
            onPress: () => actions.runCommand('redo'),
        },
        bold: {
            icon: 'bold',
            label: l('Kalın', 'Bold'),
            onPress: () => actions.runCommand('bold'),
        },
        italic: {
            icon: 'italic',
            label: l('İtalik', 'Italic'),
            onPress: () => actions.runCommand('italic'),
        },
        underline: {
            icon: 'underline',
            label: l('Altı çizili', 'Underline'),
            onPress: () => actions.runCommand('underline'),
        },
        strikethrough: {
            icon: 'strikethrough',
            label: l('Üstü çizili', 'Strikethrough'),
            onPress: () => actions.runCommand('strikeThrough'),
        },
        subscript: {
            icon: 'subscript',
            label: l('Alt simge', 'Subscript'),
            onPress: () => actions.runCommand('subscript'),
        },
        superscript: {
            icon: 'superscript',
            label: l('Üst simge', 'Superscript'),
            onPress: () => actions.runCommand('superscript'),
        },
        color: {
            icon: 'color',
            label: l('Renk paleti', 'Color palette'),
            onPress: actions.openColorPicker,
        },
        fontFamily: {
            icon: 'fontFamily',
            label: l('Yazı tipi', 'Font'),
            onPress: actions.openFontFamilyPicker,
        },
        fontSize: {
            icon: 'fontSize',
            label: l('Yazı boyutu', 'Font size'),
            onPress: actions.openInlineFontSizePicker,
        },
        growFont: {
            icon: 'growFont',
            label: l('Yazı tipini büyüt', 'Grow font'),
            onPress: () => actions.stepFontSize(1),
        },
        shrinkFont: {
            icon: 'shrinkFont',
            label: l('Yazı tipini küçült', 'Shrink font'),
            onPress: () => actions.stepFontSize(-1),
        },
        changeCase: {
            icon: 'changeCase',
            label: l('Büyük/küçük harf', 'Change case'),
            hint: l('Seçimi Cümle → küçük → BÜYÜK sırasıyla değiştirir', 'Cycles the selection through Sentence, lower and UPPER case'),
            onPress: actions.cycleTextCase,
        },
        removeFormat: {
            icon: 'removeFormat',
            label: l('Biçimlendirmeyi temizle', 'Clear formatting'),
            onPress: () => actions.runCommand('removeFormat'),
        },
        justifyLeft: {
            icon: 'alignLeft',
            label: l('Sola hizala', 'Align left'),
            onPress: () => actions.runCommand('justifyLeft'),
        },
        justifyCenter: {
            icon: 'alignCenter',
            label: l('Ortala', 'Center'),
            onPress: () => actions.runCommand('justifyCenter'),
        },
        justifyRight: {
            icon: 'alignRight',
            label: l('Sağa hizala', 'Align right'),
            onPress: () => actions.runCommand('justifyRight'),
        },
        justifyFull: {
            icon: 'alignJustify',
            label: l('İki yana yasla', 'Justify'),
            onPress: () => actions.runCommand('justifyFull'),
        },
        ...blockStyleTools,
        listBullet: {
            icon: 'listBullet',
            label: l('Madde imli liste', 'Bullet list'),
            onPress: () => actions.runCommand('insertUnorderedList'),
        },
        listNumber: {
            icon: 'listNumber',
            label: l('Numaralı liste', 'Numbered list'),
            onPress: () => actions.runCommand('insertOrderedList'),
        },
        indent: {
            icon: 'indent',
            label: l('Girintiyi artır', 'Increase indent'),
            onPress: () => actions.runCommand('indent'),
        },
        outdent: {
            icon: 'outdent',
            label: l('Girintiyi azalt', 'Decrease indent'),
            onPress: () => actions.runCommand('outdent'),
        },
        lineSpacing: {
            icon: 'lineSpacing',
            label: l('Satır aralığı', 'Line spacing'),
            onPress: actions.openLineSpacingPicker,
        },
        table: {
            icon: 'table',
            label: l('Tablo ekle', 'Insert table'),
            onPress: actions.openTablePicker,
        },
        link: {
            icon: 'link',
            label: l('Bağlantı ekle', 'Insert link'),
            onPress: actions.openLinkEditor,
        },
        callout: {
            icon: 'callout',
            label: l('Bilgi kutusu ekle', 'Insert callout'),
            onPress: actions.openCalloutPicker,
        },
        rule: {
            icon: 'rule',
            label: l('Yatay çizgi ekle', 'Insert horizontal line'),
            onPress: () => actions.runCommand('insertHorizontalRule'),
        },
        math: {
            icon: 'math',
            label: l('MathJax ekle', 'Insert MathJax'),
            hint: l('Basılı tutarak diğer MathJax biçimlerini açın', 'Long press for other MathJax formats'),
            onPress: () => actions.wrapSelection('\\(', '\\)'),
            onLongPress: actions.openMathPicker,
        },
        html: {
            icon: 'html',
            label: l('HTML kaynağı', 'HTML source'),
            onPress: actions.openHtmlSource,
        },
    };
}
