/**
 * The times printed on the answer buttons, in the interface language.
 *
 * The schedulers produce their spans in one fixed form (`formatDays`/`formatMinutes`); this is
 * the reviewer's last step before drawing them, so an English interface reads "10m · 1d · 1.5mo"
 * instead of the Turkish units.
 */
import type { IntervalPreview } from './types';
import { formatMinutes, localizeIntervalLabel } from './schedulingIntervals';

export type ButtonTimes = Pick<IntervalPreview, 'again' | 'hard' | 'good' | 'easy'>;

export function localizeButtonTimes(times: ButtonTimes, locale: string): ButtonTimes {
    return {
        again: localizeIntervalLabel(times.again, locale),
        hard: localizeIntervalLabel(times.hard, locale),
        good: localizeIntervalLabel(times.good, locale),
        easy: localizeIntervalLabel(times.easy, locale),
    };
}

/**
 * A preview (no-rescheduling) deck's delay. A button whose delay is zero takes the card out of
 * the preview, which Anki labels "(end)" rather than with a time.
 */
export function formatPreviewDelay(seconds: number, locale: string): string {
    if (seconds <= 0) return locale === 'tr' ? '(bitiş)' : '(end)';
    const label = seconds < 60 ? `${Math.round(seconds)}sn` : formatMinutes(seconds / 60);
    return localizeIntervalLabel(label, locale);
}
