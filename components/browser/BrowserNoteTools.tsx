import { useMemo } from 'react';
import type { ColorScheme } from '../../constants/theme';
import type { NoteType } from '../../lib/models';
import type { CollectionChange } from '../../lib/deferredInvalidation';
import type { SupportedLocale } from '../../lib/i18n';
import { FindReplaceDialog } from './FindReplaceDialog';
import { createNoteToolStyles } from './noteToolStyles';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';

/** The browser's note tools, from Anki's Notes menu. */
export type BrowserNoteTool = { kind: 'find-replace' };

interface BrowserNoteToolsProps {
    colors: ColorScheme;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    noteTypes: NoteType[];
    /** An edit changed the collection: refresh the list in place. */
    onChanged: (change: CollectionChange) => void;
    onClose: () => void;
    selectedNoteIds: number[];
    selectedNoteTypeIds: number[];
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    /** The open tool, or null. Every dialog stays mounted, so it keeps what was typed into it. */
    tool: BrowserNoteTool | null;
}

/** The dialogs behind the browser's note tools, kept out of the screen file. */
export function BrowserNoteTools({
    colors,
    l,
    locale,
    noteTypes,
    onChanged,
    onClose,
    selectedNoteIds,
    selectedNoteTypeIds,
    styles,
    t,
    tool,
}: BrowserNoteToolsProps) {
    const toolStyles = useMemo(() => createNoteToolStyles(colors), [colors]);
    return (
        <FindReplaceDialog
            colors={colors}
            l={l}
            locale={locale}
            noteTypes={noteTypes}
            onChanged={onChanged}
            onClose={onClose}
            selectedNoteIds={selectedNoteIds}
            selectedNoteTypeIds={selectedNoteTypeIds}
            styles={styles}
            t={t}
            toolStyles={toolStyles}
            visible={tool?.kind === 'find-replace'}
        />
    );
}
