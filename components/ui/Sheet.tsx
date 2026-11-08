import React from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import BottomSheetModal from '../BottomSheetModal';
import { Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { CloseButton } from './Button';
import { Radius, Type } from './tokens';

interface SheetHeaderProps {
    title: string;
    subtitle?: string;
    /** Shows a close button; leave it out for a sheet the grabber and backdrop close. */
    onClose?: () => void;
    /** A rule under the header, for a form whose fields scroll under it. */
    divided?: boolean;
}

/** The title block at the top of every bottom sheet. */
export function SheetHeader({ title, subtitle, onClose, divided = false }: SheetHeaderProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    return (
        <View style={[styles.header, divided && [styles.headerDivided, { borderBottomColor: colors.border }]]}>
            <View style={styles.headerCopy}>
                <Text style={[Type.title, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={2}>{title}</Text>
                {subtitle ? <Text style={[Type.caption, { color: colors.textMuted }]}>{subtitle}</Text> : null}
            </View>
            {onClose ? <View style={styles.close}><CloseButton accessibilityLabel={l('Kapat', 'Close')} onPress={onClose} /></View> : null}
        </View>
    );
}

interface AppSheetProps {
    visible: boolean;
    onClose: () => void;
    /** Drawn as a `SheetHeader`; leave it out when the content draws its own heading. */
    title?: string;
    subtitle?: string;
    /** Puts a close button in the header (forms with a Save action). */
    closeButton?: boolean;
    /** A rule under the header, for a form whose fields scroll under it. */
    dividedHeader?: boolean;
    /** Lift the sheet above the keyboard while one of its fields has focus. */
    avoidKeyboard?: boolean;
    /** Whether the grabber and pull-down close it (off while work runs that must not be left). */
    swipeEnabled?: boolean;
    /**
     * A picker drawn over the whole sheet on its own dimmed layer. The sheet under it is hidden from
     * VoiceOver and cannot be pulled down while it is up.
     */
    overlay?: React.ReactNode;
    /** The sheet's height limit; 88% of the screen by default. */
    maxHeight?: `${number}%`;
    /** Extra style for the sheet surface, e.g. a fixed height for a long list. */
    sheetStyle?: StyleProp<ViewStyle>;
    backdropLabel?: string;
    children: React.ReactNode;
}

/**
 * The one bottom sheet: a page-coloured panel with rounded top corners and a grabber, sliding up
 * over a dimmed backdrop (`BottomSheetModal`). Its header, padding and height limit are the same
 * on every screen.
 */
export function AppSheet({
    visible,
    onClose,
    title,
    subtitle,
    closeButton = false,
    dividedHeader = false,
    avoidKeyboard = false,
    swipeEnabled = true,
    overlay,
    maxHeight = '88%',
    sheetStyle,
    backdropLabel,
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
            sheetStyle={[
                styles.sheet,
                { maxHeight, backgroundColor: colors.bgPrimary, paddingBottom: Math.max(insets.bottom, Spacing.md) },
                sheetStyle,
            ]}
            overlay={overlay ? (
                // Its own keyboard avoidance: an absolutely placed layer ignores the padding the
                // sheet's container takes for the keyboard, so a picker's field would sit under it.
                <KeyboardAvoidingView
                    style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.scrim }]}
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
                {title ? (
                    <SheetHeader
                        title={title}
                        subtitle={subtitle}
                        onClose={closeButton ? onClose : undefined}
                        divided={dividedHeader}
                    />
                ) : null}
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
        // The grabber's 40-point strip at the top takes every touch in it; content starts below.
        paddingTop: 44,
        ...Shadows.lg,
    },
    content: { flexShrink: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    headerDivided: { paddingBottom: Spacing.md, marginBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    close: { marginRight: -10 },
    overlay: { justifyContent: 'center', paddingHorizontal: Spacing.lg },
});
