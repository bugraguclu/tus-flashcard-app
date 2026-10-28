import type { DuplicateResolution, MatchScope } from '../../lib/importNotes';
import { separatorChoiceForDelimiter } from '../../lib/importDelimited';
import type { ImportLogExtraLine } from '../ImportLogView';

export type UpdateChoice = 'ifNewer' | 'always' | 'never';

export type PackageSummary = {
    cardsImported?: number;
    progressCards?: number;
    progressReviews?: number;
    mediaImported?: number;
    mediaSkipped?: number;
    mediaRenamed?: number;
    withMedia?: number;
    structurePreserved?: boolean;
};

/** The import screen's labels for its choices, and the lines a package import adds to the Import Log. */
export function importCopy(l: (tr: string, en: string) => string) {
    const existingNotesLabel = (value: DuplicateResolution) => ({
        update: l('Güncelle', 'Update'),
        preserve: l('Koru', 'Preserve'),
        duplicate: l('Kopyala', 'Duplicate'),
    }[value]);

    const matchScopeLabel = (value: MatchScope) => ({
        notetype: l('Not türü', 'Note type'),
        notetypeAndDeck: l('Not türü ve deste', 'Note type and deck'),
    }[value]);

    const updateChoiceLabel = (value: UpdateChoice) => ({
        ifNewer: l('Yeniyse', 'If newer'),
        always: l('Her zaman', 'Always'),
        never: l('Asla', 'Never'),
    }[value]);

    const separatorLabel = (delimiter: string) => {
        const choice = separatorChoiceForDelimiter(delimiter);
        if (!choice) return l('Özel', 'Custom');
        return {
            comma: l('Virgül', 'Comma'),
            semicolon: l('Noktalı virgül', 'Semicolon'),
            tab: l('Sekme', 'Tab'),
            space: l('Boşluk', 'Space'),
            pipe: l('Dikey çizgi', 'Pipe'),
            colon: l('İki nokta', 'Colon'),
        }[choice];
    };

    const packageExtraLines = (summary: PackageSummary): ImportLogExtraLine[] => {
        const lines: ImportLogExtraLine[] = [];
        if (summary.cardsImported) {
            lines.push({ text: l(`${summary.cardsImported} kart eklendi.`, `${summary.cardsImported} cards added.`) });
        }
        if (summary.progressCards) {
            lines.push({ text: l(
                `${summary.progressCards} kart çalışma ilerlemesiyle geldi.`,
                `${summary.progressCards} cards arrived with learning progress.`,
            ) });
        }
        if (summary.progressReviews) {
            lines.push({ text: l(
                `${summary.progressReviews} tekrar kaydı geçmişe eklendi.`,
                `${summary.progressReviews} review entries were added to the history.`,
            ) });
        }
        if (summary.mediaImported) {
            lines.push({ text: l(
                `${summary.mediaImported} medya dosyası içe aktarıldı.`,
                `Imported ${summary.mediaImported} media files.`,
            ) });
        }
        if (summary.mediaRenamed) {
            lines.push({ text: l(
                `${summary.mediaRenamed} çakışan medya dosyası güvenli bir adla eklendi.`,
                `${summary.mediaRenamed} conflicting media files were added under safe new names.`,
            ) });
        }
        if (summary.mediaSkipped) {
            lines.push({ tone: 'warning', text: l(
                `${summary.mediaSkipped} medya dosyası atlandı (eksik veya çok büyük).`,
                `${summary.mediaSkipped} media files were skipped (missing or too large).`,
            ) });
        }
        if (summary.withMedia && !summary.mediaImported) {
            lines.push({ tone: 'warning', text: l(
                `${summary.withMedia} not medya kullanıyor; medya dosyaları içe aktarılamadı.`,
                `${summary.withMedia} notes reference media; the media files could not be imported.`,
            ) });
        }
        if (summary.structurePreserved === false) {
            lines.push({ tone: 'warning', text: l(
                'Paketin deste ve not türü bilgisi okunamadı; notlar basitleştirilmiş not türleriyle içe aktarıldı.',
                'The package\'s deck and note type data could not be read; notes were imported with simplified note types.',
            ) });
        }
        if (summary.structurePreserved) {
            lines.push({ text: l(
                'Deste yapısı, not türleri, alanlar, şablonlar ve CSS korundu.',
                'Deck structure, note types, fields, templates and CSS were retained.',
            ) });
        }
        return lines;
    };

    return { existingNotesLabel, matchScopeLabel, updateChoiceLabel, separatorLabel, packageExtraLines };
}
