import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { findEmptyCards, deleteAnkiCardOnly, deleteAnkiCardsOnly, type EmptyCardEntry } from '../lib/noteManager';
import { useI18n } from '../hooks/useI18n';
import ScreenHeader from '../components/ScreenHeader';
import { DECORATIVE_SVG_PROPS } from '../components/decorativeSvgProps';
import { Button, IconButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState, LoadingState } from '../components/ui/Feedback';
import { ListRow, SwitchRow } from '../components/ui/Rows';
import { CloseIcon } from '../components/ui/icons';

/** A bin, drawn like the kit's control glyphs: the kit has no delete icon yet. */
function TrashIcon({ color, size = 18 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function emptyCardReason(reason: EmptyCardEntry['reason'], l: (tr: string, en: string) => string): string {
    if (reason.includes('Kapama')) return l('Kapama metinde yok', 'Cloze is missing from the text');
    if (reason.includes('Şablon')) return l('Şablon artık yok', 'Template no longer exists');
    return l('Ön yüz boş', 'Front is empty');
}

export default function EmptyCardsScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [entries, setEntries] = useState<EmptyCardEntry[] | null>(null);
    const [preserveNotes, setPreserveNotes] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);

    const scan = () => {
        setEntries(null);
        setError(false);
        // findEmptyCards is synchronous SQLite work; defer one tick so the loading state paints.
        setTimeout(() => {
            try {
                setEntries(findEmptyCards());
            } catch (e) {
                console.warn('[EmptyCards] scan failed:', e);
                setError(true);
                setEntries([]);
            }
        }, 0);
    };

    useEffect(() => { scan(); }, [dataVersion]);

    const deleteOne = (entry: EmptyCardEntry) => {
        confirm(
            l('Boş kartı sil', 'Delete Empty Card'),
            l('Boş kart silinir. Notları koru açıksa son kart kalır; diğer kartlar ve tekrar geçmişi korunur.', 'The empty card is deleted. With Keep Notes on, its last card stays; other cards and review history are preserved.'),
            () => {
                try {
                    deleteAnkiCardOnly(entry.cardId, { preserveNotes });
                    bumpDataVersion();
                    scan();
                } catch (e) {
                    console.warn('[EmptyCards] delete failed:', e);
                    alert(t('common.error'), l('Kart silinemedi.', 'Could not delete the card.'));
                }
            },
            { destructive: true },
        );
    };

    const deleteAll = () => {
        if (!entries || entries.length === 0) return;
        confirm(
            l('Boş kartları sil', 'Delete Empty Cards'),
            l(`${entries.length} boş kart işlenecek. Notları koru açıksa not başına en az bir kart kalır; tekrar geçmişi korunur.`, `${entries.length} empty cards will be processed. Keep Notes leaves at least one card per note; review history is preserved.`),
            () => {
                setBusy(true);
                try {
                    deleteAnkiCardsOnly(entries.map((entry) => entry.cardId), { preserveNotes });
                    bumpDataVersion();
                    scan();
                } catch (e) {
                    console.warn('[EmptyCards] bulk delete failed:', e);
                    alert(t('common.error'), l('Kartlar silinemedi.', 'Could not delete the cards.'));
                } finally {
                    setBusy(false);
                }
            },
            { destructive: true },
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={l('Boş kartlar', 'Empty Cards')}
                onBack={() => router.canGoBack() ? router.back() : router.replace('/decks' as any)}
                backAccessibilityLabel={l('Destelere dön', 'Back to decks')}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    {l('Ön yüzü artık üretilemeyen kartlar burada görünür. Silmek kartı kaldırır; notu ve diğer kartları korur.', 'Cards whose front can no longer be generated appear here. Deleting one keeps its note and other cards.')}
                </Text>

                {entries === null ? (
                    <LoadingState label={l('Taranıyor…', 'Scanning…')} />
                ) : error ? (
                    <EmptyState
                        title={l('Kartlar taranamadı.', 'Cards could not be scanned.')}
                        action={(
                            <Button
                                variant="secondary"
                                label={t('common.retry')}
                                accessibilityLabel={l('Tekrar tara', 'Scan again')}
                                onPress={scan}
                            />
                        )}
                    />
                ) : entries.length === 0 ? (
                    <EmptyState title={l('Boş kart bulunamadı.', 'No empty cards found.')} />
                ) : (
                    <>
                        <Card>
                            <SwitchRow
                                title={l('Geçerli kartı olmayan notları koru', 'Keep notes with no valid cards')}
                                value={preserveNotes}
                                onValueChange={setPreserveNotes}
                            />
                        </Card>
                        <Button
                            variant="destructive"
                            icon={<TrashIcon color={colors.onAccent} />}
                            label={`${l('Tümünü sil', 'Delete All')} (${entries.length})`}
                            onPress={deleteAll}
                            busy={busy}
                        />

                        <Card divided>
                            {entries.map((entry) => (
                                <ListRow
                                    key={entry.cardId}
                                    title={entry.question || l('(boş)', '(empty)')}
                                    summary={emptyCardReason(entry.reason, l)}
                                    accessory={(
                                        <IconButton accessibilityLabel={l('Bu kartı sil', 'Delete this card')} onPress={() => deleteOne(entry)}>
                                            <CloseIcon color={colors.danger} size={20} />
                                        </IconButton>
                                    )}
                                />
                            ))}
                        </Card>
                    </>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.sm },
        help: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 20 },
    });
}
