import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, type ColorScheme } from '../constants/theme';
import {
    IMPORT_LOG_STATUSES,
    importLogFailureCount,
    MAX_LOGGED_ROWS_PER_STATUS,
    type ImportLog,
    type ImportNoteStatus,
} from '../lib/importLog';

export interface ImportLogExtraLine {
    /** Already-localized sentence, e.g. "12 medya dosyası içe aktarıldı." */
    text: string;
    tone?: 'info' | 'warning';
}

interface ImportLogViewProps {
    log: ImportLog;
    colors: ColorScheme;
    /** Locale switch shared with the rest of the app. */
    l: (turkish: string, english: string) => string;
    /** Package-only figures (cards, media) Anki lists alongside the note summary. */
    extraLines?: ImportLogExtraLine[];
}

/** The heading Anki gives each group of notes on its Import Log screen. */
function statusHeading(status: ImportNoteStatus, l: ImportLogViewProps['l']): string {
    switch (status) {
        case 'added':
            return l('Eklenen notlar', 'Notes added');
        case 'updated':
            return l('Güncellenen notlar', 'Notes updated');
        case 'duplicate':
            return l('Zaten mevcut olanlar', 'Already present');
        case 'firstFieldMatch':
            return l('İlk alanı eşleşenler', 'First field matched');
        case 'conflicting':
            return l('Not türü değişmiş olanlar', 'Note type changed');
        case 'missingNotetype':
            return l('Not türü bulunamayanlar', 'Note type missing');
        case 'missingDeck':
            return l('Destesi bulunamayanlar', 'Deck missing');
        case 'emptyFirstField':
            return l('İlk alanı boş olanlar', 'First field empty');
    }
}

/** The per-note explanation Anki shows in the log's Status column. */
function statusDetail(status: ImportNoteStatus, l: ImportLogViewProps['l']): string {
    switch (status) {
        case 'added':
            return l('Yeni not eklendi', 'New note added');
        case 'updated':
            return l('Not güncellendi; dosyadaki sürüm farklıydı', 'Note updated, file had a different version');
        case 'duplicate':
            return l('Not atlandı; koleksiyonda güncel kopyası var', 'Note skipped, up-to-date copy in collection');
        case 'firstFieldMatch':
            return l('İlk alan mevcut bir notla eşleşti', 'First field matched an existing note');
        case 'conflicting':
            return l('Not güncellenmedi; not türü değişmiş', 'Note not updated, note type has changed');
        case 'missingNotetype':
            return l('Not atlandı; not türü bulunamadı', 'Note skipped, note type missing');
        case 'missingDeck':
            return l('Not atlandı; deste bulunamadı', 'Note skipped, deck missing');
        case 'emptyFirstField':
            return l('Not atlandı; ilk alan boş', 'Note skipped, first field empty');
    }
}

function statusTone(status: ImportNoteStatus): 'good' | 'neutral' | 'bad' {
    if (status === 'added' || status === 'updated') return 'good';
    if (status === 'conflicting' || status === 'missingNotetype' || status === 'missingDeck' || status === 'emptyFirstField') {
        return 'bad';
    }
    return 'neutral';
}

/**
 * Anki's Import Log: the summary sentences first, then one expandable group per outcome so a
 * learner can see exactly which notes did not land and why. Counts are always exact; the rows
 * inside a group are a bounded sample (`MAX_LOGGED_ROWS_PER_STATUS`).
 */
export default function ImportLogView({ log, colors, l, extraLines = [] }: ImportLogViewProps) {
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [expanded, setExpanded] = useState<Set<ImportNoteStatus>>(() => new Set());
    const { counts } = log;
    const failed = importLogFailureCount(counts);

    const summary: string[] = [];
    if (log.found === 0) summary.push(l('Dosyada not bulunamadı.', 'No notes found in file.'));
    if (counts.added) summary.push(l(`${counts.added} yeni not içe aktarıldı.`, `${counts.added} new notes imported.`));
    if (counts.firstFieldMatch) {
        summary.push(l(
            `${counts.firstFieldMatch} notun ilk alanı mevcut bir notla eşleşti.`,
            `${counts.firstFieldMatch} notes had a first field matching an existing note.`,
        ));
    }
    if (counts.updated) {
        summary.push(l(
            `${counts.updated} not mevcut notları güncellemek için kullanıldı.`,
            `${counts.updated} notes used to update existing ones.`,
        ));
    }
    if (counts.duplicate) {
        summary.push(l(
            `${counts.duplicate} not zaten koleksiyonda mevcut.`,
            `${counts.duplicate} notes already present in collection.`,
        ));
    }
    if (counts.conflicting) {
        summary.push(l(
            `${counts.conflicting} not içe aktarılmadı; not türü değişmiş.`,
            `${counts.conflicting} notes not imported, note type has changed.`,
        ));
    }
    if (failed) summary.push(l(`${failed} not içe aktarılamadı.`, `${failed} notes could not be imported.`));

    const toggle = (status: ImportNoteStatus) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(status)) next.delete(status);
            else next.add(status);
            return next;
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{l('İçe aktarma günlüğü', 'Import Log')}</Text>
            <Text style={styles.found}>
                {l(`Dosyada ${log.found} not bulundu.`, `${log.found} notes found in file.`)}
            </Text>

            <View style={styles.summaryBlock}>
                {summary.map((line) => (
                    <Text key={line} style={styles.summaryLine}>{line}</Text>
                ))}
                {extraLines.map((line) => (
                    <Text
                        key={line.text}
                        style={[styles.summaryLine, line.tone === 'warning' && styles.summaryWarning]}
                    >
                        {line.text}
                    </Text>
                ))}
            </View>

            {IMPORT_LOG_STATUSES.filter((status) => counts[status] > 0).map((status) => {
                const rows = log.entries.filter((entry) => entry.status === status);
                const isOpen = expanded.has(status);
                const tone = statusTone(status);
                return (
                    <View key={status} style={styles.group}>
                        <TouchableOpacity
                            style={styles.groupHeader}
                            onPress={() => toggle(status)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: isOpen }}
                            accessibilityLabel={`${statusHeading(status, l)}: ${counts[status]}`}
                        >
                            <View
                                style={[
                                    styles.groupDot,
                                    tone === 'good' && styles.groupDotGood,
                                    tone === 'bad' && styles.groupDotBad,
                                ]}
                            />
                            <Text style={styles.groupTitle} numberOfLines={1}>{statusHeading(status, l)}</Text>
                            <Text style={styles.groupCount}>{counts[status]}</Text>
                            <Text style={styles.groupToggle}>{isOpen ? l('Gizle', 'Hide') : l('Göster', 'Show')}</Text>
                        </TouchableOpacity>
                        {isOpen ? (
                            <View style={styles.groupBody}>
                                <Text style={styles.groupDetail}>{statusDetail(status, l)}</Text>
                                {rows.map((entry, index) => (
                                    <View key={`${status}-${index}`} style={styles.entryRow}>
                                        <Text style={styles.entryText} numberOfLines={2}>
                                            {entry.fields.filter(Boolean).join(' · ') || l('(boş)', '(empty)')}
                                        </Text>
                                    </View>
                                ))}
                                {counts[status] > rows.length ? (
                                    <Text style={styles.entryMore}>
                                        {l(
                                            `… ve ${counts[status] - rows.length} not daha (ilk ${MAX_LOGGED_ROWS_PER_STATUS} tanesi listelendi).`,
                                            `… and ${counts[status] - rows.length} more (the first ${MAX_LOGGED_ROWS_PER_STATUS} are listed).`,
                                        )}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: {
            gap: Spacing.sm,
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        title: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary },
        found: { fontSize: FontSize.sm, color: colors.textMuted },
        summaryBlock: { gap: 4, marginTop: 2 },
        summaryLine: { fontSize: FontSize.md, lineHeight: 21, color: colors.textPrimary },
        summaryWarning: { color: colors.btnHard },
        group: {
            borderRadius: BorderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            overflow: 'hidden',
        },
        groupHeader: {
            minHeight: 46,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.bgSecondary,
        },
        groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
        groupDotGood: { backgroundColor: colors.btnGood },
        groupDotBad: { backgroundColor: colors.btnAgain },
        groupTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        groupCount: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
        groupToggle: { fontSize: FontSize.xs, fontWeight: '700', color: colors.accent },
        groupBody: { padding: Spacing.md, gap: 6 },
        groupDetail: { fontSize: FontSize.xs, color: colors.textMuted, marginBottom: 2 },
        entryRow: {
            paddingVertical: 6,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        entryText: { fontSize: FontSize.sm, color: colors.textSecondary, lineHeight: 18 },
        entryMore: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 4 },
    });
}
