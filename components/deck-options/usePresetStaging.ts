import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_DECK_CONFIG, uniqueId, type DeckConfig } from '../../lib/models';
import { deletePreset, getAllDeckConfigs, getDeckConfig, renamePreset, saveDeckConfig } from '../../lib/deckManager';

/**
 * Preset changes held until Save, as Anki's deck options screen holds them (`DeckOptionsState`
 * in ts/routes/deck-options/lib.ts, written by `update_deck_configs`): adding, cloning, renaming
 * and removing a preset change only what the screen shows, and leaving without saving undoes
 * all of them.
 */
interface Staged {
    added: Map<number, DeckConfig>;
    names: Map<number, string>;
    removed: Set<number>;
}

const empty = (): Staged => ({ added: new Map(), names: new Map(), removed: new Set() });

export function usePresetStaging() {
    const [staged, setStaged] = useState<Staged>(empty);

    /** A preset as the screen should show it: a staged one, or a stored one with its staged name. */
    const presetFor = useCallback((id: number): DeckConfig => {
        const base = staged.added.get(id) ?? getDeckConfig(id);
        const name = staged.names.get(id);
        return name === undefined ? base : { ...base, name };
    }, [staged]);

    /** Every preset the picker offers: stored ones not removed, then the ones added here. */
    const presets = useMemo((): DeckConfig[] => [
        ...getAllDeckConfigs().filter((config) => !staged.removed.has(config.id)).map((config) => presetFor(config.id)),
        ...staged.added.values(),
    ], [staged, presetFor]);

    const hasChanges = staged.added.size > 0 || staged.names.size > 0 || staged.removed.size > 0;

    /**
     * Stage a new preset: Add Preset starts from Anki's defaults, Clone Preset from `source`.
     * A copy never inherits catalog ownership or the package it came from.
     */
    const stageAdd = useCallback((name: string, source: DeckConfig | null): DeckConfig => {
        const base = source ?? DEFAULT_DECK_CONFIG;
        const { catalogPack: _catalogPack, sourcePackageId: _sourcePackageId, ...owned } = base;
        const preset: DeckConfig = {
            ...owned,
            id: uniqueId(),
            name: name.normalize('NFC').trim(),
            mod: Math.floor(Date.now() / 1000),
            usn: -1,
        };
        setStaged((current) => ({ ...current, added: new Map(current.added).set(preset.id, preset) }));
        return preset;
    }, []);

    const stageRename = useCallback((id: number, name: string) => {
        setStaged((current) => {
            const next = name.trim();
            const added = current.added.get(id);
            if (added) return { ...current, added: new Map(current.added).set(id, { ...added, name: next }) };
            return { ...current, names: new Map(current.names).set(id, next) };
        });
    }, []);

    const stageRemove = useCallback((id: number) => {
        if (id === DEFAULT_DECK_CONFIG.id) return;
        setStaged((current) => {
            if (current.added.has(id)) {
                const added = new Map(current.added);
                added.delete(id);
                return { ...current, added };
            }
            const names = new Map(current.names);
            names.delete(id);
            return { ...current, names, removed: new Set(current.removed).add(id) };
        });
    }, []);

    /**
     * Write the staged presets, renames and removals. The caller runs this inside its Save
     * transaction, before writing the selected preset's own values, so a deck can be assigned to
     * a preset added here. A removed preset hands its decks to the default one, as Anki does.
     */
    const commit = useCallback(() => {
        for (const preset of staged.added.values()) saveDeckConfig(preset);
        for (const [id, name] of staged.names) renamePreset(id, name);
        for (const id of staged.removed) deletePreset(id);
    }, [staged]);

    const reset = useCallback(() => setStaged(empty()), []);

    return { presetFor, presets, hasChanges, stageAdd, stageRename, stageRemove, commit, reset, removed: staged.removed };
}
