import type { ExternalLinkRejection } from './externalLinking';
import { localizeFieldName, type SupportedLocale } from './i18n';

/**
 * What the learner is told when an automation link (`tusankim://x-callback-url/…`, or the web
 * site's `/x-callback-url?action=…`) cannot be carried out: what was wrong and how to write it.
 * The wording follows the drafted `help.automation.ignored` copy in
 * docs/user-guide/in-app/08-settings.md.
 */
export function externalLinkRejectionText(
    locale: SupportedLocale,
    rejection: ExternalLinkRejection,
): { title: string; message: string } {
    const l = (tr: string, en: string) => (locale === 'tr' ? tr : en);
    const title = l('Bağlantı açılamadı', 'Couldn’t open the link');
    switch (rejection.reason) {
        case 'tooLong':
            return { title, message: l('Bağlantı çok uzun: en fazla 32 KB olabilir.', 'The link is too long: it can be at most 32 KB.') };
        case 'unknownAction':
            return {
                title,
                message: rejection.action
                    ? l(`“${rejection.action}” işlemi desteklenmiyor. Desteklenen işlemler: addnote ve search.`, `The “${rejection.action}” action isn’t supported. The supported actions are addnote and search.`)
                    : l('Bağlantı bir işlem belirtmiyor. Desteklenen işlemler: addnote ve search.', 'The link names no action. The supported actions are addnote and search.'),
            };
        case 'missingQuery':
            return { title, message: l('Arama bağlantısında query değeri yok.', 'The search link has no query.') };
        case 'missingType':
            return { title, message: l('Bağlantıda not türü (type) yok.', 'The link names no note type (type).') };
        case 'missingDeck':
            return { title, message: l('Bağlantıda deste (deck) yok.', 'The link names no deck (deck).') };
        case 'missingFields':
            return {
                title,
                message: l('Bağlantıda alan yok: fld ile başlayan en az bir değer gerekir, örneğin fldFront.', 'The link has no field: it needs at least one value starting with fld, for example fldFront.'),
            };
        case 'noteTypeNotFound':
            return {
                title,
                message: l(
                    `“${rejection.noteTypeName}” not türü bulunamadı. Adı kontrol edin; hazır not türlerinde İngilizce adı da kullanabilirsiniz (örneğin Basic, Cloze).`,
                    `The note type “${rejection.noteTypeName}” could not be found. Check the name; built-in note types also take their English name (for example Basic, Cloze).`,
                ),
            };
        case 'deckNotFound':
            return {
                title,
                message: l(
                    `“${rejection.deckName}” destesi bulunamadı. Adı kontrol edin; alt deste için :: kullanın.`,
                    `The deck “${rejection.deckName}” could not be found. Check the name; use :: for a subdeck.`,
                ),
            };
        case 'filteredDeck':
            return {
                title,
                message: l(`“${rejection.deckName}” filtreli bir deste; notlar oraya eklenemez.`, `“${rejection.deckName}” is a filtered deck, so notes can’t be added to it.`),
            };
        case 'catalogDeck':
            return {
                title,
                message: l(
                    `“${rejection.deckName}” TUS kataloğunun destesi; bağlantıyla oraya not eklenemez. Kendi destelerinizden birini yazın.`,
                    `“${rejection.deckName}” is a TUS catalog deck, so a link can’t add notes to it. Name one of your own decks.`,
                ),
            };
        case 'noMatchingFields': {
            const names = rejection.fieldNames.map((name) => {
                const label = localizeFieldName(locale, name);
                return label === name ? name : `${name} (${label})`;
            }).join(', ');
            const first = rejection.fieldNames[0] ?? 'Front';
            return {
                title,
                message: l(
                    `Bağlantıdaki alanların hiçbiri “${rejection.noteTypeName}” not türünde yok. Bu türün alanları: ${names}. Alanın adını fld’nin arkasına yazın, örneğin fld${first}.`,
                    `None of the link’s fields are in the note type “${rejection.noteTypeName}”. Its fields are: ${names}. Write a field’s name after fld, for example fld${first}.`,
                ),
            };
        }
    }
}
