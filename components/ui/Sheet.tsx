import React from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheetModal from '../BottomSheetModal';
import { Spacing, useThemeColors } from '../../constants/theme';
import { Radius, Shadow } from './tokens';

interface AppSheetProps {
    visible: boolean;
    onClose: () => void;
    /**
     * Centred under the grabber; leave it out when the content draws its own heading. A sheet has
     * no close button: the grabber, a pull-down and the backdrop close it.
     */
    title?: string;
    subtitle?: string;
    /** A control at the header's start, e.g. Back in a sheet with a second step. */
    headerLeft?: React.ReactNode;
    /** A control at the header's end, e.g. the action that saves a recording. */
    headerRight?: React.ReactNode;
    /** Lift the sheet above the keyboard while one of its fields has focus. */
    avoidKeyboard?: boolean;
    /** Whether the grabber and pull-down close it (off while work runs that must not be left). */
    swipeEnabled?: boolean;
    /**
     * A picker drawn over the whole sheet on its own dimmed layer. The sheet under it is hidden from
     * VoiceOver and cannot be pulled down while it is up.
     */
    overlay?: React.ReactNode;
    /** Where the overlay sits: centred (a picker card) or at the bottom edge (date and time wheels). */
    overlayPlacement?: 'center' | 'bottom';
    /** The sheet's height limit; 88% of the screen by default. */
    maxHeight?: `${number}%`;
    /** Extra style for the sheet surface, e.g. a fixed height for a long list. */
    sheetStyle?: StyleProp<ViewStyle>;
    backdropLabel?: string;
    /**
     * Runs once the sheet has gone, so an action chosen in it can present its own modal (a picker,
     * an editor) without racing the sheet's exit.
     */
    onDismiss?: () => void;
    /**
     * Leaves at once, without its exit animation, when `visible` turns false: set by
     * `useModalHandoff` while it hands the screen to another modal, which UIKit would
     * otherwise hold back until this one has gone.
     */
    closeAtOnce?: boolean;
    children: React.ReactNode;
}

/**
 * The one bottom sheet: a page-coloured panel with rounded top corners and a grabber, sliding up
 * over a dimmed backdrop (`BottomSheetModal`). Its title sits centred under the grabber, and the
 * whole sheet pulls down except its `SheetScrollView` and `SheetNoDrag` parts. Its header, padding
 * and height limit are the same on every screen.
 */
export function AppSheet({
    visible,
    onClose,
    title,
    subtitle,
    headerLeft,
    headerRight,
    avoidKeyboard = false,
    swipeEnabled = true,
    overlay,
    overlayPlacement = 'center',
    maxHeight = '88%',
    sheetStyle,
    backdropLabel,
    onDismiss,
    closeAtOnce,
    children,
}: AppSheetProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const covered = Boolean(overlay);
    return (
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            avoidKeyboard={avoidKeyboard}
            swipeEnabled={swipeEnabled && !covered}
            accessibilityViewIsModal={!covered}
            backdropHidden={covered}
            backdropLabel={backdropLabel}
            onDismiss={onDismiss}
            title={title}
            subtitle={subtitle}
            headerLeft={headerLeft}
            headerRight={headerRight}
            closeAtOnce={closeAtOnce}
            sheetStyle={[
                styles.sheet,
                { maxHeight, backgroundColor: colors.bgPrimary, paddingBottom: Math.max(insets.bottom, Spacing.md) },
                sheetStyle,
            ]}
            overlay={overlay ? (
                // Its own keyboard avoidance: an absolutely placed layer ignores the padding the
                // sheet's container takes for the keyboard, so a picker's field would sit under it.
                <KeyboardAvoidingView
                    style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.scrim }, overlayPlacement === 'bottom' && styles.overlayBottom]}
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
        width: '100%',
        maxWidth: 680,
        alignSelf: 'center',
        borderTopLeftRadius: Radius.sheet,
        borderTopRightRadius: Radius.sheet,
        paddingHorizontal: Spacing.lg,
        ...Shadow.floating,
    },
    content: { flexShrink: 1 },
    overlay: { justifyContent: 'center', paddingHorizontal: Spacing.lg },
    overlayBottom: { justifyContent: 'flex-end', paddingHorizontal: 0 },
});
