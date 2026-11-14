import { useMemo } from 'react';
import type { ColorScheme } from '../../constants/theme';
import type { NoteType } from '../../lib/models';
import type { CollectionChange } from '../../lib/deferredInvalidation';
import type { SupportedLocale } from '../../lib/i18n';
import { FindReplaceDialog } from './FindReplaceDialog';
import { FindDuplicatesDialog } from './FindDuplicatesDialog';
import { RenameTagDialog } from './RenameTagDialog';
import { createNoteToolStyles } from './noteToolStyles';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';

/** The browser's note tools, from Anki's Notes menu and its sidebar's tag Rename. */
export type BrowserNoteTool =
    | { kind: 'find-replace' }
    | { kind: 'find-duplicates' }
    | { kind: 'rename-tag'; tag: string };

interface BrowserNoteToolsProps {
    colors: ColorScheme;
    /** The collection's revision, so stale duplicate groups are found again. */
    dataVersion: number;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    noteTypes: NoteType[];
    /** An edit changed the collection: refresh the list in place. */
    onChanged: (change: CollectionChange) => void;
    onClose: () => void;
    /** Replace the browser's search, in place, to list some notes (a duplicate group). */
    onShowSearch: (search: string) => void;
    /** A tag was renamed on the notes (the collection change is reported through onChanged too). */
    onTagRenamed: (oldName: string, newName: string) => void;
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
    dataVersion,
    l,
    locale,
    noteTypes,
    onChanged,
    onClose,
    onShowSearch,
    onTagRenamed,
    selectedNoteIds,
    selectedNoteTypeIds,
    styles,
    t,
    tool,
}: BrowserNoteToolsProps) {
    const toolStyles = useMemo(() => createNoteToolStyles(colors), [colors]);
    return (
        <>
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
            <FindDuplicatesDialog
                colors={colors}
                dataVersion={dataVersion}
                l={l}
                locale={locale}
                noteTypes={noteTypes}
                onChanged={onChanged}
                onClose={onClose}
                onShowGroup={onShowSearch}
                styles={styles}
                t={t}
                toolStyles={toolStyles}
                visible={tool?.kind === 'find-duplicates'}
            />
            <RenameTagDialog
                colors={colors}
                l={l}
                onClose={onClose}
                onRenamed={(oldName, newName) => {
                    onTagRenamed(oldName, newName);
                    // Tags belong to notes, so a study session keeps its queue, as in Anki.
                    onChanged({ keepsStudyQueue: true });
                }}
                styles={styles}
                t={t}
                tag={tool?.kind === 'rename-tag' ? tool.tag : null}
                toolStyles={toolStyles}
            />
        </>
    );
}
