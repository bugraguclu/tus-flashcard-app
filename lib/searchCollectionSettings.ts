import { getDB } from './db';

const APP_SETTINGS_META_KEY = 'tus_app_settings_meta_v1';

interface CollectionSearchSettings {
    rolloverHour: number;
    learnAheadMinutes: number;
}

export function collectionSearchSettings(): CollectionSearchSettings {
    try {
        const row = getDB().getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            APP_SETTINGS_META_KEY,
        );
        const meta = row?.value ? JSON.parse(row.value) : null;
        const hour = Number(meta?.dayRolloverHour);
        const learnAhead = Number(meta?.learnAheadMinutes);
        return {
            rolloverHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
            learnAheadMinutes: Number.isFinite(learnAhead) && learnAhead > 0 ? learnAhead : 0,
        };
    } catch {
        return { rolloverHour: 4, learnAheadMinutes: 0 };
    }
}

