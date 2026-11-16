import { StyleSheet } from 'react-native';
import { Spacing } from '../../constants/theme';
import { Card } from '../ui/Card';
import { ListRow, SelectRow } from '../ui/Rows';
import type { EditorI18n } from './types';

interface EditorTargetRowsProps {
    typeLabel: string;
    /** An existing or built-in note keeps its type: the row then only says why when tapped. */
    typeLocked: boolean;
    onPressType: () => void;
    deckLabel: string;
    /** Built-in cards stay in their deck. */
    deckLocked: boolean;
    onPressDeck: () => void;
    l: EditorI18n['l'];
}

/**
 * The note's type and target deck at the top of the editor. A row that opens its list is a
 * `SelectRow`; a locked one shows the value without the chevron and still answers a press, so a
 * tap that changes nothing says why instead of reading as a broken control.
 */
export function EditorTargetRows({ typeLabel, typeLocked, onPressType, deckLabel, deckLocked, onPressDeck, l }: EditorTargetRowsProps) {
    const typeSpoken = l(`Not türü: ${typeLabel}`, `Note type: ${typeLabel}`);
    const deckSpoken = l('Hedef desteyi seç', 'Select target deck');
    return (
        <Card divided style={styles.card}>
            {typeLocked
                ? <ListRow title={l('Tür', 'Type')} value={typeLabel} chevron={false} onPress={onPressType} accessibilityLabel={typeSpoken} />
                : <SelectRow label={l('Tür', 'Type')} value={typeLabel} onPress={onPressType} accessibilityLabel={typeSpoken} />}
            {deckLocked
                ? <ListRow title={l('Deste', 'Deck')} value={deckLabel} chevron={false} onPress={onPressDeck} accessibilityLabel={deckSpoken} />
                : <SelectRow label={l('Deste', 'Deck')} value={deckLabel} onPress={onPressDeck} accessibilityLabel={deckSpoken} />}
        </Card>
    );
}

interface EditorSummaryRowsProps {
    tags: string[];
    /** The names of the cards the note type makes. */
    cards: string[];
    onPressTags: () => void;
    onPressCards: () => void;
    l: EditorI18n['l'];
}

/** Under the fields: the note's tags and the cards its type makes; each row opens its editor. */
export function EditorSummaryRows({ tags, cards, onPressTags, onPressCards, l }: EditorSummaryRowsProps) {
    return (
        <Card divided style={styles.card}>
            <ListRow
                title={l('Etiketler', 'Tags')}
                summary={tags.length > 0 ? tags.join(' · ') : undefined}
                value={tags.length > 0 ? undefined : '—'}
                onPress={onPressTags}
                accessibilityLabel={l('Etiketleri düzenle', 'Edit tags')}
                accessibilityHint={l('Etiket aramak, eklemek veya seçmek için açar', 'Opens tag search, creation and selection')}
            />
            <ListRow
                title={l('Kartlar', 'Cards')}
                summary={cards.length > 0 ? cards.join(' · ') : undefined}
                value={cards.length > 0 ? undefined : '—'}
                onPress={onPressCards}
                accessibilityLabel={l('Kart şablonlarını düzenle', 'Edit card templates')}
                accessibilityHint={l('Seçili not türünün şablonlarını açar. Değişiklikler bu türdeki bütün notları etkiler.', 'Opens the templates of the selected note type. Changes affect every note of this type.')}
            />
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { marginVertical: Spacing.sm },
});
