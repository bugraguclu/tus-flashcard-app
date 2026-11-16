import { useI18n } from '../../hooks/useI18n';
import { deckRowMenuLabel, type DeckRowMenuAction } from '../../lib/deckRowMenu';
import { MenuDialog, MenuItem } from '../ui/Menu';

interface DeckRowMenuProps {
    visible: boolean;
    deckName: string;
    actions: DeckRowMenuAction[];
    onSelect: (action: DeckRowMenuAction) => void;
    onClose: () => void;
    /**
     * Runs once the menu has been dismissed. iOS cannot present the route, dialog or sheet chosen
     * in it until then, so the deck list holds the chosen action back until this is called.
     */
    onDismissed: () => void;
    /** Leaves without its fade: set by `useModalHandoff` while it hands the screen to what was chosen. */
    closeAtOnce?: boolean;
    backdropLabel?: string;
}

/** A deck's ••• menu: the kit's centred menu card, titled with the deck path, one row per action. */
export default function DeckRowMenu({ visible, deckName, actions, onSelect, onClose, onDismissed, closeAtOnce = false, backdropLabel }: DeckRowMenuProps) {
    const { l } = useI18n();
    return (
        <MenuDialog
            visible={visible}
            title={deckName.replaceAll('::', ' › ')}
            onClose={onClose}
            onDismissed={onDismissed}
            closeAtOnce={closeAtOnce}
            closeLabel={backdropLabel}
        >
            {actions.map((action) => (
                <MenuItem
                    key={action}
                    label={deckRowMenuLabel(action, l)}
                    onPress={() => onSelect(action)}
                    destructive={action === 'delete'}
                />
            ))}
        </MenuDialog>
    );
}
