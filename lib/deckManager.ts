/**
 * The deck API, re-exported from the modules that implement it: deckStore, deckPresets,
 * deckLimits, filteredDecks and deckTree. New code can import from those modules directly.
 */
export {
    getAllDecks,
    getDeck,
    getDeckByName,
    getAvailableDeckName,
    getAvailableDeckSubtreeName,
    saveDeck,
    initializeDeckDisclosureDefaults,
    deleteDeck,
    renameDeck,
    createDeck,
    setDeckDescription,
    moveDeckUnder,
    reorderDeckRelative,
    setDeckCollapsed,
    getBuriedCountForDeck,
    unburyDeck,
    getCardCountsByDeck,
} from './deckStore';
export {
    createFilteredDeck,
    updateFilteredDeck,
    emptyFilteredDeck,
    rebuildFilteredDeck,
    completeFilteredCard,
    restoreFilteredCard,
    CUSTOM_STUDY_PREFIX,
    getCustomStudyDefaults,
    rememberCustomStudyExtend,
    rememberCustomStudyTags,
    createOrReplaceCustomStudySession,
} from './filteredDecks';
export type {
    FilteredDeckOptions,
} from './filteredDecks';
export {
    getDirectDecksForScope,
    getPopulatedDecksForScope,
    buildDeckTree,
    flattenDeckTree,
} from './deckTree';
export type {
    DeckTreeNode,
} from './deckTree';
export {
    getAllDeckConfigs,
    getDeckConfig,
    saveDeckConfig,
    getDecksUsingConfig,
    createPreset,
    renamePreset,
    restoreDeckConfigDefaults,
    deletePreset,
    assignDeckConfig,
    applyConfigToSubdecks,
} from './deckPresets';
export {
    getDeckConfigForDeck,
    getDeckTodayBoost,
    addDeckTodayBoost,
    extendDeckTodayLimits,
    getDeckTodayLimits,
    setDeckTodayLimits,
    setDeckLimitOverrides,
    setDeckLimits,
} from './deckLimits';
