import React, { useRef } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import type { useI18n } from '../../hooks/useI18n';
import { useModalHandoff } from '../../hooks/useModalHandoff';
import { getAllDeckConfigs, getDecksUsingConfig, presetDisplayName } from '../../lib/deckManager';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Card';
import { AppDialog } from '../ui/Dialog';
import { TextField } from '../ui/Fields';
import { MenuItem, PopoverMenu } from '../ui/Menu';
import { ListRow } from '../ui/Rows';
import { Type } from '../ui/tokens';
import type { DeckConfig } from '../../lib/models';

type I18n = Pick<ReturnType<typeof useI18n>, 'l' | 't'>;

/** One row of the preset menu; the screen decides what each row does. */
export interface PresetAction {
    label: string;
    action: () => void;
    destructive?: boolean;
}

/**
 * The actions on the current preset: add, clone, rename, restore defaults, save to all subdecks,
 * remove. iOS drops an alert or a second modal presented while this menu is still dismissing, so
 * there the chosen action runs from `onDismiss`, once the menu has gone. The menu hands off
 * (`useModalHandoff`), so that is the next frame rather than after its shrink.
 */
export function PresetActionsMenu({ visible, actions, onClose, anchor, accessibilityLabel }: {
    visible: boolean;
    actions: PresetAction[];
    onClose: () => void;
    /** Where the menu hangs, under the ••• button that opened it (see `PopoverMenu`). */
    anchor?: { top?: number; right?: number };
    accessibilityLabel?: string;
}) {
    const pending = useRef<(() => void) | null>(null);
    const handoff = useModalHandoff(visible);
    const runPending = () => {
        const action = pending.current;
        pending.current = null;
        action?.();
    };
    const choose = (action: () => void) => {
        if (Platform.OS === 'ios') {
            pending.current = action;
            handoff.handOff(onClose);
            return;
        }
        onClose();
        action();
    };
    return (
        <PopoverMenu
            visible={visible}
            onClose={onClose}
            onDismiss={runPending}
            closeAtOnce={handoff.closeAtOnce}
            anchor={anchor}
            accessibilityLabel={accessibilityLabel}
        >
            {actions.map((item) => (
                <MenuItem
                    key={item.label}
                    label={item.label}
                    onPress={() => choose(item.action)}
                    destructive={item.destructive}
                />
            ))}
        </PopoverMenu>
    );
}

/** Every preset in the collection, with how many decks use it and one of them by name. */
export function PresetPickerModal({ presets, activePresetId, currentDeckId, hiddenPresetIds = [], onPick, onClose, l, t }: I18n & {
    /** The presets as the screen shows them, staged additions and renames included. */
    presets?: DeckConfig[];
    activePresetId: number;
    /** The deck being edited: it counts for the active preset, which Save assigns it to. */
    currentDeckId?: number;
    /** Presets removed in this unsaved session. */
    hiddenPresetIds?: number[];
    onPick: (presetId: number) => void;
    onClose: () => void;
}) {
    const shown = (presets ?? getAllDeckConfigs()).filter((preset) => !hiddenPresetIds.includes(preset.id));
    return (
        <AppDialog
            visible
            onClose={onClose}
            title={l('Ayar grubu seç', 'Choose Preset')}
            closeLabel={l('Ayar grubu seçiciyi kapat', 'Close preset picker')}
            actions={<Button label={t('common.cancel')} variant="plain" tone="muted" onPress={onClose} />}
        >
            <ScrollView style={styles.list} accessibilityRole="radiogroup">
                {shown.map((preset, index) => {
                    const presetDecks = getDecksUsingConfig(preset.id).filter((deck) => deck.id !== currentDeckId);
                    const used = presetDecks.length + (currentDeckId !== undefined && preset.id === activePresetId ? 1 : 0);
                    const representative = presetDecks[0];
                    return (
                        <React.Fragment key={preset.id}>
                            {index > 0 ? <Divider /> : null}
                            <ListRow
                                title={presetDisplayName(preset, l)}
                                summary={representative ? representative.name.replaceAll('::', ' › ') : undefined}
                                value={l(`${used} deste`, `${used} decks`)}
                                selected={preset.id === activePresetId}
                                onPress={() => onPick(preset.id)}
                                style={styles.row}
                            />
                        </React.Fragment>
                    );
                })}
            </ScrollView>
        </AppDialog>
    );
}

/** The preset's name, asked the way the deck list asks for a deck's: a field, Cancel and Save. */
export function RenamePresetModal({ title, value, onChangeValue, onSave, onClose, l, t }: I18n & {
    /** Defaults to the rename title; Add Preset reuses the dialog to ask for a name. */
    title?: string;
    value: string;
    onChangeValue: (value: string) => void;
    onSave: () => void;
    onClose: () => void;
}) {
    const colors = useThemeColors();
    const fieldLabel = l('Ayar grubu adı', 'Preset name');
    return (
        <AppDialog
            visible
            onClose={onClose}
            title={title ?? l('Ayar grubunu yeniden adlandır', 'Rename Preset')}
            closeLabel={l('Yeniden adlandırma penceresini kapat', 'Close rename dialog')}
            actions={(
                <>
                    <Button label={t('common.cancel')} variant="plain" onPress={onClose} />
                    <Button label={t('common.save')} onPress={onSave} />
                </>
            )}
        >
            <View style={styles.field}>
                <Text style={[Type.caption, styles.fieldLabel, { color: colors.textSecondary }]}>{fieldLabel}</Text>
                {/* Return saves, as Anki's name prompt does on Enter. */}
                <TextField
                    value={value}
                    onChangeText={onChangeValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={onSave}
                    accessibilityLabel={fieldLabel}
                />
            </View>
        </AppDialog>
    );
}

const styles = StyleSheet.create({
    list: { flexShrink: 1 },
    // A row set in a dialog lines up with the dialog's title, not a card's inset.
    row: { paddingHorizontal: 0 },
    // The deck dialogs' name field: its label sits above it.
    field: { gap: Spacing.xs },
    fieldLabel: { fontWeight: '500' },
});
