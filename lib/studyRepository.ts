/**
 * The study data API, re-exported from the modules that implement it:
 * studyQueue, filteredDeckQueue, studyAnswer, resetCards, browserRepository, studyCardRows and
 * studySearchSql. New code can import from those modules directly.
 */
export {
    getStudyQueue,
    getWaitingLearningCardIds,
    getStudyCardById,
    studyScopeSettings,
} from './studyQueue';
export type {
    QueueStats,
} from './studyQueue';
export {
    undoAnswer,
    answerStudyCard,
    setCardSuspended,
    setCardBuried,
} from './studyAnswer';
export {
    resetCardsToNew,
    getResetCardDefaults,
} from './resetCards';
export type { ResetCardOptions } from './resetCards';
export {
    resolveSettingsForDeck,
} from './studyCardRows';
export {
    getFilteredDeckCountCards,
    getFilteredDeckCardIds,
    getFilteredDeckMatchCount,
    getFilteredDeckGatherCount,
    getFilteredDeckExcludedCount,
} from './filteredDeckQueue';
export {
    getBrowserRowIdsMatchingText,
    getBrowserCardIdsMatchingText,
    getBrowserCards,
    getBrowserCardCount,
    getDeckTotalCardCount,
} from './browserRepository';
export type {
    BrowserCardSortKey,
    BrowserTableMode,
    BrowserCardQuery,
} from './browserRepository';
