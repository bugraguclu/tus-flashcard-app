import React, { useMemo } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../lib/models';
import { useI18n } from '../hooks/useI18n';
import { cardFlagName } from '../lib/i18n';

export default function ReviewerFlagMenu({
    visible,
    currentFlag,
    onClose,
    onSelect,
}: {
    visible: boolean;
    currentFlag: CardFlag;
    onClose: () => void;
    onSelect: (flag: CardFlag) => void;
}) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const panelWidth = Math.min(300, Math.max(232, width * 0.55));

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) }]}>
                <Pressable
                    style={styles.scrim}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={l('Bayrak seçiciyi kapat', 'Close flag picker')}
                />
                <View style={[styles.panel, { width: panelWidth }]} accessibilityViewIsModal>
                    <View style={styles.header}>
                        <Text style={styles.title}>{l('Bayrak rengi', 'Flag color')}</Text>
                    </View>
                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => {
                            const label = flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag);
                            const selected = currentFlag === flag;
                            return (
                                <TouchableOpacity
                                    key={flag}
                                    style={[styles.row, selected && styles.rowSelected]}
                                    onPress={() => { onSelect(flag); onClose(); }}
                                    accessibilityRole="radio"
                                    accessibilityLabel={label}
                                    accessibilityState={{ selected }}
                                >
                                    <View style={[styles.swatch, { backgroundColor: flag === 0 ? colors.bgCard : FLAG_COLORS[flag].color }]} />
                                    <Text style={styles.label}>{label}</Text>
                                    {selected ? <Text style={styles.check}>✓</Text> : null}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { flex: 1, alignItems: 'flex-end' },
        scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.22)' },
        panel: {
            maxHeight: '100%',
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.sm,
            borderBottomLeftRadius: BorderRadius.sm,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: -4, height: 4 },
            shadowOpacity: 0.22,
            shadowRadius: 10,
            elevation: 16,
        },
        header: {
            minHeight: 54,
            alignItems: 'center',
            justifyContent: 'center',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        title: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        content: { paddingVertical: 4, paddingBottom: 6 },
        row: {
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            paddingVertical: 7,
        },
        rowSelected: { backgroundColor: colors.accentLight },
        swatch: { width: 20, height: 20, borderRadius: 3, borderWidth: 1, borderColor: colors.border, marginRight: 14 },
        label: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md, lineHeight: 20 },
        check: { color: colors.accent, fontSize: 20, fontWeight: '800' },
    });
}

