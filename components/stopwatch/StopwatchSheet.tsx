import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheetModal from '../BottomSheetModal';
import { BorderRadius, Shadows, Spacing, useThemeColors } from '../../constants/theme';

interface StopwatchSheetProps {
    visible: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    /**
     * A picker drawn over the whole sheet on a dimmed backdrop (the course grid, the type list).
     * The sheet under it is hidden from VoiceOver while it is up.
     */
    overlay?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * The Kronometre's bottom sheet (`BottomSheetModal`): a dimmed backdrop that closes it, and a sheet
 * with a grabber and a centred title that is pulled down from anywhere outside its scrolling part,
 * lifted above the keyboard when a field has focus. While it slides away it takes no more touches,
 * so a second tap cannot repeat what closed it.
 */
export default function StopwatchSheet({
    visible,
    title,
    subtitle,
    onClose,
    overlay,
    children,
}: StopwatchSheetProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const covered = Boolean(overlay);

    return (
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            avoidKeyboard
            swipeEnabled={!covered}
            accessibilityViewIsModal={!covered}
            backdropHidden={covered}
            title={title}
            subtitle={subtitle}
            sheetStyle={[
                styles.sheet,
                { backgroundColor: colors.bgPrimary, paddingBottom: Math.max(insets.bottom, Spacing.md) },
            ]}
            overlay={overlay ? (
                // Its own keyboard avoidance: an absolutely placed layer ignores the padding the
                // sheet's container takes for the keyboard, so a picker's field would sit under it.
                <KeyboardAvoidingView
                    style={[StyleSheet.absoluteFill, styles.pickerLayer]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    accessibilityViewIsModal
                >
                    {overlay}
                </KeyboardAvoidingView>
            ) : null}
        >
            <View
                style={styles.content}
                importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
                accessibilityElementsHidden={covered}
            >
                {children}
            </View>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    sheet: {
        maxHeight: '92%',
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        paddingHorizontal: Spacing.lg,
        ...Shadows.lg,
    },
    content: { flexShrink: 1 },
    pickerLayer: { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: Spacing.lg },
});
