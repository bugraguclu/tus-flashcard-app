import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Shadows, Spacing, useIsDarkTheme, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

const MINUTE_MS = 60_000;

interface TimePickerPanelProps {
    /** The field's time, which the wheels start from. */
    value: number;
    /** What the panel is for, read out with it: "Çalışma Başlangıcı". */
    label: string;
    onCancel: () => void;
    /** The chosen time, at the start of its minute. */
    onConfirm: (ms: number) => void;
}

/**
 * A session time chosen as TUSBuddy's forms take it: a panel at the bottom of the screen with
 * "İptal" and "Tamam" over the date and time wheels. Turning the wheels changes nothing until
 * "Tamam"; "İptal" or a tap outside leaves the field as it was.
 */
export default function TimePickerPanel({ value, label, onCancel, onConfirm }: TimePickerPanelProps) {
    const { l, localeTag } = useI18n();
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const insets = useSafeAreaInsets();
    const [draft, setDraft] = useState(() => Math.floor(value / MINUTE_MS) * MINUTE_MS);

    return (
        <>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel={l('Saat seçimini kapat', 'Close the time picker')}
            />
            <View
                style={[styles.panel, { backgroundColor: colors.bgCard, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}
                accessibilityLabel={label}
            >
                <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
                    <TouchableOpacity
                        onPress={onCancel}
                        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={l('İptal', 'Cancel')}
                    >
                        <Text style={[styles.cancel, { color: colors.textSecondary }]}>{l('İptal', 'Cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => onConfirm(draft)}
                        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={l(`${label} için seçilen saati kaydet`, `Use the chosen time for ${label}`)}
                    >
                        <Text style={[styles.done, { color: colors.accent }]}>{l('Tamam', 'Done')}</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.wheels}>
                    <DateTimePicker
                        value={new Date(draft)}
                        mode={Platform.OS === 'android' ? 'time' : 'datetime'}
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={new Date()}
                        locale={localeTag}
                        themeVariant={isDark ? 'dark' : 'light'}
                        onChange={(_event, next) => {
                            if (next) setDraft(Math.floor(next.getTime() / MINUTE_MS) * MINUTE_MS);
                        }}
                    />
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    panel: {
        borderTopLeftRadius: BorderRadius.lg,
        borderTopRightRadius: BorderRadius.lg,
        paddingTop: Spacing.sm,
        ...Shadows.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cancel: { fontSize: FontSize.lg, fontWeight: '600' },
    done: { fontSize: FontSize.lg, fontWeight: '700' },
    wheels: { alignItems: 'center', paddingVertical: Spacing.sm },
});
