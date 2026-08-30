// Pure row model for the preset picker inside app/deck-options.tsx. Anki collections imported
// from desktop routinely carry a preset per subject, so the picker renders through a FlatList
// rather than mapping the whole list into a fixed-height ScrollView.

export interface DeckPresetSource {
    id: number;
    name: string;
}

export interface DeckPresetRow {
    key: string;
    id: number;
    /** Falls back to a generated name; an imported preset can carry an empty one. */
    label: string;
    deckCount: number;
    active: boolean;
}

export interface DeckPresetRowsInput {
    presets: readonly DeckPresetSource[];
    activeId: number;
    /** How many decks use a preset, injected so this module stays free of the database. */
    deckCountFor: (presetId: number) => number;
    /** Names an unnamed preset, e.g. `(id) => \`Grup ${id}\``. */
    fallbackName: (presetId: number) => string;
}

export function buildDeckPresetRows(input: DeckPresetRowsInput): DeckPresetRow[] {
    return input.presets.map((preset) => ({
        key: String(preset.id),
        id: preset.id,
        label: preset.name.trim() || input.fallbackName(preset.id),
        deckCount: input.deckCountFor(preset.id),
        active: preset.id === input.activeId,
    }));
}
