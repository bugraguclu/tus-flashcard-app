import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useI18n } from '../../hooks/useI18n';
import { deckRowMenuLabel, type DeckRowMenuAction } from '../../lib/deckRowMenu';
import { Card } from '../ui/Card';
import { MenuItem } from '../ui/Menu';
import { AppSheet } from '../ui/Sheet';

interface DeckRowMenuProps {
    visible: boolean;
    deckName: string;
    actions: DeckRowMenuAction[];
    onSelect: (action: DeckRowMenuAction) => void;
    onClose: () => void;
    /**
     * Runs once the sheet has been dismissed. iOS cannot present the route, dialog or sheet chosen
     * in it until then, so the deck list holds the chosen action back until this is called.
     */
    onDismissed: () => void;
    backdropLabel?: string;
}

/** A deck's ••• actions as an action sheet: the deck path as its title and one row per action. */
export default function DeckRowMenu({ visible, deckName, actions, onSelect, onClose, onDismissed, backdropLabel }: DeckRowMenuProps) {
    return (
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={deckName.replaceAll('::', ' › ')}
            backdropLabel={backdropLabel}
        >
            <DeckRowMenuRows actions={actions} onSelect={onSelect} />
            <DismissedSignal onDismissed={onDismissed} />
        </AppSheet>
    );
}

/**
 * Reports its own unmount. The sheet's content stays mounted until its modal is gone (on iOS
 * React Native keeps a closing modal's content until UIKit has dismissed it), so this is the
 * moment the sheet has left — `AppSheet` has no `onDismiss` of its own.
 */
function DismissedSignal({ onDismissed }: { onDismissed: () => void }) {
    const latest = useRef(onDismissed);
    latest.current = onDismissed;
    useEffect(() => () => latest.current(), []);
    return null;
}

/** Mounted afresh each time the sheet opens, so the scroll hint below is shown once per opening. */
function DeckRowMenuRows({ actions, onSelect }: { actions: DeckRowMenuAction[]; onSelect: (action: DeckRowMenuAction) => void }) {
    const { l } = useI18n();
    const scrollRef = useRef<ScrollView>(null);
    const heights = useRef({ viewport: 0, content: 0, flashed: false });

    // On a short phone the last rows sit below the fold. Flashing the indicator once says the list
    // goes on; a row cut off at the sheet's edge alone left "Delete deck" looking absent.
    const flashWhenScrollable = () => {
        const { viewport, content, flashed } = heights.current;
        if (flashed || viewport === 0 || content <= viewport + 1) return;
        heights.current.flashed = true;
        scrollRef.current?.flashScrollIndicators();
    };

    return (
        <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            onLayout={(event) => {
                heights.current.viewport = event.nativeEvent.layout.height;
                flashWhenScrollable();
            }}
            onContentSizeChange={(_, height) => {
                heights.current.content = height;
                flashWhenScrollable();
            }}
        >
            <Card divided>
                {actions.map((action) => (
                    <MenuItem
                        key={action}
                        label={deckRowMenuLabel(action, l)}
                        destructive={action === 'delete'}
                        onPress={() => onSelect(action)}
                    />
                ))}
            </Card>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    // Hug a short list; give way to the sheet's height limit when the rows run long.
    scroll: { flexGrow: 0 },
});
