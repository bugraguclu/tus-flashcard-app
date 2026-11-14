import { useState } from 'react';
import { View } from 'react-native';
import { Section, SectionLabel } from '../ui/Card';
import { Notice } from '../ui/Feedback';
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
    cancelLabel: string;
    l: (tr: string, en: string) => string;
}) {
    const {
        fileType, withScheduling, setWithScheduling, withDeckConfigs, setWithDeckConfigs,
        updateNotes, setUpdateNotes, updateNoteTypes, setUpdateNoteTypes, styles, cancelLabel, l,
    } = props;
    const [picker, setPicker] = useState<null | 'updateNotes' | 'updateNoteTypes'>(null);
    const { updateChoiceLabel } = importCopy(l);
    const { renderOptionRow, renderToggleRow } = importRowRenderers(styles);
    return (
        <>
            {fileType === 'apkg' ? (
                <>
                    <Section label={l('İçe aktarma seçenekleri', 'Import options')}>
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
                    </Section>
                    <Section
                        label={l('Güncellemeler', 'Updates')}
                        footnote={l(
                            'Alanları ya da kart türleri değişmiş bir not türü birleştirilmez, ayrı bir kopya olarak eklenir.',
                            'A note type whose fields or card types have changed is not merged; it is added as a separate copy.',
                        )}
                    >
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
                    </Section>
                </>
            ) : (
                <View style={styles.labelled}>
                    <SectionLabel>{l('İçe aktarma seçenekleri', 'Import options')}</SectionLabel>
                    <Notice tone="danger">
                        {l(
                            'Koleksiyonunuz, ayarları ve çalışma geçmişiyle birlikte paketteki koleksiyonla değiştirilir. Medya dosyaları silinmez.',
                            'Your collection, with its settings and review history, is replaced by the one in the package. Media files are not deleted.',
                        )}
                    </Notice>
                </View>
            )}
            <ChoiceModal
                visible={picker !== null}
                title={picker === 'updateNoteTypes'
                    ? l('Not türlerini güncelle', 'Update note types')
                    : l('Notları güncelle', 'Update notes')}
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
