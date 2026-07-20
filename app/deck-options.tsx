// Anki-style deck options screen: preset management plus every per-deck scheduling,
// display-order, burying, audio and easy-days setting the queue engine honors.
// Edits the deck's RAW config (boost-free) — "today only" extras live in custom study.

import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    Modal,
    Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { useApp } from './(tabs)/app-context';
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

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAY_FACTORS = [1, 0.5, 0] as const;
const FACTOR_LABELS: Record<number, string> = { 1: 'Normal', 0.5: 'Azaltılmış', 0: 'Yok' };

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
                <Text style={styles.missing}>Deste bulunamadı.</Text>
            </SafeAreaView>
        );
    }

    const usedBy = getDecksUsingConfig(configId).length;
    const presetName = initialConfig.name || 'Varsayılan';

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
            alert('Kaydedildi', usedBy > 1
                ? `Ayarlar kaydedildi. Bu ayar grubunu kullanan ${usedBy} deste etkilendi.`
                : 'Ayarlar kaydedildi.', () => router.back());
        } catch (e) {
            console.warn('[DeckOptions] save failed:', e);
            alert('Hata', 'Ayarlar kaydedilemedi.');
        }
    };

    const handleNewPreset = () => {
        const preset = createPreset(`${getDeckDisplayName(deck.name)} ayarları`, configId);
        assignDeckConfig(deck.id, preset.id);
        switchPreset(preset.id);
    };

    const handleDeletePreset = () => {
        if (configId === DEFAULT_DECK_CONFIG.id) {
            alert('Bilgi', 'Varsayılan ayar grubu silinemez.');
            return;
        }
        confirm(
            'Ayar grubunu sil',
            `"${presetName}" silinecek; bu grubu kullanan ${usedBy} deste varsayılan ayarlara dönecek.`,
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
        alert('Uygulandı', changed > 0
            ? `${changed} alt deste bu ayar grubuna geçirildi.`
            : 'Tüm alt desteler zaten bu ayar grubunda.');
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
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>⚙️ Seçenekler — {getDeckDisplayName(deck.name)}</Text>

                <View style={styles.presetCard}>
                    <Text style={styles.sectionTitle}>AYAR GRUBU (PRESET)</Text>
                    <Text style={styles.presetName}>{presetName}</Text>
                    <Text style={styles.presetMeta}>
                        Bu grubu {usedBy} deste kullanıyor{usedBy > 1 ? ' — değişiklikler hepsini etkiler.' : '.'}
                    </Text>
                    <View style={styles.presetActions}>
                        <TouchableOpacity style={styles.presetBtn} onPress={() => setPresetPickerOpen(true)}>
                            <Text style={styles.presetBtnText}>Değiştir</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.presetBtn} onPress={handleNewPreset}>
                            <Text style={styles.presetBtnText}>Klonla & Ayrıl</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.presetBtn}
                            onPress={() => { setRenameText(presetName); setRenameOpen(true); }}
                        >
                            <Text style={styles.presetBtnText}>Adlandır</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.presetBtn} onPress={handleDeletePreset}>
                            <Text style={[styles.presetBtnText, styles.presetBtnDanger]}>Sil</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.subdeckBtn} onPress={handleApplyToSubdecks}>
                        <Text style={styles.subdeckBtnText}>📁 Tüm alt destelere uygula</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>GÜNLÜK LİMİTLER</Text>
                <Field label="Günlük yeni kart" value={form.newPerDay} onChange={(t) => set('newPerDay', t)} />
                <Field label="Günlük azami tekrar" value={form.maxReviewsPerDay} onChange={(t) => set('maxReviewsPerDay', t)} />
                <Text style={styles.fieldHint}>"Sadece bugün" ek limitleri deste dişlisindeki Özel Çalışma'da.</Text>

                <Text style={styles.sectionTitle}>YENİ KARTLAR</Text>
                <Field
                    label="Öğrenme adımları (dakika)"
                    value={form.learningSteps}
                    onChange={(t) => set('learningSteps', t)}
                    hint="Boşlukla ayır: örn. 1 10"
                />
                <Field label="Mezuniyet aralığı (gün)" value={form.graduatingIvl} onChange={(t) => set('graduatingIvl', t)} />
                <Field label="Kolay aralığı (gün)" value={form.easyIvl} onChange={(t) => set('easyIvl', t)} />
                <Text style={styles.fieldLabel}>Ekleniş sırası</Text>
                <Choice
                    value={form.insertionOrder}
                    options={[{ key: 'sequential', label: 'Sıralı' }, { key: 'random', label: 'Rastgele' }]}
                    onChange={(key) => set('insertionOrder', key as 'sequential' | 'random')}
                />

                <Text style={styles.sectionTitle}>GECİKMELER (LAPSES)</Text>
                <Field
                    label="Yeniden öğrenme adımları (dakika)"
                    value={form.relearningSteps}
                    onChange={(t) => set('relearningSteps', t)}
                />
                <Field label="Asgari aralık (gün)" value={form.minIvl} onChange={(t) => set('minIvl', t)} />
                <Field label="Leech eşiği (hata sayısı)" value={form.leechThreshold} onChange={(t) => set('leechThreshold', t)} />
                <Text style={styles.fieldLabel}>Leech eylemi</Text>
                <Choice
                    value={form.leechAction}
                    options={[{ key: 'suspend', label: 'Askıya al' }, { key: 'tag', label: 'Yalnızca etiketle' }]}
                    onChange={(key) => set('leechAction', key as 'suspend' | 'tag')}
                />

                <Text style={styles.sectionTitle}>GÖRÜNTÜLEME SIRASI</Text>
                <Text style={styles.fieldLabel}>Yeni kart toplama sırası</Text>
                <Choice
                    value={form.newCardGatherOrder}
                    options={[
                        { key: 'topic', label: 'Konu sırası' },
                        { key: 'position', label: 'Pozisyon' },
                        { key: 'random', label: 'Rastgele' },
                    ]}
                    onChange={(key) => set('newCardGatherOrder', key as 'topic' | 'position' | 'random')}
                />
                <Text style={styles.fieldLabel}>Yeni / tekrar karışımı</Text>
                <Choice
                    value={form.newReviewOrder}
                    options={[
                        { key: 'mix', label: 'Karışık' },
                        { key: 'before', label: 'Önce yeni' },
                        { key: 'after', label: 'Önce tekrar' },
                    ]}
                    onChange={(key) => set('newReviewOrder', key as 'mix' | 'before' | 'after')}
                />
                <Text style={styles.fieldLabel}>Tekrar sıralaması</Text>
                <Choice
                    value={form.reviewSortOrder}
                    options={[
                        { key: 'dueRandom', label: 'Vade + rastgele' },
                        { key: 'intervalsAsc', label: 'Aralık artan' },
                        { key: 'intervalsDesc', label: 'Aralık azalan' },
                    ]}
                    onChange={(key) => set('reviewSortOrder', key as 'dueRandom' | 'intervalsAsc' | 'intervalsDesc')}
                />

                <Text style={styles.sectionTitle}>GÖMME (BURY)</Text>
                <SwitchRow label="Yeni kardeş kartları göm" value={form.buryNewSiblings} onChange={(v) => set('buryNewSiblings', v)} />
                <SwitchRow label="Tekrar kardeş kartları göm" value={form.buryReviewSiblings} onChange={(v) => set('buryReviewSiblings', v)} />
                <SwitchRow
                    label="Gün-aşan öğrenme kardeşlerini göm"
                    value={form.buryInterdayLearningSiblings}
                    onChange={(v) => set('buryInterdayLearningSiblings', v)}
                />

                <Text style={styles.sectionTitle}>SES</Text>
                <SwitchRow label="Sesi otomatik çal" value={form.autoPlayAudio} onChange={(v) => set('autoPlayAudio', v)} />
                <Text style={styles.fieldHint}>Kapalıyken kart üzerindeki 🔊 düğmesi ya da R tuşu ile çalınır.</Text>

                <Text style={styles.sectionTitle}>EASY DAYS — HAFTALIK YÜK</Text>
                <Text style={styles.fieldHint}>Güne dokunarak değiştir: Normal → Azaltılmış → Yok. Tekrarlar o günlerden kaydırılır.</Text>
                <View style={styles.easyDaysRow}>
                    {DAY_LABELS.map((label, index) => {
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
                                accessibilityLabel={`${label}: ${FACTOR_LABELS[factor] ?? 'Normal'}`}
                            >
                                <Text style={styles.easyDayLabel}>{label}</Text>
                                <Text style={styles.easyDayFactor}>{FACTOR_LABELS[factor] ?? 'Normal'}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.sectionTitle}>GELİŞMİŞ</Text>
                <Field label="Başlangıç kolaylığı" value={form.startingEase} onChange={(t) => set('startingEase', t)} hint="Örn. 2.50" />
                <Field label="Kolay bonusu" value={form.easyBonus} onChange={(t) => set('easyBonus', t)} />
                <Field label="Zor aralık çarpanı" value={form.hardIvl} onChange={(t) => set('hardIvl', t)} />
                <Field label="Aralık düzenleyici" value={form.ivlModifier} onChange={(t) => set('ivlModifier', t)} />
                <Field label="Azami aralık (gün)" value={form.maxIvl} onChange={(t) => set('maxIvl', t)} />
                <Field label="Yeni aralık (%) — hata sonrası" value={form.newIvlPercent} onChange={(t) => set('newIvlPercent', t)} hint="0 = baştan başla" />

                <Text style={styles.sectionTitle}>DESTE AÇIKLAMASI</Text>
                <TextInput
                    style={[styles.input, styles.descriptionInput]}
                    value={form.description}
                    onChangeText={(t) => set('description', t)}
                    placeholder="Bu deste hakkında not (çalışma ekranında görünür)"
                    placeholderTextColor={colors.textMuted}
                    multiline
                />

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>💾 Kaydet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Vazgeç</Text>
                </TouchableOpacity>
            </ScrollView>

            <Modal visible={presetPickerOpen} transparent animationType="fade" onRequestClose={() => setPresetPickerOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Ayar Grubu Seç</Text>
                        <ScrollView style={{ maxHeight: 320 }}>
                            {getAllDeckConfigs().map((preset) => (
                                <TouchableOpacity key={preset.id} style={styles.presetOption} onPress={() => switchPreset(preset.id)}>
                                    <Text style={[styles.presetOptionText, preset.id === configId && styles.presetOptionActive]}>
                                        {preset.name || `Grup ${preset.id}`} · {getDecksUsingConfig(preset.id).length} deste
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setPresetPickerOpen(false)}>
                            <Text style={styles.cancelText}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Ayar Grubunu Adlandır</Text>
                        <TextInput style={styles.input} value={renameText} onChangeText={setRenameText} autoFocus />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setRenameOpen(false)}>
                                <Text style={styles.cancelText}>Vazgeç</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.saveBtnSmall}
                                onPress={() => {
                                    renamePreset(configId, renameText);
                                    setRenameOpen(false);
                                    setForm((prev) => ({ ...prev }));
                                }}
                            >
                                <Text style={styles.saveBtnText}>Kaydet</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxxl },
        missing: { margin: Spacing.xl, color: colors.textMuted, fontSize: FontSize.md },
        title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.xs },

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
