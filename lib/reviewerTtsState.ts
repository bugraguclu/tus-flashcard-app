import { getDbSetting, setDbSetting } from './storage';

const REVIEWER_TTS_ENABLED_KEY = 'tus_reviewer_tts_enabled_v1';

export function loadReviewerTtsEnabled(): boolean {
    return getDbSetting(REVIEWER_TTS_ENABLED_KEY) === 'true';
}

export function saveReviewerTtsEnabled(enabled: boolean): void {
    setDbSetting(REVIEWER_TTS_ENABLED_KEY, enabled ? 'true' : 'false');
}

