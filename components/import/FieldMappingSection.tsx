import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { NoteTypeField } from '../../lib/models';
import { ChevronDownIcon, ChoiceModal } from './ImportControls';
import type { ImportStyles } from './importStyles';

/** What a text column is mapped to: a note field, the tags field, or nothing. */
export type ColumnMapping = `field:${number}` | 'tags' | 'none';

/**
 * A text file's field-mapping table and its preview, as Anki's import screen shows them: each
 * column with a sample and the field it fills, the columns the file's headers reserve shown
 * locked, and the first rows under the mapped headers.
 */
export default function FieldMappingSection(props: {
    fields: NoteTypeField[];
    /** The file gives every row its own note type in this column (1-based), so there is no table. */
    notetypeColumn?: number;
    columnCount: number;
    visibleColumnCount: number;
    previewRows: string[][];
    metaColumns: ReadonlyMap<number, string>;
    defaultMapping: ReadonlyMap<number, ColumnMapping>;
    mappingFor: (column: number) => ColumnMapping;
    setColumnMappings: (update: (current: Record<number, ColumnMapping>) => Record<number, ColumnMapping>) => void;
    styles: ImportStyles;
    accentColor: string;
    cancelLabel: string;
    l: (tr: string, en: string) => string;
}) {
    const {
        fields, notetypeColumn, columnCount, visibleColumnCount, previewRows, metaColumns, defaultMapping,
        mappingFor, setColumnMappings, styles, accentColor, cancelLabel, l,
    } = props;
    const perRowNoteTypes = Boolean(notetypeColumn);
    const [mappingColumn, setMappingColumn] = useState<number | null>(null);
    const mappingLabel = (mapping: ColumnMapping): string => {
        if (mapping.startsWith('field:')) return fields[Number(mapping.slice(6))]?.name ?? l('Geçersiz alan', 'Invalid field');
        if (mapping === 'tags') return l('Etiketler', 'Tags');
        return l('Yok sayıldı', 'Ignored');
    };
    return (
        <>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{l('ALAN EŞLEMESİ', 'FIELD MAPPING')}</Text>
                {perRowNoteTypes ? (
                    <Text style={styles.optionHint}>
                        {l(
                            `Dosya her satırın not türünü ${notetypeColumn}. sütunda veriyor. Kalan sütunlar, o satırın kendi alanlarına sırayla eşlenir.`,
                            `The file gives each row's note type in column ${notetypeColumn}. The remaining columns are mapped in order onto that row's own fields.`,
                        )}
                    </Text>
                ) : null}
                {!perRowNoteTypes && columnCount === 0 ? (
                    <Text style={styles.optionHint}>
                        {l('Dosyada okunabilir satır bulunamadı.', 'No readable rows were found in the file.')}
                    </Text>
                ) : null}
                {(perRowNoteTypes ? [] : Array.from({ length: visibleColumnCount })).map((_, column) => {
                    const meta = metaColumns.get(column);
                    const sample = previewRows.map((row) => row[column] ?? '').find(Boolean) ?? '';
                    return (
                        <View key={column} style={styles.mappingRow}>
                            <View style={styles.mappingInfo}>
                                <Text style={styles.mappingColumn}>
                                    {l(`Sütun ${column + 1}`, `Column ${column + 1}`)}
                                </Text>
                                <Text style={styles.mappingSample} numberOfLines={1}>
                                    {sample || l('(boş)', '(empty)')}
                                </Text>
                            </View>
                            {meta ? (
                                <View style={styles.mappingLockedBadge}>
                                    <Text style={styles.mappingLockedText} numberOfLines={1}>{meta}</Text>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={styles.mappingBadge}
                                    onPress={() => setMappingColumn(column)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l(
                                        `Sütun ${column + 1} eşlemesi: ${mappingLabel(mappingFor(column))}`,
                                        `Column ${column + 1} mapping: ${mappingLabel(mappingFor(column))}`,
                                    )}
                                >
                                    <Text style={styles.mappingBadgeText} numberOfLines={1}>
                                        {mappingLabel(mappingFor(column))}
                                    </Text>
                                    <ChevronDownIcon color={accentColor} size={15} />
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
                {!perRowNoteTypes && columnCount > visibleColumnCount ? (
                    <Text style={styles.optionHint}>
                        {l(
                            `Yalnızca ilk ${visibleColumnCount} sütun gösteriliyor; kalan sütunlar yok sayılır.`,
                            `Only the first ${visibleColumnCount} columns are shown; the rest are ignored.`,
                        )}
                    </Text>
                ) : null}
            </View>

            {previewRows.length > 0 ? (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {l(`ÖNİZLEME (İLK ${previewRows.length} SATIR)`, `PREVIEW (FIRST ${previewRows.length} ROWS)`)}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.previewTable}>
                        <View>
                            <View style={styles.previewHeaderRow}>
                                {Array.from({ length: visibleColumnCount }).map((_, column) => (
                                    <View key={column} style={styles.previewCell}>
                                        <Text style={styles.previewHeaderText} numberOfLines={1}>
                                            {metaColumns.get(column)
                                                ?? (perRowNoteTypes
                                                    ? l(`Sütun ${column + 1}`, `Column ${column + 1}`)
                                                    : mappingLabel(mappingFor(column)))}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                            {previewRows.map((row, rowIndex) => (
                                <View key={rowIndex} style={styles.previewRow}>
                                    {Array.from({ length: visibleColumnCount }).map((_, column) => (
                                        <View key={column} style={styles.previewCell}>
                                            <Text style={styles.previewCellText} numberOfLines={2}>
                                                {row[column] ?? ''}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            ) : null}

            <ChoiceModal
                visible={mappingColumn !== null}
                title={mappingColumn === null
                    ? ''
                    : l(`Sütun ${mappingColumn + 1} eşlemesi`, `Column ${mappingColumn + 1} mapping`)}
                styles={styles}
                cancelLabel={cancelLabel}
                options={[
                    ...fields.map((field, index) => ({
                        value: `field:${index}`,
                        label: field.name,
                        selected: mappingColumn !== null && mappingFor(mappingColumn) === `field:${index}`,
                    })),
                    {
                        value: 'tags',
                        label: l('Etiketler', 'Tags'),
                        selected: mappingColumn !== null && mappingFor(mappingColumn) === 'tags',
                    },
                    {
                        value: 'none',
                        label: l('Yok sayıldı', 'Ignored'),
                        selected: mappingColumn !== null && mappingFor(mappingColumn) === 'none',
                    },
                ]}
                onSelect={(value) => {
                    if (mappingColumn === null) return;
                    const target = value as ColumnMapping;
                    setColumnMappings((current) => {
                        const next = { ...current };
                        // A note field can only come from one column, so claiming it releases the
                        // column that held it — otherwise two columns would silently fight over it.
                        if (target.startsWith('field:')) {
                            for (let column = 0; column < columnCount; column++) {
                                if (column !== mappingColumn && (next[column] ?? defaultMapping.get(column)) === target) {
                                    next[column] = 'none';
                                }
                            }
                        }
                        next[mappingColumn] = target;
                        return next;
                    });
                    setMappingColumn(null);
                }}
                onClose={() => setMappingColumn(null)}
            />
        </>
    );
}
