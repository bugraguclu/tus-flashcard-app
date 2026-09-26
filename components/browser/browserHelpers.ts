import { localDayNumber, ymdToLocalDayNumber } from '../../lib/ankiState';
import type { CardState } from '../../lib/types';
import type { CardFlag } from '../../lib/models';
import type { BrowserCardSortKey, BrowserTableMode } from '../../lib/studyRepository';
import type { SupportedLocale } from '../../lib/i18n';
import { getDbSetting } from '../../lib/storage';

export const BROWSER_SORT_KEYS: BrowserCardSortKey[] = [
    'sortField',
    'cardType',
    'due',
    'deck',
    'created',
    'modified',
    'interval',
    'ease',
    'lapses',
    'reviews',
];

export function readBrowserBoolean(key: string, fallback: boolean): boolean {
    const stored = getDbSetting(key);
    if (stored == null) return fallback;
    return stored === '1';
}

export function readBrowserSortKey(): BrowserCardSortKey {
    const stored = getDbSetting('browser_sort_key') as BrowserCardSortKey | null;
    return stored && BROWSER_SORT_KEYS.includes(stored) ? stored : 'sortField';
}

export function readBrowserTableMode(): BrowserTableMode {
    return getDbSetting('browser_table_mode') === 'notes' ? 'notes' : 'cards';
}

export const BROWSER_PAGE_SIZE = 200;
export const ALL_CARD_FLAGS: CardFlag[] = [0, 1, 2, 3, 4, 5, 6, 7];

export function quoteAnkiSearchValue(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}

/** Compact "how long ago" label for the card list. */
export function formatLastReview(lastReviewedAtMs: number, locale: SupportedLocale): string {
    if (!lastReviewedAtMs) return locale === 'tr' ? 'Hiç çalışılmadı' : 'Never studied';

    const elapsedMs = Date.now() - lastReviewedAtMs;
    if (elapsedMs < 60_000) return locale === 'tr' ? 'Az önce' : 'Just now';
    if (elapsedMs < 3_600_000) return locale === 'tr' ? `${Math.floor(elapsedMs / 60_000)} dk. önce` : `${Math.floor(elapsedMs / 60_000)}m ago`;
    if (elapsedMs < 86_400_000) return locale === 'tr' ? `${Math.floor(elapsedMs / 3_600_000)} sa. önce` : `${Math.floor(elapsedMs / 3_600_000)}h ago`;

    const days = Math.floor(elapsedMs / 86_400_000);
    if (days < 30) return locale === 'tr' ? `${days} gün önce` : `${days}d ago`;

    const date = new Date(lastReviewedAtMs);
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

/** Compact "when is it due" label from the scheduling state. */
export function formatNextDue(state: CardState, rolloverHour: number, locale: SupportedLocale): string {
    if (state.suspended) return locale === 'tr' ? 'Askıda' : 'Suspended';
    if (state.buried) return locale === 'tr' ? 'Gömülü (yarına kadar)' : 'Buried (until tomorrow)';
    if (state.status === 'new') return locale === 'tr' ? 'Sırada (yeni)' : 'Queued (new)';

    if (state.status === 'learning' && state.dueTime > 0) {
        const remainingMs = state.dueTime - Date.now();
        if (remainingMs <= 0) return locale === 'tr' ? 'Şimdi' : 'Now';
        if (remainingMs < 3_600_000) return locale === 'tr' ? `${Math.max(1, Math.ceil(remainingMs / 60_000))} dk. sonra` : `in ${Math.max(1, Math.ceil(remainingMs / 60_000))}m`;
        return locale === 'tr' ? `${Math.ceil(remainingMs / 3_600_000)} sa. sonra` : `in ${Math.ceil(remainingMs / 3_600_000)}h`;
    }

    const today = localDayNumber(Date.now(), rolloverHour);
    const dueDay = ymdToLocalDayNumber(state.dueDate, today, rolloverHour);
    const diff = dueDay - today;
    if (diff <= 0) return locale === 'tr' ? 'Bugün' : 'Today';
    if (diff === 1) return locale === 'tr' ? 'Yarın' : 'Tomorrow';
    if (diff < 30) return locale === 'tr' ? `${diff} gün sonra` : `in ${diff} days`;
    if (diff < 365) return locale === 'tr' ? `${Math.round(diff / 30)} ay sonra` : `in ${Math.round(diff / 30)} months`;
    return locale === 'tr' ? `${(diff / 365).toFixed(1)} yıl sonra` : `in ${(diff / 365).toFixed(1)} years`;
}
