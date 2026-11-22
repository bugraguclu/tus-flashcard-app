import { useRef } from 'react';
import { Platform } from 'react-native';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { useModalHandoff } from '../../hooks/useModalHandoff';
import DeckOverflowGlyph from '../DeckOverflowGlyph';
import PencilGlyph from '../PencilGlyph';
import { useDockActionBottom } from '../ui/Dock';
import { SpeedDial, SpeedDialAction } from '../ui/Fab';
import { PlusIcon } from '../ui/icons';

interface DeckAddMenuProps {
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
    onCreateFilteredDeck: () => void;
    onCreateDeck: () => void;
    onAddCard: () => void;
}

/**
 * The deck list's add actions: the kit's speed dial, opened by the ＋ raised in the dock's notch
 * (the dock draws that button). Its three actions open side by side in an arc over ＋, one after
 * another from the left, over the strong dimming while ＋ turns into ×.
 */
export default function DeckAddMenu({
    visible, onOpen, onClose, onCreateFilteredDeck, onCreateDeck, onAddCard,
}: DeckAddMenuProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const bottom = useDockActionBottom();
    const pendingAction = useRef<(() => void) | null>(null);
    const handoff = useModalHandoff(visible);

    const selectAction = (action: () => void) => {
        if (pendingAction.current) return;
        // UIKit must finish dismissing this menu before another modal or editor can open. The
        // menu hands off (useModalHandoff), so it goes at once instead of sinking back into ＋.
        if (Platform.OS === 'ios') {
            pendingAction.current = action;
            handoff.handOff(onClose);
        } else {
            onClose();
            action();
        }
    };

    const handleDismiss = () => {
        const action = pendingAction.current;
        pendingAction.current = null;
        action?.();
    };

    return (
        <SpeedDial
            visible={visible}
            onOpen={onOpen}
            onClose={onClose}
            onDismiss={handleDismiss}
            closeAtOnce={handoff.closeAtOnce}
            bottom={bottom}
            placement="center"
            withButton={false}
            openColor={colors.accentHover}
            icon={<PlusIcon color={colors.onAccent} size={28} />}
            turnsToClose
            openLabel={l('Ekle', 'Add')}
            closeLabel={l('Ekleme menüsünü kapat', 'Close add menu')}
        >
            <SpeedDialAction
                key="filtered-deck"
                label={l('Filtrelenmiş deste oluştur', 'Create filtered deck')}
                icon={<DeckOverflowGlyph kind="filteredDeck" color={colors.onAccent} size={22} />}
                onPress={() => selectAction(onCreateFilteredDeck)}
            />
            <SpeedDialAction
                key="deck"
                label={l('Deste oluştur', 'Create deck')}
                icon={<DeckOverflowGlyph kind="deck" color={colors.onAccent} size={22} />}
                onPress={() => selectAction(onCreateDeck)}
            />
            <SpeedDialAction
                key="note"
                label={l('Kart ekle', 'Add note')}
                icon={<PencilGlyph color={colors.onAccent} size={22} />}
                onPress={() => selectAction(onAddCard)}
            />
        </SpeedDial>
    );
}
