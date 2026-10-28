import { useState } from 'react';
import { Text, View } from 'react-native';
import { ChoiceModal } from './ImportControls';
import type { ImportStyles } from './importStyles';
import { importCopy } from './importCopy';
import { importRowRenderers } from './ImportRows';
import { SEPARATOR_CHOICES } from '../../lib/importDelimited';
import type { DuplicateResolution, MatchScope } from '../../lib/importNotes';

/**
 * A text file's import options, in the order Anki lists them: separator, HTML, note type, deck,
 * existing notes, match scope and the two tag inputs. A note type or deck named by a column of the
 * file is shown as such instead of a picker.
 */
export default function TextImportOptions(props: {
    separator: string | null;
    guessedSeparator: string;
    onSeparator: (value: string) => void;
    allowHtml: boolean;
    setAllowHtml: (update: (value: boolean) => boolean) => void;
    notetypeColumn?: number;
    deckColumn?: number;
    noteTypeName: string;
    deckName: string;
    onPickNoteType: () => void;
    onPickDeck: () => void;
    duplicateResolution: DuplicateResolution;
    setDuplicateResolution: (value: DuplicateResolution) => void;
    matchScope: MatchScope;
    setMatchScope: (value: MatchScope) => void;
    tagAllNotes: string;
    setTagAllNotes: (value: string) => void;
    tagUpdatedNotes: string;
    setTagUpdatedNotes: (value: string) => void;
    styles: ImportStyles;
    mutedColor: string;
    cancelLabel: string;
    l: (tr: string, en: string) => string;
}) {
    const {
        separator, guessedSeparator, onSeparator, allowHtml, setAllowHtml, notetypeColumn, deckColumn,
        noteTypeName, deckName, onPickNoteType, onPickDeck, duplicateResolution, setDuplicateResolution,
        matchScope, setMatchScope, tagAllNotes, setTagAllNotes, tagUpdatedNotes, setTagUpdatedNotes,
        styles, mutedColor, cancelLabel, l,
    } = props;
    const [picker, setPicker] = useState<null | 'separator' | 'existing' | 'matchScope'>(null);
    const { existingNotesLabel, matchScopeLabel, separatorLabel } = importCopy(l);
    const { renderOptionRow, renderToggleRow, renderTagRow } = importRowRenderers(styles, mutedColor);
    const fromFile = (label: string, column: number) => (
        <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>{label}</Text>
            <Text style={styles.optionValueMuted} numberOfLines={1}>
                {l(`Dosyadan (sütun ${column})`, `From file (column ${column})`)}
            </Text>
        </View>
    );
    const close = () => setPicker(null);

    return (
        <>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{l('İÇE AKTARMA SEÇENEKLERİ', 'IMPORT OPTIONS')}</Text>
                {renderOptionRow(
                    separator
                        ? l('Alanları ayıran', 'Fields separated by')
                        : l('Alanları ayıran (tahmin)', 'Fields separated by (guessed)'),
                    separatorLabel(separator ?? guessedSeparator),
                    () => setPicker('separator'),
                )}
                {renderToggleRow(
                    l('Alanlarda HTML’e izin ver', 'Allow HTML in fields'),
                    l(
                        'Kapalıyken metin kaçışlanır ve satır sonları <br> olur.',
                        'When off, text is escaped and line breaks become <br>.',
                    ),
                    allowHtml,
                    () => setAllowHtml((value) => !value),
                )}
                {notetypeColumn
                    ? fromFile(l('Not türü', 'Note type'), notetypeColumn)
                    : renderOptionRow(l('Not türü', 'Note type'), noteTypeName, onPickNoteType)}
                {deckColumn
                    ? fromFile(l('Deste', 'Deck'), deckColumn)
                    : renderOptionRow(l('Deste', 'Deck'), deckName, onPickDeck)}
                {renderOptionRow(
                    l('Mevcut notlar', 'Existing notes'),
                    existingNotesLabel(duplicateResolution),
                    () => setPicker('existing'),
                )}
                {renderOptionRow(
                    l('Eşleşme kapsamı', 'Match scope'),
                    matchScopeLabel(matchScope),
                    () => setPicker('matchScope'),
                )}
                {renderTagRow(
                    l('Tüm notları etiketle', 'Tag all notes'),
                    l('boşlukla ayırın', 'space separated'),
                    tagAllNotes,
                    setTagAllNotes,
                )}
                {renderTagRow(
                    l('Güncellenen notları etiketle', 'Tag updated notes'),
                    l('boşlukla ayırın', 'space separated'),
                    tagUpdatedNotes,
                    setTagUpdatedNotes,
                )}
            </View>

            <ChoiceModal
                visible={picker === 'separator'}
                title={l('Alanları ayıran', 'Fields separated by')}
                styles={styles}
                cancelLabel={cancelLabel}
                options={SEPARATOR_CHOICES.map((choice) => ({
                    value: choice.delimiter,
                    label: separatorLabel(choice.delimiter),
                    selected: (separator ?? guessedSeparator) === choice.delimiter,
                }))}
                onSelect={(value) => {
                    onSeparator(value);
                    close();
                }}
                onClose={close}
            />

            <ChoiceModal
                visible={picker === 'existing'}
                title={l('Mevcut notlar', 'Existing notes')}
                styles={styles}
                cancelLabel={cancelLabel}
                options={(['update', 'preserve', 'duplicate'] as const).map((value) => ({
                    value,
                    label: existingNotesLabel(value),
                    hint: {
                        update: l('İlk alanı eşleşen notu dosyadaki içerikle güncelle.', 'Update a note whose first field matches with the file’s content.'),
                        preserve: l('Eşleşen notu olduğu gibi bırak, satırı atla.', 'Leave the matching note untouched and skip the row.'),
                        duplicate: l('Eşleşme olsa bile yeni not olarak ekle.', 'Add as a new note even when there is a match.'),
                    }[value],
                    selected: duplicateResolution === value,
                }))}
                onSelect={(value) => {
                    setDuplicateResolution(value as DuplicateResolution);
                    close();
                }}
                onClose={close}
            />

            <ChoiceModal
                visible={picker === 'matchScope'}
                title={l('Eşleşme kapsamı', 'Match scope')}
                styles={styles}
                cancelLabel={cancelLabel}
                options={(['notetype', 'notetypeAndDeck'] as const).map((value) => ({
                    value,
                    label: matchScopeLabel(value),
                    selected: matchScope === value,
                }))}
                onSelect={(value) => {
                    setMatchScope(value as MatchScope);
                    close();
                }}
                onClose={close}
            />
        </>
    );
}
