import { Fragment, useRef } from 'react';
import { Platform, ScrollView } from 'react-native';
import type { useI18n } from '../../hooks/useI18n';
import { getAllDeckConfigs, getDecksUsingConfig } from '../../lib/deckManager';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Card';
import { AppDialog } from '../ui/Dialog';
import { TextField } from '../ui/Fields';
import { MenuItem, PopoverMenu } from '../ui/Menu';
import type { DeckOptionsStyles } from './deckOptionsStyles';
import { PickerOption } from './SettingControls';
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
 * there the chosen action runs from `onDismiss`, once the menu has gone.
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
    const runPending = () => {
        const action = pending.current;
        pending.current = null;
        action?.();
    };
    const choose = (action: () => void) => {
        if (Platform.OS === 'ios') {
            pending.current = action;
            onClose();
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
export function PresetPickerModal({ presets, activePresetId, currentDeckId, hiddenPresetIds = [], onPick, onClose, styles, l, t }: I18n & {
    /** The presets as the screen shows them, staged additions and renames included. */
    presets?: DeckConfig[];
    activePresetId: number;
    /** The deck being edited: it counts for the active preset, which Save assigns it to. */
    currentDeckId?: number;
    /** Presets removed in this unsaved session. */
    hiddenPresetIds?: number[];
    onPick: (presetId: number) => void;
    onClose: () => void;
    styles: DeckOptionsStyles;
}) {
    const shown = (presets ?? getAllDeckConfigs()).filter((preset) => !hiddenPresetIds.includes(preset.id));
    return (
        <AppDialog
            visible
            onClose={onClose}
            title={l('Ayar grubu seç', 'Choose Preset')}
            actions={<Button variant="plain" label={t('common.cancel')} onPress={onClose} />}
        >
            <ScrollView style={styles.presetList}>
                {shown.map((preset, index) => {
                    const presetDecks = getDecksUsingConfig(preset.id).filter((deck) => deck.id !== currentDeckId);
                    const used = presetDecks.length + (currentDeckId !== undefined && preset.id === activePresetId ? 1 : 0);
                    const representative = presetDecks[0];
                    return (
                        <Fragment key={preset.id}>
                            {index > 0 ? <Divider /> : null}
                            <PickerOption
                                label={`${preset.name} · ${l(`${used} deste`, `${used} decks`)}`}
                                meta={representative ? representative.name.replaceAll('::', ' › ') : undefined}
                                selected={preset.id === activePresetId}
                                onPress={() => onPick(preset.id)}
                                styles={styles}
                            />
                        </Fragment>
                    );
                })}
            </ScrollView>
        </AppDialog>
    );
}

export function RenamePresetModal({ title, value, onChangeValue, onSave, onClose, l, t }: I18n & {
    /** Defaults to the rename title; Add Preset reuses the dialog to ask for a name. */
    title?: string;
    value: string;
    onChangeValue: (value: string) => void;
    onSave: () => void;
    onClose: () => void;
}) {
    return (
        <AppDialog
            visible
            onClose={onClose}
            title={title ?? l('Ayar grubunu yeniden adlandır', 'Rename Preset')}
            actions={(
                <>
                    <Button variant="plain" label={t('common.cancel')} onPress={onClose} />
                    <Button label={t('common.save')} onPress={onSave} />
                </>
            )}
        >
            {/* Return saves, as Anki's name prompt does on Enter. */}
            <TextField
                value={value}
                onChangeText={onChangeValue}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={onSave}
                accessibilityLabel={l('Ayar grubu adı', 'Preset name')}
            />
        </AppDialog>
    );
}
