import { useMemo } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, dropShadow, useThemeColors, type ColorScheme } from '../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../lib/models';
import FlagGlyph from './FlagGlyph';
import { MenuItem } from './ui/Menu';
import { Radius } from './ui/tokens';
import { useI18n } from '../hooks/useI18n';
import { cardFlagName } from '../lib/i18n';

/** The reviewer's flag picker: an AnkiDroid-style panel at the right edge, one row per flag. */
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
                        <Text style={styles.title} accessibilityRole="header">{l('Bayrak rengi', 'Flag color')}</Text>
                    </View>
                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => (
                            <MenuItem
                                key={flag}
                                label={flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                                icon={(
                                    <FlagGlyph
                                        color={flag === 0 ? colors.textMuted : FLAG_COLORS[flag].color}
                                        size={18}
                                        filled={flag !== 0}
                                    />
                                )}
                                checked={currentFlag === flag}
                                exclusive
                                onPress={() => { onSelect(flag); onClose(); }}
                            />
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { flex: 1, alignItems: 'flex-end' },
        scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrimLight },
        panel: {
            maxHeight: '100%',
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: Radius.inset,
            borderBottomLeftRadius: Radius.inset,
            overflow: 'hidden',
            ...dropShadow({ x: -4, y: 4, blur: 10, opacity: 0.22, elevation: 16 }),
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
    });
}
