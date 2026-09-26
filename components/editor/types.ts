import type { useI18n } from '../../hooks/useI18n';

/** The two translation helpers the editor's pieces render their copy through. */
export type EditorI18n = Pick<ReturnType<typeof useI18n>, 'l' | 't'>;

/** The overflow menu's app preferences; they are saved the moment they change. */
export interface EditorPreferences {
    fontSize: number;
    capitalizeSentences: boolean;
    toolbarVisible: boolean;
    toolbarScrollable: boolean;
    pasteClipboardImagesAsPng: boolean;
}

/** What a custom toolbar button inserts, while it is being written. */
export interface ToolbarButtonDraft {
    buttonText: string;
    prefix: string;
    suffix: string;
}
