import { Platform, View, type GestureResponderHandlers, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../../hooks/useI18n';

interface DeckDragHandleProps {
    /** The deck's own name, as its row shows it. */
    displayName: string;
    /** The drag gesture on the row's handle. */
    panHandlers: GestureResponderHandlers;
    /** Moves the deck one place among its siblings without dragging. */
    onStep: (direction: 'up' | 'down') => void;
    style: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

/**
 * The handle a deck row is dragged by. Dragging needs a pointer, so the same handle also moves the
 * deck one place at a time: VoiceOver's Move up and Move down actions on iPhone, and the Up and
 * Down keys while it has focus on the web.
 */
export default function DeckDragHandle({ displayName, panHandlers, onStep, style, children }: DeckDragHandleProps) {
    const { l } = useI18n();
    return (
        <View
            style={style}
            {...panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel={l(`${displayName} destesini taşı`, `Move ${displayName} deck`)}
            accessibilityHint={l(
                'Satırın üstüne veya altına bırakarak sıralayın; ortasına bırakarak alt deste yapın',
                'Drop at a row edge to reorder, or at its center to make a subdeck',
            )}
            accessibilityActions={[
                { name: 'moveUp', label: l('Yukarı taşı', 'Move up') },
                { name: 'moveDown', label: l('Aşağı taşı', 'Move down') },
            ]}
            onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'moveUp') onStep('up');
                else if (event.nativeEvent.actionName === 'moveDown') onStep('down');
            }}
            // react-native-web hands a focused view its key events; screen readers announce the keys
            // from `aria-keyshortcuts` (it drops a `title`).
            {...(Platform.OS === 'web'
                ? {
                    'aria-keyshortcuts': 'ArrowUp ArrowDown',
                    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                        event.preventDefault();
                        onStep(event.key === 'ArrowUp' ? 'up' : 'down');
                    },
                }
                : {}) as object}
        >
            {children}
        </View>
    );
}
