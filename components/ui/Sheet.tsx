import React from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheetModal from '../BottomSheetModal';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useSheetPresentation } from '../../hooks/useSheetPresentation';
import { SHEET_DIALOG_MAX_WIDTH, SHEET_MAX_WIDTH, sheetDialogMaxHeight } from '../../lib/sheetPresentation';
import { Button } from './Button';
import { Radius, Shadow } from './tokens';

interface AppSheetProps {
    visible: boolean;
    onClose: () => void;
    /**
     * Centred under the grabber; leave it out when the content draws its own heading. A sheet has
     * no close button: the grabber, a pull-down and the backdrop close it. On a wide window, where
     * the sheet is a dialog, the title sits at the leading edge beside a close button.
     */
    title?: string;
    subtitle?: string;
    /** A control at the header's start, e.g. Back in a sheet with a second step. */
    headerLeft?: React.ReactNode;
    /** A control at the header's end, e.g. the action that saves a recording. */
    headerRight?: React.ReactNode;
    /**
     * A Cancel that closes the sheet (through `onClose`) even while it cannot be pulled down, e.g.
     * a recording that asks before it is thrown away. On a phone it is a text button at the
     * header's start (unless `headerLeft` takes that place); on a wide window the dialog's close
     * button does its job, so no second control is drawn.
     */
    cancelLabel?: string;
    /** Fades the Cancel (and, on a wide window, the close button) while work runs. */
    cancelDisabled?: boolean;
    /** Lift the sheet above the keyboard while one of its fields has focus. */
    avoidKeyboard?: boolean;
    /**
     * Whether the grabber and pull-down close it (off while work runs that must not be left). On a
     * wide window, whether the dialog's close button does, unless a `cancelLabel` keeps it on.
     */
    swipeEnabled?: boolean;
    /**
     * A picker drawn over the whole sheet on its own dimmed layer. The sheet under it is hidden from
     * VoiceOver and cannot be pulled down while it is up.
     */
    overlay?: React.ReactNode;
    /** Where the overlay sits: centred (a picker card) or at the bottom edge (date and time wheels). */
    overlayPlacement?: 'center' | 'bottom';
    /** The sheet's height limit; 88% of the screen by default (a dialog stops at 86%). */
    maxHeight?: `${number}%`;
    /** Extra style for the sheet surface, e.g. a fixed height for a long list. */
    sheetStyle?: StyleProp<ViewStyle>;
    /** Spoken for the backdrop, and for the close button of the dialog a wide window shows. */
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
 *
 * On a wide window (desktop web, a tablet; `lib/sheetPresentation`) the same content is a dialog:
 * a card centred over the dimmed screen with `AppDialog`'s header, title at the leading edge and a
 * close button at the trailing one, and no grabber.
 */
export function AppSheet({
    visible,
    onClose,
    title,
    subtitle,
    headerLeft,
    headerRight,
    cancelLabel,
    cancelDisabled = false,
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
    const presentation = useSheetPresentation();
    const dialog = presentation === 'dialog';
    const covered = Boolean(overlay);
    const cancelOpen = Boolean(cancelLabel) && !cancelDisabled;
    const cancel = !dialog && cancelLabel ? (
        <Button label={cancelLabel} variant="plain" size="compact" tone="muted" onPress={onClose} disabled={cancelDisabled} />
    ) : undefined;
    return (
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            presentation={presentation}
            avoidKeyboard={avoidKeyboard}
            swipeEnabled={(dialog ? swipeEnabled || cancelOpen : swipeEnabled) && !covered}
            accessibilityViewIsModal={!covered}
            backdropHidden={covered}
            backdropLabel={backdropLabel}
            onDismiss={onDismiss}
            title={title}
            subtitle={subtitle}
            headerLeft={headerLeft ?? cancel}
            headerRight={headerRight}
            closeAtOnce={closeAtOnce}
            sheetStyle={[
                styles.sheet,
                dialog
                    ? [styles.dialog, { maxHeight: sheetDialogMaxHeight(maxHeight), backgroundColor: colors.bgPrimary }]
                    : { maxHeight, backgroundColor: colors.bgPrimary, paddingBottom: Math.max(insets.bottom, Spacing.md) },
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
        maxWidth: SHEET_MAX_WIDTH,
        alignSelf: 'center',
        borderTopLeftRadius: Radius.sheet,
        borderTopRightRadius: Radius.sheet,
        paddingHorizontal: Spacing.lg,
        ...Shadow.floating,
    },
    // A card like `AppDialog`'s: rounded all round, clear of the window's bottom edge.
    dialog: {
        maxWidth: SHEET_DIALOG_MAX_WIDTH,
        borderRadius: Radius.card,
        borderTopLeftRadius: Radius.card,
        borderTopRightRadius: Radius.card,
        paddingBottom: Spacing.lg,
    },
    content: { flexShrink: 1 },
    overlay: { justifyContent: 'center', paddingHorizontal: Spacing.lg },
    overlayBottom: { justifyContent: 'flex-end', paddingHorizontal: 0 },
});
