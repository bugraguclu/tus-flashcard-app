import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Spacing } from '../constants/theme';
import { useAppSettings } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { formatKeyLabel, KEY_ROWS } from './settings/KeyboardSettingsSection';
import { Badge } from './ui/Choice';
import { Section } from './ui/Card';
import { AppDialog } from './ui/Dialog';
import { ValueRow } from './ui/Rows';

type Shortcut = { keys: string; label: string };

/**
 * The web build's keyboard shortcuts in one list: the app-wide ones, moving through dialogs and
 * menus, and the study screen's keys as Settings › Keyboard has them.
 */
export default function KeyboardShortcutsDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { l } = useI18n();
    const { settings } = useAppSettings();
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
    const command = isMac ? 'Cmd' : 'Ctrl';

    const groups = useMemo<Array<{ label: string; rows: Shortcut[] }>>(() => [
        {
            label: l('Her yerde', 'Anywhere'),
            rows: [
                { keys: 'D', label: l('Desteler', 'Decks') },
                { keys: 'A', label: l('Kart ekle', 'Add cards') },
                { keys: 'B', label: l('Kartlarım (tarayıcı)', 'Browse cards') },
                { keys: 'T', label: l('İstatistikler', 'Statistics') },
                { keys: 'K', label: l('Kronometre', 'Stopwatch') },
                { keys: `${command} + ,`, label: l('Ayarlar', 'Settings') },
                { keys: '/', label: l('Ekrandaki aramaya git', 'Go to the search field') },
                { keys: '?', label: l('Bu listeyi göster', 'Show this list') },
            ],
        },
        {
            label: l('Gezinme', 'Moving around'),
            rows: [
                { keys: 'Tab / Shift + Tab', label: l('Sonraki / önceki denetim', 'Next / previous control') },
                { keys: 'Enter / Space', label: l('Seçili düğmeyi kullan', 'Use the focused button') },
                { keys: '↑ ↓', label: l('Menüde gezin', 'Move through a menu') },
                { keys: '← →', label: l('Sekmeler arasında geç', 'Switch between tabs') },
                { keys: 'Esc', label: l('Menüyü, pencereyi kapat', 'Close a menu or dialog') },
            ],
        },
        {
            label: l('Çalışma ekranı', 'Study screen'),
            rows: [
                ...KEY_ROWS.map((row) => ({ keys: formatKeyLabel(settings.keyBindings[row.field]), label: l(row.tr, row.en) })),
                { keys: `${command} + Z`, label: l('Geri al', 'Undo') },
                { keys: `${command} + 1…7`, label: l('Bayrak', 'Flag') },
                { keys: 'Esc', label: l('Destelere dön', 'Back to decks') },
            ],
        },
    ], [command, l, settings.keyBindings]);

    return (
        <AppDialog
            visible={visible}
            onClose={onClose}
            title={l('Klavye kısayolları', 'Keyboard shortcuts')}
            closeButton
            cardStyle={styles.card}
        >
            <ScrollView contentContainerStyle={styles.body}>
                {groups.map((group) => (
                    <Section key={group.label} label={group.label}>
                        {group.rows.map((row) => (
                            <ValueRow key={`${row.keys}-${row.label}`} label={row.label}>
                                <Badge label={row.keys} />
                            </ValueRow>
                        ))}
                    </Section>
                ))}
            </ScrollView>
        </AppDialog>
    );
}

const styles = StyleSheet.create({
    card: { maxWidth: 520 },
    body: { gap: Spacing.lg, paddingBottom: Spacing.xs },
});
