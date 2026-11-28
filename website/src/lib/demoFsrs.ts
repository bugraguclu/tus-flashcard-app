import { DEFAULT_DECK_CONFIG } from '../../../lib/models';
import { DEFAULT_FSRS_PARAMETERS, FSRS_DEFAULT_DESIRED_RETENTION, fsrsNextStates } from '../../../lib/fsrs';
import { formatDays, formatLearningDelay, hardDelaySecs } from '../../../lib/schedulingIntervals';

// Nominal first-answer example, using the app's FSRS-6 defaults and 1/10-minute learning steps.
// No review history, parameter optimization or per-card fuzz is applied to this static demo.
const steps = DEFAULT_DECK_CONFIG.learningSteps;
const initial = fsrsNextStates(DEFAULT_FSRS_PARAMETERS, null, FSRS_DEFAULT_DESIRED_RETENTION, 0);
const noon = new Date(2026, 0, 1, 12).getTime();
const learningLabel = (minutes: number) => formatLearningDelay(minutes, noon, 4, 20);

export const INITIAL_FSRS_INTERVALS = {
  again: learningLabel(steps[0]),
  hard: learningLabel((hardDelaySecs(steps, 0) ?? 0) / 60),
  good: learningLabel(steps[1]),
  easy: formatDays(Math.round(initial.easy.interval)),
} as const;
