import { useState } from 'react';
import { Text, View } from 'react-native';
import { ChoiceModal } from './ImportControls';
import type { ImportStyles } from './importStyles';
import type { UpdateChoice } from './importCopy';
import { importCopy } from './importCopy';
import { importRowRenderers } from './ImportRows';

/**
 * A package's import options: Anki's learning-progress, deck-preset and the two update choices for
 * an .apkg, or the replacement warning for a .colpkg.
 */
export default function PackageImportOptions(props: {
    fileType: 'apkg' | 'colpkg';
    withScheduling: boolean;
    setWithScheduling: (update: (value: boolean) => boolean) => void;
    withDeckConfigs: boolean;
    setWithDeckConfigs: (update: (value: boolean) => boolean) => void;
    updateNotes: UpdateChoice;
    setUpdateNotes: (value: UpdateChoice) => void;
    updateNoteTypes: UpdateChoice;
    setUpdateNoteTypes: (value: UpdateChoice) => void;
    styles: ImportStyles;
    mutedColor: string;
    cancelLabel: string;
    l: (tr: string, en: string) => string;
}) {
    const {
        fileType, withScheduling, setWithScheduling, withDeckConfigs, setWithDeckConfigs,
        updateNotes, setUpdateNotes, updateNoteTypes, setUpdateNoteTypes, styles, mutedColor, cancelLabel, l,
    } = props;
    const [picker, setPicker] = useState<null | 'updateNotes' | 'updateNoteTypes'>(null);
    const { updateChoiceLabel } = importCopy(l);
    const { renderOptionRow, renderToggleRow } = importRowRenderers(styles, mutedColor);
    return (
        <>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{l('İÇE AKTARMA SEÇENEKLERİ', 'IMPORT OPTIONS')}</Text>
                {fileType === 'apkg' ? (
                    <>
                        {renderToggleRow(
                            l('Çalışma ilerlemesini içe aktar', 'Import any learning progress'),
                            l(
                                'Kapalıysa kartlar yeni başlar; “marked” ve “leech” etiketleri ile kaynak çalışma geçmişi alınmaz.',
                                'When off, cards start as new; the “marked” and “leech” tags and the source review history are not imported.',
                            ),
                            withScheduling,
                            () => setWithScheduling((value) => !value),
                        )}
                        {renderToggleRow(
                            l('Deste ayarlarını içe aktar', 'Import any deck presets'),
                            null,
                            withDeckConfigs,
                            () => setWithDeckConfigs((value) => !value),
                        )}
                        <Text style={styles.subsectionTitle}>{l('GÜNCELLEMELER', 'UPDATES')}</Text>
                        {renderOptionRow(
                            l('Notları güncelle', 'Update notes'),
                            updateChoiceLabel(updateNotes),
                            () => setPicker('updateNotes'),
                        )}
                        {renderOptionRow(
                            l('Not türlerini güncelle', 'Update note types'),
                            updateChoiceLabel(updateNoteTypes),
                            () => setPicker('updateNoteTypes'),
                        )}
                        <Text style={styles.optionHint}>
                            {l(
                                'Şeması değişmiş bir not türü birleştirilmez: paketteki tür ayrı bir kopya olarak eklenir ve yerel notlarınız olduğu gibi kalır.',
                                'A note type whose schema has changed is not merged: the package’s type is added as a separate copy and your local notes are left as they are.',
                            )}
                        </Text>
                    </>
                ) : (
                    <Text style={styles.destructiveNotice}>
                        {l(
                            '⚠️ Bu işlem kartlarınızı, destelerinizi ve çalışma geçmişinizi paketteki koleksiyonla değiştirecek. Yeni gün başlangıcı, FSRS ve günlük sınır kuralları da paketteki koleksiyondan gelir. Mevcut medya dosyaları silinmez.',
                            '⚠️ This will replace your cards, decks and review history with the collection in the package. Next day starts at, FSRS and the daily-limit rules also come from the collection in the package. Existing media files are not deleted.',
                        )}
                    </Text>
                )}
            </View>
            <ChoiceModal
                visible={picker !== null}
                title={picker === 'updateNoteTypes'
                    ? l('Not türlerini güncelle', 'Update note types')
                    : l('Notları güncelle', 'Update notes')}
                styles={styles}
                cancelLabel={cancelLabel}
                options={(['ifNewer', 'always', 'never'] as const).map((value) => ({
                    value,
                    label: updateChoiceLabel(value),
                    selected: (picker === 'updateNoteTypes' ? updateNoteTypes : updateNotes) === value,
                }))}
                onSelect={(value) => {
                    if (picker === 'updateNoteTypes') setUpdateNoteTypes(value as UpdateChoice);
                    else setUpdateNotes(value as UpdateChoice);
                    setPicker(null);
                }}
                onClose={() => setPicker(null)}
            />
        </>
    );
}
