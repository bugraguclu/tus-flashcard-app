import type { Dispatch, SetStateAction } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { useI18n } from '../../hooks/useI18n';
import type { StatsRangeKey } from '../../lib/ankiStats';
import type { StatsScreenStyles } from './statsScreenStyles';

interface StatsRangePickerProps {
    rangePickerVisible: boolean;
    setRangePickerVisible: Dispatch<SetStateAction<boolean>>;
    rangeKey: StatsRangeKey;
    setRangeKey: Dispatch<SetStateAction<StatsRangeKey>>;
    customStart: Date;
    setCustomStart: Dispatch<SetStateAction<Date>>;
    customEnd: Date;
    setCustomEnd: Dispatch<SetStateAction<Date>>;
    localeTag: ReturnType<typeof useI18n>['localeTag'];
    styles: StatsScreenStyles;
    l: ReturnType<typeof useI18n>['l'];
}

/** The time range the statistics cover: a preset span or a custom pair of dates. */
export default function StatsRangePicker({
    rangePickerVisible,
    setRangePickerVisible,
    rangeKey,
    setRangeKey,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    localeTag,
    styles,
    l,
}: StatsRangePickerProps) {
    return (
        <Modal
            visible={rangePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setRangePickerVisible(false)}
        >
            <Pressable style={styles.pickerOverlay} onPress={() => setRangePickerVisible(false)}>
                <Pressable style={styles.pickerCard} onPress={() => {}} accessibilityViewIsModal>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>{l('Zaman aralığı', 'Time Range')}</Text>
                        <TouchableOpacity
                            style={styles.pickerClose}
                            onPress={() => setRangePickerVisible(false)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Zaman seçiciyi kapat', 'Close time range picker')}
                        >
                            <Text style={styles.pickerCloseText}>×</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                        {([
                            ['week', l('Son hafta', 'Last Week')],
                            ['month', l('Son ay', 'Last Month')],
                            ['threeMonths', l('Son 3 ay', 'Last 3 Months')],
                            ['year', l('Son 1 yıl', 'Last Year')],
                            ['all', l('Tüm zamanlar', 'All Time')],
                        ] as [StatsRangeKey, string][]).map(([key, label]) => (
                            <TouchableOpacity
                                key={key}
                                style={[styles.pickerRow, rangeKey === key && styles.pickerRowActive]}
                                onPress={() => {
                                    setRangeKey(key);
                                    setRangePickerVisible(false);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: rangeKey === key }}
                            >
                                <Text style={styles.pickerRowIcon}>◷</Text>
                                <Text style={[styles.pickerRowText, rangeKey === key && styles.pickerRowTextActive]}>{label}</Text>
                                {rangeKey === key && <Text style={styles.pickerCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}

                        <View style={[styles.customRangeBlock, rangeKey === 'custom' && styles.customRangeBlockActive]}>
                            <View style={styles.customRangeHeading}>
                                <Text style={styles.customRangeTitle}>{l('Özel tarih aralığı', 'Custom Date Range')}</Text>
                                {rangeKey === 'custom' && <Text style={styles.pickerCheck}>✓</Text>}
                            </View>
                            <View style={styles.datePickerRow}>
                                <Text style={styles.datePickerLabel}>{l('Başlangıç', 'Start')}</Text>
                                <DateTimePicker
                                    value={customStart}
                                    mode="date"
                                    display="compact"
                                    maximumDate={customEnd}
                                    locale={localeTag}
                                    onChange={(_event, value) => value && setCustomStart(value)}
                                />
                            </View>
                            <View style={styles.datePickerRow}>
                                <Text style={styles.datePickerLabel}>{l('Bitiş', 'End')}</Text>
                                <DateTimePicker
                                    value={customEnd}
                                    mode="date"
                                    display="compact"
                                    minimumDate={customStart}
                                    maximumDate={new Date()}
                                    locale={localeTag}
                                    onChange={(_event, value) => value && setCustomEnd(value)}
                                />
                            </View>
                            <TouchableOpacity
                                style={styles.applyRangeButton}
                                onPress={() => {
                                    setRangeKey('custom');
                                    setRangePickerVisible(false);
                                }}
                                accessibilityRole="button"
                            >
                                <Text style={styles.applyRangeButtonText}>{l('Bu aralığı kullan', 'Use This Range')}</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
