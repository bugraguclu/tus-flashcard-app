import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { registerDialogHost, type DialogRequest } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';
import { Button } from './ui/Button';
import { Radius, Type } from './ui/tokens';

/**
 * Web dialog surface for confirm()/alert()/choose(). iPhone keeps the native Apple alert surface
 * so dialogs can safely appear above routed sheets and nested modals; all text is sanitized.
 */
export function DialogHost() {
    const { t } = useI18n();
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [request, setRequest] = useState<DialogRequest | null>(null);
    // The slots around the two buttons: the kit's Button takes no ref, and on web each slot is the
    // DOM node that holds the focusable button.
    const cancelButtonRef = useRef<View>(null);
    const acceptButtonRef = useRef<View>(null);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        return registerDialogHost(setRequest);
    }, []);

    // Keyboard focus rests on a button, so Enter answers the dialog the way its buttons read:
    // Cancel for a destructive question, the main action otherwise. The modal's focus trap puts
    // focus on the first element that takes it — the backdrop, whose press dismisses — both when
    // the dialog opens and whenever focus is pulled outside (a closing menu hands it back to its
    // opener), so each time the backdrop or the card receives it, it is moved on after the trap.
    const preferredButton = (): HTMLElement | null => {
        const preferCancel = request?.destructive && request.kind !== 'alert';
        const slot = ((preferCancel ? cancelButtonRef.current : null) ?? acceptButtonRef.current) as unknown as HTMLElement | null;
        return slot?.querySelector?.<HTMLElement>('button, [role="button"]') ?? null;
    };
    const moveFocusToPreferredButton = (event: { target: unknown; currentTarget: unknown }) => {
        // Focus reaching a button bubbles through here too; only the surface itself is moved on.
        if (event.target !== event.currentTarget) return;
        requestAnimationFrame(() => preferredButton()?.focus?.());
    };

    useEffect(() => {
        if (!request || Platform.OS !== 'web') return undefined;
        let frame = 0;
        let attempts = 0;
        // The modal mounts its content a frame or two after it opens, so the button is looked
        // for until it exists.
        const focusWhenMounted = () => {
            const button = preferredButton();
            if (button?.focus) {
                button.focus();
                return;
            }
            attempts += 1;
            if (attempts < 10) frame = requestAnimationFrame(focusWhenMounted);
        };
        frame = requestAnimationFrame(focusWhenMounted);
        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request]);

    if (!request) return null;

    const isConfirm = request.kind === 'confirm';
    const isChoice = request.kind === 'choice';
    const close = () => setRequest(null);
    const accept = () => {
        close();
        request.onAccept?.();
    };
    const cancel = () => {
        close();
        request.onCancel?.();
    };
    const dismiss = isChoice ? undefined : isConfirm ? cancel : accept;
    const icon = request.destructive ? '!' : isConfirm ? '?' : 'i';

    // Alerts have a single button, so dismissing (Escape / back) must still run the
    // callback — e.g. a success alert that navigates back. Confirms treat dismiss as cancel.
    return (
        <Modal
            transparent
            visible
            animationType="fade"
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={dismiss ?? (() => undefined)}
        >
            <Pressable
                style={[styles.backdrop, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}
                onPress={dismiss}
                // A click outside still dismisses; the keyboard only ever stops on the buttons.
                tabIndex={-1}
                onFocus={moveFocusToPreferredButton}
            >
                <Pressable
                    style={styles.card}
                    onPress={(event) => event.stopPropagation()}
                    tabIndex={-1}
                    onFocus={moveFocusToPreferredButton}
                    accessibilityViewIsModal
                    accessibilityRole="alert"
                >
                    <View style={[styles.iconCircle, request.destructive && styles.iconCircleDestructive]}>
                        <Text style={[styles.iconText, request.destructive && styles.iconTextDestructive]}>{icon}</Text>
                    </View>
                    <Text style={styles.title}>{request.title}</Text>
                    <ScrollView
                        style={styles.messageScroll}
                        contentContainerStyle={styles.messageContent}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                    >
                        <Text style={styles.message}>{request.message}</Text>
                    </ScrollView>
                    <View style={[styles.actions, request.stacked && styles.stackedActions]}>
                        {(isConfirm || isChoice) && (
                            <View ref={cancelButtonRef} style={[styles.buttonSlot, request.stacked && styles.stackedSlot]}>
                                <Button label={request.cancelLabel ?? t('common.cancel')} variant="secondary" onPress={cancel} />
                            </View>
                        )}
                        <View ref={acceptButtonRef} style={[styles.buttonSlot, request.stacked && styles.stackedSlot]}>
                            <Button
                                label={request.acceptLabel ?? t('common.ok')}
                                variant={request.destructive ? 'destructive' : 'primary'}
                                onPress={accept}
                            />
                        </View>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: colors.scrim,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: Spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.bgCard,
            borderRadius: Radius.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderLight,
            padding: Spacing.xxl,
            alignItems: 'center',
            ...Shadows.lg,
        },
        iconCircle: {
            width: 44,
            height: 44,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
            marginBottom: Spacing.lg,
        },
        iconCircleDestructive: { backgroundColor: colors.dangerBg },
        iconText: { fontSize: FontSize.xl, fontWeight: '800', color: colors.accent },
        iconTextDestructive: { color: colors.danger },
        title: {
            ...Type.title,
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: Spacing.sm,
        },
        messageScroll: { maxHeight: 220, alignSelf: 'stretch' },
        messageContent: { paddingBottom: Spacing.xl },
        message: { ...Type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
        actions: { flexDirection: 'row', alignSelf: 'stretch', gap: Spacing.md },
        stackedActions: { flexDirection: 'column' },
        buttonSlot: { flex: 1 },
        stackedSlot: { flex: 0 },
    });
}
