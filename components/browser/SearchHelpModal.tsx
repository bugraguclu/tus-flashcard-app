import { useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { literalSearchNameTerm } from '../../lib/searchQuery';
import { Text } from '../AppText';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/Card';
import { AppDialog } from '../ui/Dialog';
import { TextField } from '../ui/Fields';
import type { BrowserStyles } from './browserStyles';
import { buildSearchHelpGroups, type SearchHelpItem } from './searchHelpGroups';
import type { BrowserI18n } from './types';

interface SearchHelpModalProps {
    l: BrowserI18n['l'];
    onAdd: (term: string) => void;
    onClose: () => void;
    styles: BrowserStyles;
    visible: boolean;
}

export function SearchHelpModal({ l, onAdd, onClose, styles, visible }: SearchHelpModalProps) {
    const [item, setItem] = useState<SearchHelpItem | null>(null);
    const [value, setValue] = useState('');
    const valueInput = item?.value;
    const name = value.trim();

    function clearValue() {
        setItem(null);
        setValue('');
    }

    function close() {
        clearValue();
        onClose();
    }

    function submitValue() {
        if (!item || !name) return;
        onAdd(literalSearchNameTerm(item.term, name));
        clearValue();
    }

    return (
        <AppDialog
            visible={visible}
            onClose={close}
            closeButton
            title={valueInput?.label ?? l('Arama nasıl çalışır?', 'How search works')}
            message={valueInput ? undefined : l(
                'Kelimeler not alanlarında aranır. Türkçe harfleri metindeki gibi yazın veya nc:bobrek gibi bir sorguyla aksanları yok sayın. Bir terime dokunarak aramanıza ekleyin.',
                'Words search the note fields. Match accented letters as written, or use a query like nc:bobrek to ignore accents. Tap a term to add it to your search.',
            )}
            actions={valueInput ? (
                <>
                    <Button label={l('Geri', 'Back')} variant="plain" onPress={clearValue} />
                    <Button label={l('Aramaya ekle', 'Add to search')} disabled={!name} onPress={submitValue} />
                </>
            ) : undefined}
        >
            {valueInput ? (
                <TextField
                    accessibilityLabel={valueInput.label}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    onChangeText={setValue}
                    onSubmitEditing={submitValue}
                    placeholder={valueInput.example}
                    returnKeyType="search"
                    value={value}
                />
            ) : (
                <ScrollView style={styles.searchHelpList} keyboardShouldPersistTaps="handled">
                    {buildSearchHelpGroups(l).map((group) => (
                        <View key={group.title}>
                            <SectionLabel style={styles.searchHelpGroupTitle}>{group.title}</SectionLabel>
                            {group.items.map((entry) => (
                                <TouchableOpacity
                                    key={entry.term}
                                    style={styles.searchHelpRow}
                                    onPress={() => entry.value ? setItem(entry) : onAdd(entry.term)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${entry.term} ${entry.hint}`}
                                >
                                    <Text style={styles.searchHelpTerm}>{entry.term}</Text>
                                    <Text style={styles.searchHelpHint}>{entry.hint}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                </ScrollView>
            )}
        </AppDialog>
    );
}
