// Anki-style deck options screen: preset management plus every per-deck scheduling,
// display-order, burying, audio and easy-days setting the queue engine honors.
// Edits the deck's RAW config (boost-free) — "today only" extras live in custom study.

import React, { useMemo, useState } from 'react';
import {
    View,
    FlatList,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    KeyboardAvoidingView,
    Keyboard,
    Modal,
    Platform,
    Switch,
    Pressable,
} from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { useApp } from '../contexts/AppContext';
import {
    getDeck,
    getDeckConfig,
    getAllDeckConfigs,
    getDecksUsingConfig,
    saveDeckConfig,
    createPreset,
    renamePreset,
    deletePreset,
    assignDeckConfig,
    applyConfigToSubdecks,
    setDeckDescription,
} from '../lib/deckManager';
import { DEFAULT_DECK_CONFIG, getDeckDisplayName, type DeckConfig } from '../lib/models';
import { buildDeckPresetRows } from '../lib/deckPresetRows';
import { useI18n } from '../hooks/useI18n';
import SheetModal from '../components/SheetModal';
import LeechExplainer from '../components/LeechExplainer';

const DAY_FACTORS = [1, 0.5, 0] as const;

function parseCount(text: string, fallback: number, max: number = 9999): number {
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
}

function parseFactor(text: string, fallback: number): number {
    const value = Number(String(text).replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** "1 10" -> [1, 10]; invalid entries dropped, empty input falls back. */
function parseSteps(text: string, fallback: number[]): number[] {
    const steps = text.split(/[\s,]+/)
        .map((part) => Number(part.replace(',', '.')))
        .filter((value) => Number.isFinite(value) && value > 0);
    return steps.length > 0 ? steps : [...fallback];
}

export default function DeckOptionsScreen() {
    const { t, l } = useI18n();
    const dayLabels = l('Pzt,Sal,Çar,Per,Cum,Cmt,Paz', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun').split(',');
    const factorLabel = (factor: number) => factor === 1 ? l('Normal', 'Normal') : factor === 0.5 ? l('Azaltılmış', 'Reduced') : l('Yok', 'None');
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { bumpDataVersion } = useApp();

    const deckId = Number(Array.isArray(params.deckId) ? params.deckId[0] : params.deckId);
    const deck = useMemo(() => (Number.isFinite(deckId) ? getDeck(deckId) : null), [deckId]);

    const [configId, setConfigId] = useState<number>(deck?.configId || DEFAULT_DECK_CONFIG.id);
    const initialConfig = useMemo(() => getDeckConfig(configId), [configId]);

    // Form state, re-seeded whenever the preset changes.
    const [form, setForm] = useState(() => formFromConfig(initialConfig, deck?.description ?? ''));
    const [presetPickerOpen, setPresetPickerOpen] = useState(false);
    // Rebuilt when the picker opens or the preset changes, not on every keystroke in the form
    // above it; getAllDeckConfigs/getDecksUsingConfig both hit the database.
    const presetRows = useMemo(
        () => buildDeckPresetRows({
            presets: getAllDeckConfigs(),
            activeId: configId,
            deckCountFor: (id) => getDecksUsingConfig(id).length,
            fallbackName: (id) => l(`Grup ${id}`, `Preset ${id}`),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [presetPickerOpen, configId],
    );
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameText, setRenameText] = useState('');

    function formFromConfig(config: DeckConfig, description: string) {
        return {
            newPerDay: String(config.newPerDay),
            maxReviewsPerDay: String(config.maxReviewsPerDay),
            learningSteps: (config.learningSteps ?? []).join(' '),
            graduatingIvl: String(config.graduatingIvl),
            easyIvl: String(config.easyIvl),
            insertionOrder: config.insertionOrder,
            relearningSteps: (config.relearningSteps ?? []).join(' '),
            minIvl: String(config.minIvl),
            leechThreshold: String(config.leechThreshold),
            leechAction: config.leechAction,
            newCardGatherOrder: config.newCardGatherOrder ?? 'topic',
            newReviewOrder: config.newReviewOrder ?? 'mix',
            reviewSortOrder: config.reviewSortOrder ?? 'dueRandom',
            buryNewSiblings: config.buryNewSiblings,
            buryReviewSiblings: config.buryReviewSiblings,
            buryInterdayLearningSiblings: config.buryInterdayLearningSiblings,
            autoPlayAudio: config.autoPlayAudio ?? true,
            easyDays: Array.isArray(config.easyDays) && config.easyDays.length === 7
                ? [...config.easyDays]
                : [1, 1, 1, 1, 1, 1, 1],
            startingEase: (config.startingEase / 1000).toFixed(2),
            easyBonus: String(config.easyBonus),
            hardIvl: String(config.hardIvl),
            ivlModifier: String(config.ivlModifier),
            maxIvl: String(config.maxIvl),
            newIvlPercent: String(Math.round((config.newIvlPercent ?? 0) * 100)),
            description,
        };
    }

    const switchPreset = (nextId: number) => {
        setConfigId(nextId);
        setForm((prev) => ({ ...formFromConfig(getDeckConfig(nextId), prev.description) }));
        setPresetPickerOpen(false);
    };

    if (!deck) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.missing}>{l('Deste bulunamadı.', 'Deck not found.')}</Text>
            </SafeAreaView>
        );
    }

    const usedBy = getDecksUsingConfig(configId).length;
    const presetName = initialConfig.name || l('Varsayılan', 'Default');

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const cycleEasyDay = (index: number) => {
        setForm((prev) => {
            const next = [...prev.easyDays];
            const current = DAY_FACTORS.indexOf(next[index] as typeof DAY_FACTORS[number]);
            next[index] = DAY_FACTORS[(current + 1) % DAY_FACTORS.length];
            return { ...prev, easyDays: next };
        });
    };

    const handleSave = () => {
        try {
            const base = getDeckConfig(configId);
            const updated: DeckConfig = {
                ...base,
                id: configId,
                newPerDay: parseCount(form.newPerDay, base.newPerDay),
                maxReviewsPerDay: parseCount(form.maxReviewsPerDay, base.maxReviewsPerDay),
                learningSteps: parseSteps(form.learningSteps, base.learningSteps),
                graduatingIvl: Math.max(1, parseCount(form.graduatingIvl, base.graduatingIvl)),
                easyIvl: Math.max(1, parseCount(form.easyIvl, base.easyIvl)),
                insertionOrder: form.insertionOrder,
                relearningSteps: parseSteps(form.relearningSteps, base.relearningSteps),
                minIvl: Math.max(1, parseCount(form.minIvl, base.minIvl)),
                leechThreshold: Math.max(1, parseCount(form.leechThreshold, base.leechThreshold)),
                leechAction: form.leechAction,
                newCardGatherOrder: form.newCardGatherOrder,
                newReviewOrder: form.newReviewOrder,
                reviewSortOrder: form.reviewSortOrder,
                buryNewSiblings: form.buryNewSiblings,
                buryReviewSiblings: form.buryReviewSiblings,
                buryInterdayLearningSiblings: form.buryInterdayLearningSiblings,
                autoPlayAudio: form.autoPlayAudio,
                easyDays: [...form.easyDays],
                startingEase: Math.round(Math.max(1.3, parseFactor(form.startingEase, base.startingEase / 1000)) * 1000),
                easyBonus: parseFactor(form.easyBonus, base.easyBonus),
                hardIvl: parseFactor(form.hardIvl, base.hardIvl),
                ivlModifier: parseFactor(form.ivlModifier, base.ivlModifier),
                maxIvl: Math.max(1, parseCount(form.maxIvl, base.maxIvl, 36500)),
                newIvlPercent: Math.max(0, Math.min(100, parseCount(form.newIvlPercent, Math.round((base.newIvlPercent ?? 0) * 100), 100))) / 100,
            };

            saveDeckConfig(updated);
            if (deck.configId !== configId) assignDeckConfig(deck.id, configId);
            setDeckDescription(deck.id, form.description);
            bumpDataVersion();
            alert(t('common.saved'), usedBy > 1
                ? l(`Ayarlar kaydedildi. Bu ayar grubunu kullanan ${usedBy} deste etkilendi.`, `Settings saved. ${usedBy} decks using this preset were updated.`)
                : l('Ayarlar kaydedildi.', 'Settings saved.'), () => router.back());
        } catch (e) {
            console.warn('[DeckOptions] save failed:', e);
            alert(t('common.error'), l('Ayarlar kaydedilemedi.', 'Could not save the settings.'));
        }
    };

    const handleNewPreset = () => {
        const preset = createPreset(l(`${getDeckDisplayName(deck.name)} ayarları`, `${getDeckDisplayName(deck.name)} options`), configId);
        assignDeckConfig(deck.id, preset.id);
        switchPreset(preset.id);
    };

    const handleDeletePreset = () => {
        if (configId === DEFAULT_DECK_CONFIG.id) {
            alert(l('Bilgi', 'Info'), l('Varsayılan ayar grubu silinemez.', 'The default preset cannot be deleted.'));
            return;
        }
        confirm(
            l('Ayar Grubunu Sil', 'Delete Preset'),
            l(`“${presetName}” silinecek; bu grubu kullanan ${usedBy} deste varsayılan ayarlara dönecek.`, `“${presetName}” will be deleted; ${usedBy} decks using it will return to the default preset.`),
            () => {
                deletePreset(configId);
                bumpDataVersion();
                switchPreset(DEFAULT_DECK_CONFIG.id);
            },
            { destructive: true },
        );
    };

    const handleApplyToSubdecks = () => {
        const changed = applyConfigToSubdecks(deck.id);
        bumpDataVersion();
        alert(l('Uygulandı', 'Applied'), changed > 0
            ? l(`${changed} alt deste bu ayar grubuna geçirildi.`, `${changed} subdecks were assigned to this preset.`)
            : l('Tüm alt desteler zaten bu ayar grubunda.', 'All subdecks already use this preset.'));
    };

    const Choice = ({ value, options, onChange }: {
        value: string;
        options: { key: string; label: string }[];
        onChange: (key: string) => void;
    }) => (
        <View style={styles.choiceRow}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option.key}
                    style={[styles.choiceChip, value === option.key && styles.choiceChipActive]}
                    onPress={() => onChange(option.key)}
                >
                    <Text style={[styles.choiceText, value === option.key && styles.choiceTextActive]}>
                        {option.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    const Field = ({ label, value, onChange, hint }: {
        label: string; value: string; onChange: (t: string) => void; hint?: string;
    }) => (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" />
            {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        </View>
    );

    const SwitchRow = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
        <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel={l('Deste genel bakışına dön', 'Back to deck overview')}
                >
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerEyebrow}>{l('DESTE SEÇENEKLERİ', 'DECK OPTIONS')}</Text>
                    <Text scaleRole="title" style={styles.headerTitle} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>
                </View>
                <TouchableOpacity
                    style={styles.headerSaveButton}
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel={l('Deste seçeneklerini kaydet', 'Save deck options')}
                >
                    <Text style={styles.headerSaveText}>{t('common.save')}</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
            >

                <View style={styles.presetCard}>
                    <Text scaleRole="title" style={styles.sectionTitle}>{l('AYAR GRUBU', 'PRESET')}</Text>
                    <Text style={styles.presetName}>{presetName}</Text>
                    <Text style={styles.presetMeta}>
                        {l(`Bu grubu ${usedBy} deste kullanıyor${usedBy > 1 ? ' — değişiklikler hepsini etkiler.' : '.'}`, `${usedBy} decks use this preset${usedBy > 1 ? ' — changes affect all of them.' : '.'}`)}
                    </Text>
                    <View style={styles.presetActions}>
                        <TouchableOpacity style={styles.presetBtn} onPress={() => {
                            Keyboard.dismiss();
                            setPresetPickerOpen(true);
                        }}>
                            <Text style={styles.presetBtnText}>{l('Değiştir', 'Change')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.presetBtn} onPress={handleNewPreset}>
                            <Text style={styles.presetBtnText}>{l('Klonla ve Ayır', 'Clone & Detach')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.presetBtn}
                            onPress={() => { setRenameText(presetName); setRenameOpen(true); }}
                        >
                            <Text style={styles.presetBtnText}>{l('Adlandır', 'Rename')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.presetBtn} onPress={handleDeletePreset}>
                            <Text style={[styles.presetBtnText, styles.presetBtnDanger]}>{t('common.delete')}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.subdeckBtn} onPress={handleApplyToSubdecks}>
                        <Text style={styles.subdeckBtnText}>📁 {l('Tüm alt destelere uygula', 'Apply to all subdecks')}</Text>
                    </TouchableOpacity>
                </View>

                <Text scaleRole="title" style={styles.sectionTitle}>{l('GÜNLÜK LİMİTLER', 'DAILY LIMITS')}</Text>
                <Field label={l('Günlük yeni kart', 'New cards/day')} value={form.newPerDay} onChange={(t) => set('newPerDay', t)} />
                <Field label={l('Günlük en fazla tekrar', 'Maximum reviews/day')} value={form.maxReviewsPerDay} onChange={(t) => set('maxReviewsPerDay', t)} />
                <Text style={styles.fieldHint}>{l('“Yalnızca bugün” için ek limitler deste menüsündeki Özel Çalışma bölümündedir.', 'Use Custom Study from the deck menu for “today only” limit increases.')}</Text>

                <Text scaleRole="title" style={styles.sectionTitle}>{l('YENİ KARTLAR', 'NEW CARDS')}</Text>
                <Field
                    label={l('Öğrenme adımları (dakika)', 'Learning steps (minutes)')}
                    value={form.learningSteps}
                    onChange={(t) => set('learningSteps', t)}
                    hint={l('Boşlukla ayırın: örn. 1 10', 'Separate with spaces, e.g. 1 10')}
                />
                <Field label={l('Mezuniyet aralığı (gün)', 'Graduating interval (days)')} value={form.graduatingIvl} onChange={(t) => set('graduatingIvl', t)} />
                <Field label={l('Kolay aralığı (gün)', 'Easy interval (days)')} value={form.easyIvl} onChange={(t) => set('easyIvl', t)} />
                <Text style={styles.fieldLabel}>{l('Ekleniş sırası', 'Insertion order')}</Text>
                <Choice
                    value={form.insertionOrder}
                    options={[{ key: 'sequential', label: l('Sıralı', 'Sequential') }, { key: 'random', label: l('Rastgele', 'Random') }]}
                    onChange={(key) => set('insertionOrder', key as 'sequential' | 'random')}
                />

                <Text scaleRole="title" style={styles.sectionTitle}>{l('UNUTMALAR', 'LAPSES')}</Text>
                <Field
                    label={l('Yeniden öğrenme adımları (dakika)', 'Relearning steps (minutes)')}
                    value={form.relearningSteps}
                    onChange={(t) => set('relearningSteps', t)}
                />
                <Field label={l('En az aralık (gün)', 'Minimum interval (days)')} value={form.minIvl} onChange={(t) => set('minIvl', t)} />
                <Field
                    label={l('Sürekli Unutulan Kart eşiği', 'Leech threshold (lapses)')}
                    value={form.leechThreshold}
                    onChange={(t) => set('leechThreshold', t)}
                    hint={l(
                        'Kart bu sayıda unutulduğunda işaretlenir. Anki varsayılanı: 8.',
                        'The card is marked when it reaches this many lapses. Anki default: 8.',
                    )}
                />
                <Text style={styles.fieldLabel}>{l('Eşiğe ulaşıldığında', 'Leech action')}</Text>
                <Choice
                    value={form.leechAction}
                    options={[
                        { key: 'suspend', label: l('Etiketle ve askıya al', 'Tag and Suspend') },
                        { key: 'tag', label: l('Yalnızca etiketle', 'Tag Only') },
                    ]}
                    onChange={(key) => set('leechAction', key as 'suspend' | 'tag')}
                />
                <LeechExplainer context="settings" />

                <Text scaleRole="title" style={styles.sectionTitle}>{l('GÖRÜNTÜLEME SIRASI', 'DISPLAY ORDER')}</Text>
                <Text style={styles.fieldLabel}>{l('Yeni kart toplama sırası', 'New card gather order')}</Text>
                <Choice
                    value={form.newCardGatherOrder}
                    options={[
                        { key: 'topic', label: l('Konu sırası', 'Topic order') },
                        { key: 'position', label: l('Konum', 'Position') },
                        { key: 'random', label: l('Rastgele', 'Random') },
                    ]}
                    onChange={(key) => set('newCardGatherOrder', key as 'topic' | 'position' | 'random')}
                />
                <Text style={styles.fieldLabel}>{l('Yeni / tekrar sırası', 'New/review order')}</Text>
                <Choice
                    value={form.newReviewOrder}
                    options={[
                        { key: 'mix', label: l('Karıştır', 'Mix with reviews') },
                        { key: 'before', label: l('Önce yeni', 'Show before reviews') },
                        { key: 'after', label: l('Önce tekrar', 'Show after reviews') },
                    ]}
                    onChange={(key) => set('newReviewOrder', key as 'mix' | 'before' | 'after')}
                />
                <Text style={styles.fieldLabel}>{l('Tekrar sıralaması', 'Review sort order')}</Text>
                <Choice
                    value={form.reviewSortOrder}
                    options={[
                        { key: 'dueRandom', label: l('Zamanı gelen + rastgele', 'Due date, then random') },
                        { key: 'intervalsAsc', label: l('Aralık artan', 'Ascending intervals') },
                        { key: 'intervalsDesc', label: l('Aralık azalan', 'Descending intervals') },
                    ]}
                    onChange={(key) => set('reviewSortOrder', key as 'dueRandom' | 'intervalsAsc' | 'intervalsDesc')}
                />

                <Text scaleRole="title" style={styles.sectionTitle}>{l('GÖMME', 'BURYING')}</Text>
                <SwitchRow label={l('Yeni kardeş kartları göm', 'Bury new siblings')} value={form.buryNewSiblings} onChange={(v) => set('buryNewSiblings', v)} />
                <SwitchRow label={l('Tekrar kardeş kartları göm', 'Bury review siblings')} value={form.buryReviewSiblings} onChange={(v) => set('buryReviewSiblings', v)} />
                <SwitchRow
                    label={l('Gün aşan öğrenme kardeşlerini göm', 'Bury interday learning siblings')}
                    value={form.buryInterdayLearningSiblings}
                    onChange={(v) => set('buryInterdayLearningSiblings', v)}
                />

                <Text scaleRole="title" style={styles.sectionTitle}>{l('SES', 'AUDIO')}</Text>
                <SwitchRow label={l('Sesi otomatik oynat', 'Automatically play audio')} value={form.autoPlayAudio} onChange={(v) => set('autoPlayAudio', v)} />
                <Text style={styles.fieldHint}>{l('Kapalıyken kart üzerindeki 🔊 düğmesiyle veya R tuşuyla oynatılır.', 'When off, use the 🔊 button on the card or press R to play audio.')}</Text>

                <Text scaleRole="title" style={styles.sectionTitle}>{l('KOLAY GÜNLER — HAFTALIK YÜK', 'EASY DAYS — WEEKLY LOAD')}</Text>
                <Text style={styles.fieldHint}>{l('Değiştirmek için güne dokunun: Normal → Azaltılmış → Yok. Tekrarlar o günlerden kaydırılır.', 'Tap a day to cycle: Normal → Reduced → None. Reviews are shifted away from those days.')}</Text>
                <View style={styles.easyDaysRow}>
                    {dayLabels.map((label, index) => {
                        const factor = form.easyDays[index];
                        return (
                            <TouchableOpacity
                                key={label}
                                style={[
                                    styles.easyDay,
                                    factor === 0.5 && styles.easyDayReduced,
                                    factor === 0 && styles.easyDayOff,
                                ]}
                                onPress={() => cycleEasyDay(index)}
                                accessibilityRole="button"
                                accessibilityLabel={`${label}: ${factorLabel(factor)}`}
                            >
                                <Text style={styles.easyDayLabel}>{label}</Text>
                                <Text style={styles.easyDayFactor}>{factorLabel(factor)}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text scaleRole="title" style={styles.sectionTitle}>{l('GELİŞMİŞ', 'ADVANCED')}</Text>
                <Field label={l('Başlangıç kolaylığı', 'Starting ease')} value={form.startingEase} onChange={(t) => set('startingEase', t)} hint={l('Örn. 2,50', 'E.g. 2.50')} />
                <Field label={l('Kolay bonusu', 'Easy bonus')} value={form.easyBonus} onChange={(t) => set('easyBonus', t)} />
                <Field label={l('Zor aralık çarpanı', 'Hard interval multiplier')} value={form.hardIvl} onChange={(t) => set('hardIvl', t)} />
                <Field label={l('Aralık düzenleyici', 'Interval modifier')} value={form.ivlModifier} onChange={(t) => set('ivlModifier', t)} />
                <Field label={l('En fazla aralık (gün)', 'Maximum interval (days)')} value={form.maxIvl} onChange={(t) => set('maxIvl', t)} />
                <Field label={l('Yeni aralık (%) — unutma sonrası', 'New interval (%) after lapse')} value={form.newIvlPercent} onChange={(t) => set('newIvlPercent', t)} hint={l('0 = baştan başla', '0 = start over')} />

                <Text scaleRole="title" style={styles.sectionTitle}>{l('DESTE AÇIKLAMASI', 'DECK DESCRIPTION')}</Text>
                <TextInput
                    style={[styles.input, styles.descriptionInput]}
                    value={form.description}
                    onChangeText={(t) => set('description', t)}
                    placeholder={l('Bu deste hakkında not (çalışma ekranında görünür)', 'Notes about this deck (shown on the study screen)')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                />

                <Text style={styles.bottomHint}>{l('Değişiklikleri uygulamak için sağ üstteki Kaydet düğmesini kullanın.', 'Use Save in the top-right corner to apply your changes.')}</Text>
            </ScrollView>

            <SheetModal visible={presetPickerOpen} onClose={() => setPresetPickerOpen(false)}>
                <Text scaleRole="title" style={styles.modalTitle}>{l('Ayar Grubu Seç', 'Choose Preset')}</Text>
                <FlatList
                    style={{ maxHeight: 320 }}
                    data={presetRows}
                    keyExtractor={(row) => row.key}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.presetOption} onPress={() => switchPreset(item.id)}>
                            <Text style={[styles.presetOptionText, item.active && styles.presetOptionActive]}>
                                {item.label} · {l(`${item.deckCount} deste`, `${item.deckCount} decks`)}
                            </Text>
                        </TouchableOpacity>
                    )}
                />
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setPresetPickerOpen(false)}>
                    <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
            </SheetModal>

            <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setRenameOpen(false)}
                        accessibilityLabel={l('Yeniden adlandırma penceresini kapat', 'Close rename dialog')}
                    />
                    <View style={styles.modalCard}>
                        <Text scaleRole="title" style={styles.modalTitle}>{l('Ayar Grubunu Adlandır', 'Rename Preset')}</Text>
                        <TextInput style={styles.input} value={renameText} onChangeText={setRenameText} autoFocus />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setRenameOpen(false)}>
                                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.saveBtnSmall}
                                onPress={() => {
                                    renamePreset(configId, renameText);
                                    setRenameOpen(false);
                                    setForm((prev) => ({ ...prev }));
                                }}
                            >
                                <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        header: {
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
            backgroundColor: colors.bgPrimary,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        backText: { fontSize: 34, lineHeight: 36, color: colors.accent },
        headerTitleWrap: { flex: 1, paddingHorizontal: Spacing.xs },
        headerEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.textMuted },
        headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
        headerSaveButton: {
            minWidth: 68,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
            paddingHorizontal: Spacing.md,
        },
        headerSaveText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
        content: {
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            padding: Spacing.lg,
            gap: Spacing.sm,
            paddingBottom: 72,
        },
        missing: { margin: Spacing.xl, color: colors.textMuted, fontSize: FontSize.md },

        sectionTitle: {
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.2,
            color: colors.textMuted,
            marginTop: Spacing.lg,
        },

        presetCard: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing.md,
            gap: 6,
            ...Shadows.sm,
        },
        presetName: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        presetMeta: { fontSize: FontSize.sm, color: colors.textMuted },
        presetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
        presetBtn: {
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
        },
        presetBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        presetBtnDanger: { color: colors.btnAgain },
        subdeckBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.sm, backgroundColor: colors.accentLight },
        subdeckBtnText: { color: colors.accent, fontWeight: '600', fontSize: FontSize.sm },

        field: { gap: 4 },
        fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginTop: Spacing.xs },
        fieldHint: { fontSize: FontSize.xs, color: colors.textMuted },
        input: {
            minHeight: 44,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: 8,
            fontSize: FontSize.md,
            color: colors.textPrimary,
        },
        descriptionInput: { minHeight: 72, textAlignVertical: 'top' },

        choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
        choiceChip: {
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            borderRadius: BorderRadius.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        choiceChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        choiceText: { fontSize: FontSize.sm, color: colors.textSecondary },
        choiceTextActive: { color: colors.accent, fontWeight: '700' },

        switchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48,
            paddingVertical: 6,
        },
        switchLabel: { fontSize: FontSize.md, color: colors.textPrimary, flex: 1, marginRight: Spacing.md },

        easyDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
        easyDay: {
            minWidth: 64,
            alignItems: 'center',
            paddingVertical: 8,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            gap: 2,
        },
        easyDayReduced: { backgroundColor: colors.btnHardBg, borderColor: colors.btnHard },
        easyDayOff: { backgroundColor: colors.btnAgainBg, borderColor: colors.btnAgain },
        easyDayLabel: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        easyDayFactor: { fontSize: 10, color: colors.textMuted },

        saveBtn: {
            marginTop: Spacing.xl,
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.md,
            alignItems: 'center',
        },
        saveBtnSmall: {
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingVertical: 8,
            paddingHorizontal: Spacing.lg,
            alignItems: 'center',
        },
        saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
        cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
        bottomHint: { marginTop: Spacing.xl, fontSize: FontSize.sm, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },

        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        modalCard: {
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.xl,
            gap: Spacing.sm,
            ...Shadows.lg,
        },
        modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
        presetOption: {
            paddingVertical: 11,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        presetOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
        presetOptionActive: { color: colors.accent, fontWeight: '700' },
    });
}
