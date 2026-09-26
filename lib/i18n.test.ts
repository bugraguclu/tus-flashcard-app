import { describe, expect, it } from 'vitest';
import {
    localeTag,
    localizeCardTemplateName,
    localizeFieldName,
    localizeTopicName,
    resolveAppLocale,
    translate,
    translateActive,
} from './i18n';

describe('app locale resolution', () => {
    it('defaults active locale to Turkish', () => {
        expect(translateActive('common.ok')).toBe('Tamam');
    });
    it('follows Turkish system locales', () => {
        expect(resolveAppLocale('system', ['tr-TR'])).toBe('tr');
        expect(localeTag(resolveAppLocale('system', ['tr']))).toBe('tr-TR');
    });

    it('uses English for non-Turkish and unavailable system locales', () => {
        expect(resolveAppLocale('system', ['de-DE'])).toBe('en');
        expect(resolveAppLocale('system', [])).toBe('en');
    });

    it('lets an explicit preference override the device language', () => {
        expect(resolveAppLocale('en', ['tr-TR'])).toBe('en');
        expect(resolveAppLocale('tr', ['en-US'])).toBe('tr');
    });

    it('interpolates values without changing the selected language', () => {
        expect(translate('tr', 'settings.learnAheadOn', { minutes: 20 })).toContain('20');
        expect(translate('en', 'settings.learnAheadOn', { minutes: 20 })).toBe(
            'Learning cards due in less than 20 minutes are shown when no other cards remain.',
        );
    });

    it('keeps official Anki answer terminology in English', () => {
        expect(['anki.again', 'anki.hard', 'anki.good', 'anki.easy'].map((key) =>
            translate('en', key as 'anki.again' | 'anki.hard' | 'anki.good' | 'anki.easy'),
        )).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    });

    it('localizes standard field names and passes custom field names unchanged', () => {
        expect(localizeFieldName('tr', 'Front')).toBe('Ön');
        expect(localizeFieldName('tr', 'Back')).toBe('Arka');
        expect(localizeFieldName('tr', 'Text')).toBe('Metin');
        expect(localizeFieldName('tr', 'Back Extra')).toBe('Arka Ek');
        expect(localizeFieldName('tr', 'Add Reverse')).toBe('Tersini Ekle');
        expect(localizeFieldName('tr', 'Clinical Note')).toBe('Clinical Note');
        expect(localizeFieldName('en', 'Front')).toBe('Front');
    });

    it('localizes stock card template names and passes custom names unchanged', () => {
        expect(localizeCardTemplateName('tr', 'Card 1')).toBe('Kart 1');
        expect(localizeCardTemplateName('tr', 'Card 12')).toBe('Kart 12');
        expect(localizeCardTemplateName('tr', 'Card 1 reversed')).toBe('Card 1 reversed');
        expect(localizeCardTemplateName('tr', 'Tanım')).toBe('Tanım');
        expect(localizeCardTemplateName('en', 'Card 1')).toBe('Card 1');
    });

    it('translates only the untitled-topic sentinel', () => {
        expect(localizeTopicName('tr', 'General')).toBe('Genel');
        expect(localizeTopicName('tr', 'Kardiyoloji')).toBe('Kardiyoloji');
        expect(localizeTopicName('en', 'General')).toBe('General');
    });
});
