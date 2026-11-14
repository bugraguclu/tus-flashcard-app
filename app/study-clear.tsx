import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
import { DateField } from '../components/stopwatch/StudyToolControls';
import { Button } from '../components/ui/Button';
import { Section } from '../components/ui/Card';
import { Notice } from '../components/ui/Feedback';
import { ValueRow } from '../components/ui/Rows';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { goBackOr } from '../lib/backNavigation';
import { alert, confirm } from '../lib/confirm';
import { formatStudyTotal, type StudySessionRecord } from '../lib/stopwatch';
import {
    clearStudySessions,
    loadClearedStudySessions,
    restoreClearedStudySessions,
    studySessionsStartedBetween,
} from '../lib/stopwatchStore';
import { studyDayYmd } from '../lib/studyAnalysis';
import { ymdToLocalDate } from '../lib/studyPlans';

const PREVIEW_LIMIT = 200;

/**
 * "Çalışmaları Temizle": remove the Kronometre sessions of a date range at once. The screen shows
 * what will go before anything is removed, asks once more, and keeps every removed session until
 * the learner restores it — also across launches and later clears. Card reviews, plans and the
 * running stopwatch are never touched.
 */
export default function StudyClearScreen() {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { settings } = useAppSettings();
    const rolloverHour = settings.dayRolloverHour;
    const { collectionVersion, invalidateCollection } = useCollectionInvalidation();
    const todayYmd = studyDayYmd(Date.now(), rolloverHour);
    const [fromYmd, setFromYmd] = useState(todayYmd);
    const [throughYmd, setThroughYmd] = useState(todayYmd);
    const [revision, setRevision] = useState(0);

    useFocusEffect(useCallback(() => setRevision((value) => value + 1), []));

    const valid = throughYmd >= fromYmd;
    const matching = useMemo<StudySessionRecord[]>(() => {
        if (!valid) return [];
        try {
            return studySessionsStartedBetween(fromYmd, throughYmd, rolloverHour);
        } catch (error) {
            console.warn('[StudyClear] read failed:', error);
            return [];
        }
        // revision and collectionVersion are the invalidation signals for this read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fromYmd, throughYmd, rolloverHour, valid, revision, collectionVersion]);
    const cleared = useMemo(() => {
        try {
            return { sessions: loadClearedStudySessions(), readable: true };
        } catch (error) {
            console.warn('[StudyClear] cleared list unreadable:', error);
            return { sessions: [], readable: false };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revision, collectionVersion]);

    const totalMs = matching.reduce((sum, session) => sum + session.studyMs, 0);
    const dateLabel = (ymd: string) => ymdToLocalDate(ymd).toLocaleDateString(localeTag, { day: 'numeric', month: 'short', year: 'numeric' });
    const timeLabel = (atMs: number) => new Date(atMs).toLocaleString(localeTag, {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const count = (value: number) => value.toLocaleString(localeTag);

    const handleClear = () => {
        confirm(
            l(`${count(matching.length)} çalışma temizlensin mi?`, `Clear ${count(matching.length)} sessions?`),
            l(
                `${dateLabel(fromYmd)} – ${dateLabel(throughYmd)} aralığındaki çalışma kayıtları takviminizden ve istatistiklerinizden kaldırılacak. İstediğiniz zaman bu ekrandan geri yükleyebilirsiniz.`,
                `Sessions from ${dateLabel(fromYmd)} to ${dateLabel(throughYmd)} will be removed from your calendar and statistics. You can restore them from this screen at any time.`,
            ),
            () => {
                try {
                    const removed = clearStudySessions(fromYmd, throughYmd, rolloverHour);
                    invalidateCollection();
                    setRevision((value) => value + 1);
                    alert(
                        l('Çalışmalar temizlendi', 'Sessions cleared'),
                        l(`${count(removed)} çalışma temizlendi. İstediğiniz zaman geri yükleyebilirsiniz.`, `${count(removed)} sessions cleared. You can restore them at any time.`),
                    );
                } catch (error) {
                    console.warn('[StudyClear] clear failed:', error);
                    alert(l('Çalışmalar temizlenemedi', 'Sessions could not be cleared'), l('Kayıtlarınız değiştirilmedi.', 'Your sessions were not changed.'));
                }
            },
            { destructive: true },
        );
    };

    const handleRestore = () => {
        try {
            const restored = restoreClearedStudySessions();
            invalidateCollection();
            setRevision((value) => value + 1);
            alert(l('Çalışmalarınız geri yüklendi', 'Sessions restored'), l(`${count(restored)} çalışma geri yüklendi.`, `${count(restored)} sessions restored.`));
        } catch (error) {
            console.warn('[StudyClear] restore failed:', error);
            alert(l('Geri yüklenemedi', 'Could not restore'), l('Kayıtlarınız değiştirilmedi.', 'Your sessions were not changed.'));
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={l('Çalışmaları Temizle', 'Clear Sessions')}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
                onBack={() => goBackOr(router)}
            />
            <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
                <Section label={l('Tarih Aralığı', 'Date Range')}>
                    <DateField label={l('Başlangıç', 'From')} ymd={fromYmd} onChange={setFromYmd} />
                    <DateField label={l('Bitiş', 'Through')} ymd={throughYmd} onChange={setThroughYmd} />
                </Section>

                {!valid ? (
                    <Notice tone="danger">{l('Bitiş tarihi başlangıç tarihinden önce olamaz.', 'The end date cannot be before the start date.')}</Notice>
                ) : null}

                <Section
                    label={l('Temizlenecek Çalışmalar', 'Sessions to Clear')}
                    footnote={l(
                        'Başlangıç ve bitiş günleri dahildir. Kayıtlar başladıkları güne göre seçilir; gün, takvimdeki gibi gün dönüm saatinde başlar. Kart tekrarlarınız, planlarınız ve çalışan kronometre korunur. Temizlenen kayıtları aşağıdan geri yükleyebilirsiniz.',
                        'Both days are included. Sessions are chosen by the day they started, which turns over at your rollover hour as in the calendar. Card reviews, plans and the running stopwatch are kept. You can restore cleared sessions below.',
                    )}
                >
                    <ValueRow label={l('Çalışma Sayısı', 'Sessions')} value={count(matching.length)} />
                    <ValueRow label={l('Çalışma Süresi', 'Study Time')} value={formatStudyTotal(totalMs, locale)} />
                    <View style={styles.buttonRow}>
                        <Button
                            label={l('Çalışmaları Temizle', 'Clear Sessions')}
                            variant="destructive"
                            disabled={!valid || matching.length === 0 || !cleared.readable}
                            onPress={handleClear}
                        />
                    </View>
                </Section>

                {!cleared.readable ? (
                    <Notice tone="danger">
                        {l(
                            'Daha önce temizlenen çalışmalar okunamadı. Üzerlerine yazılmaması için temizleme kapalı.',
                            'Previously cleared sessions could not be read. Clearing is off so they are not overwritten.',
                        )}
                    </Notice>
                ) : null}

                {cleared.sessions.length > 0 ? (
                    <Section label={l('Geri Yükleme', 'Restore')}>
                        <ValueRow
                            label={l(
                                `${count(cleared.sessions.length)} temizlenmiş çalışma saklanıyor.`,
                                `${count(cleared.sessions.length)} cleared sessions are kept.`,
                            )}
                        />
                        <View style={styles.buttonRow}>
                            <Button label={l('Temizlenen Çalışmaları Geri Yükle', 'Restore Cleared Sessions')} variant="secondary" onPress={handleRestore} />
                        </View>
                    </Section>
                ) : null}

                <Section label={l('Ön İzleme', 'Preview')}>
                    {matching.length === 0 ? (
                        <ValueRow label={l('Bu aralıkta çalışma kaydınız yok.', 'No sessions in this range.')} />
                    ) : matching.slice(0, PREVIEW_LIMIT).map((session) => (
                        <View key={session.id} style={styles.previewRow} accessible>
                            <Text style={styles.previewTitle} numberOfLines={1}>{session.subject}</Text>
                            <Text style={styles.previewMeta}>
                                {`${timeLabel(session.startMs)} · ${formatStudyTotal(session.studyMs, locale)} · ${studyTypeLabel(l, session.kind, session.pass)}`}
                            </Text>
                        </View>
                    ))}
                    {matching.length > PREVIEW_LIMIT ? (
                        <ValueRow label={l(`ve ${count(matching.length - PREVIEW_LIMIT)} çalışma daha`, `and ${count(matching.length - PREVIEW_LIMIT)} more`)} />
                    ) : null}
                </Section>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.lg },
        buttonRow: { padding: Spacing.lg },
        previewRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, gap: 2 },
        previewTitle: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        previewMeta: { fontSize: FontSize.xs, color: colors.textMuted },
    });
}
