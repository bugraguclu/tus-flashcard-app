import { useCallback, useEffect, useMemo } from 'react';
import { useLocales } from 'expo-localization';
import { useLanguagePreference } from '../contexts/AppContext';
import {
    localeTag,
    resolveAppLocale,
    setActiveLocale,
    translate,
    type TranslationKey,
    type TranslationParams,
} from '../lib/i18n';

function useDeviceLanguageCodes() {
    const deviceLocales = useLocales();
    return useMemo(() => deviceLocales.map((item) => item.languageCode), [deviceLocales]);
}

/** Used by startup/error surfaces that render before persisted settings are available. */
export function useSystemI18n() {
    const deviceLanguageCodes = useDeviceLanguageCodes();
    const locale = resolveAppLocale('system', deviceLanguageCodes);
    const t = useCallback(
        (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
        [locale],
    );
    const l = useCallback((turkish: string, english: string) => (locale === 'tr' ? turkish : english), [locale]);
    return { t, l, locale, localeTag: localeTag(locale) };
}

export function useI18n() {
    const languagePreference = useLanguagePreference();
    const deviceLanguageCodes = useDeviceLanguageCodes();
    const locale = resolveAppLocale(languagePreference, deviceLanguageCodes);

    useEffect(() => {
        setActiveLocale(locale);
    }, [locale]);

    const t = useCallback(
        (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
        [locale],
    );
    const l = useCallback((turkish: string, english: string) => (locale === 'tr' ? turkish : english), [locale]);

    return {
        t,
        l,
        locale,
        localeTag: localeTag(locale),
        preference: languagePreference,
        deviceLanguage: resolveAppLocale('system', deviceLanguageCodes),
    };
}
