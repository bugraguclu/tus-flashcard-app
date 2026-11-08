import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Spacing } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { MenuItem } from '../ui/Menu';
import { AppSheet } from '../ui/Sheet';

export interface SessionMenuItem {
    key: string;
    label: string;
    hint?: string;
    destructive?: boolean;
    onPress: () => void;
}

interface SessionActionsMenuProps {
    visible: boolean;
    title: string;
    items: SessionMenuItem[];
    onClose: () => void;
}

/** The action sheet a session's ••• button opens, on the Kronometre and in the calendar. */
export default function SessionActionsMenu({ visible, title, items, onClose }: SessionActionsMenuProps) {
    const { l } = useI18n();
    // The parent clears the session as the sheet closes; it slides away with what it showed.
    const shown = useRef({ title, items });
    if (visible) shown.current = { title, items };

    return (
        <AppSheet visible={visible} onClose={onClose} title={shown.current.title}>
            <Card divided>
                {shown.current.items.map((item) => (
                    <MenuItem
                        key={item.key}
                        label={item.label}
                        hint={item.hint}
                        destructive={item.destructive}
                        onPress={item.onPress}
                    />
                ))}
            </Card>
            <Button label={l('Kapat', 'Close')} variant="plain" onPress={onClose} style={styles.close} />
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    close: { marginTop: Spacing.sm },
});
