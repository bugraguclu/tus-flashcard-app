import React, { useEffect, useState } from 'react';
import { Stack, router as globalRouter, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
    ActivityIndicator,
    Appearance,
    Linking,
    Platform,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Svg, { Circle, Path } from 'react-native-svg';
import {
    BorderRadius,
    Colors,
    DARK_MODE_UI_ENABLED,
    FontSize,
    Shadows,
    Spacing,
    ThemeColorsProvider,
    useThemeColors,
} from '../constants/theme';
import { initWebDb, isPrimaryTab } from '../lib/db';
import { DialogHost } from '../components/DialogHost';
import { AppProvider, useAppSettings, useStartupStatus } from '../contexts/AppContext';
import { useI18n, useSystemI18n } from '../hooks/useI18n';
import { isStudyReminderData } from '../lib/studyNotifications';
import { inferImportFileType } from '../lib/importFile';
import { parseExternalAppUrl } from '../lib/externalLinking';
import { getAllNoteTypes } from '../lib/noteManager';
import { getDeckByName } from '../lib/deckManager';
import { userFacingErrorMessage } from '../lib/userFacingError';

// Hold the native splash until a real screen can paint. Without this it disappears the moment
// the JS bundle mounts — long before migrations finish — so a cold launch shows the launch
// image, then a blank frame, then a placeholder, before any content exists. Called in global
// scope (not an effect) because by the first render the splash may already be gone.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 250, fade: true });

// Startup is normally over well inside this budget and the handover is a single fade. A first
// install or a large migration can outlast it; rather than hold a frozen launch image, hand off
// to a matching in-app surface that can at least show progress.
const SPLASH_GRACE_MS = 1500;

// Expo's default web template pins html/body/#root to 100% height; without it every
// ScrollView/FlatList on web computes a 0px viewport — content still paints (overflow)
// but nothing can scroll, so long lists appear cut off at the first screenful.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = 'html, body, #root { height: 100%; } body { overflow: hidden; }';
    document.head.appendChild(style);
}

function ErrorAlertShieldIcon({ color, size = 40 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path d="M12 8v4" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
            <Circle cx={12} cy={16} r={1.2} fill={color} />
        </Svg>
    );
}

function ErrorCopyIcon({ color, size = 15 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path
                d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function ErrorCheckIcon({ color, size = 15 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path
                d="m5 12 5 5L20 7"
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

class AppErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: string; componentStack: string }
> {
    state = { hasError: false, error: '', componentStack: '' };

    static getDerivedStateFromError(error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { hasError: true, error: msg };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[AppErrorBoundary]', error, errorInfo);
        // A crash during startup would otherwise sit behind the launch image forever.
        hideSplash();
        if (errorInfo?.componentStack) {
            this.setState({ componentStack: errorInfo.componentStack });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <LocalizedErrorFallback
                    message={this.state.error}
                    componentStack={this.state.componentStack}
                    onRetry={() => this.setState({ hasError: false, error: '', componentStack: '' })}
                />
            );
        }
        return this.props.children;
    }
}

function LocalizedErrorFallback({
    message,
    componentStack,
    onRetry,
}: {
    message: string;
    componentStack?: string;
    onRetry: () => void;
}) {
    const { t, l } = useSystemI18n();
    const insets = useSafeAreaInsets();
    const [showDetails, setShowDetails] = useState(false);
    const [copied, setCopied] = useState(false);
    const safeMessage = userFacingErrorMessage(message, t('root.errorDescription'));

    const handleReturnHome = () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try {
                window.location.href = '/';
                return;
            } catch {
                // A blocked navigation still leaves the in-app reset below to fall back on.
            }
        }
        // The crash usually came from the screen that is still on the stack, so returning home
        // has to unwind the navigation state first. Without this the button only clears the
        // boundary and re-renders the same broken screen, which is what Retry already does.
        // The imperative router is used instead of the hook so a navigator that failed during
        // startup cannot take the fallback screen down with it.
        try {
            globalRouter.dismissAll();
        } catch {
            // Nothing was stacked above the tabs.
        }
        try {
            globalRouter.replace('/decks' as never);
        } catch {
            // The navigator never mounted; clearing the boundary is all that is left.
        }
        onRetry();
    };

    const handleCopyDetails = async () => {
        try {
            const report = `[TusAnkiM Error Report]\nMessage: ${message}\nStack: ${componentStack || 'N/A'}`;
            await Clipboard.setStringAsync(report);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Ignore clipboard errors
        }
    };

    return (
        <View style={[errorStyles.container, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={errorStyles.card}>
                <View style={errorStyles.iconBadge}>
                    <ErrorAlertShieldIcon color={Colors.accent} size={38} />
                </View>
                <Text style={errorStyles.title}>{t('root.errorTitle')}</Text>
                <Text style={errorStyles.message}>{safeMessage}</Text>

                <View style={errorStyles.buttonGroup}>
                    <TouchableOpacity
                        style={errorStyles.primaryButton}
                        onPress={onRetry}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.retry')}
                    >
                        <Text style={errorStyles.primaryButtonText}>{t('common.retry')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={errorStyles.secondaryButton}
                        onPress={handleReturnHome}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={t('root.returnHome')}
                    >
                        <Text style={errorStyles.secondaryButtonText}>{t('root.returnHome')}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={errorStyles.detailsToggle}
                    onPress={() => setShowDetails(!showDetails)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('root.technicalDetails')}
                >
                    <Text style={errorStyles.detailsToggleText}>
                        {showDetails
                            ? l('Teknik detayları gizle ▴', 'Hide technical details ▴')
                            : l('Teknik detayları göster ▾', 'Show technical details ▾')}
                    </Text>
                </TouchableOpacity>

                {showDetails && (
                    <View style={errorStyles.detailsBox}>
                        <ScrollView style={errorStyles.detailsScroll} nestedScrollEnabled>
                            <Text style={errorStyles.detailsText} selectable>
                                {message}
                                {componentStack ? `\n\nComponent Stack:\n${componentStack}` : ''}
                            </Text>
                        </ScrollView>
                        <TouchableOpacity
                            style={errorStyles.copyButton}
                            onPress={handleCopyDetails}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={t('root.copyError')}
                        >
                            {copied ? (
                                <>
                                    <ErrorCheckIcon color={Colors.accent} size={15} />
                                    <Text style={errorStyles.copyButtonTextCopied}>{t('root.errorCopied')}</Text>
                                </>
                            ) : (
                                <>
                                    <ErrorCopyIcon color={Colors.textSecondary} size={15} />
                                    <Text style={errorStyles.copyButtonText}>{t('root.copyError')}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
}

const errorStyles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.bgPrimary,
        paddingHorizontal: Spacing.xl,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
        alignItems: 'center',
        ...Shadows.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.border,
    },
    iconBadge: {
        width: 72,
        height: 72,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.badgeNewBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: FontSize.xl,
        fontWeight: '700',
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: Spacing.sm,
        letterSpacing: -0.3,
    },
    message: {
        fontSize: FontSize.md,
        lineHeight: 22,
        color: Colors.textMuted,
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    buttonGroup: {
        width: '100%',
        gap: Spacing.sm,
    },
    primaryButton: {
        backgroundColor: Colors.accent,
        paddingVertical: 14,
        paddingHorizontal: Spacing.xl,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.sm,
    },
    primaryButtonText: {
        fontSize: FontSize.md,
        fontWeight: '600',
        color: '#ffffff',
    },
    secondaryButton: {
        backgroundColor: Colors.bgSecondary,
        paddingVertical: 13,
        paddingHorizontal: Spacing.xl,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.border,
    },
    secondaryButtonText: {
        fontSize: FontSize.md,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    detailsToggle: {
        marginTop: Spacing.lg,
        paddingVertical: Spacing.xs,
    },
    detailsToggleText: {
        fontSize: FontSize.xs,
        fontWeight: '500',
        color: Colors.textMuted,
    },
    detailsBox: {
        width: '100%',
        marginTop: Spacing.md,
        backgroundColor: Colors.bgSecondary,
        borderRadius: BorderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.border,
        padding: Spacing.md,
    },
    detailsScroll: {
        maxHeight: 140,
    },
    detailsText: {
        fontSize: FontSize.xs,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: Spacing.sm,
        paddingTop: Spacing.xs,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.border,
    },
    copyButtonText: {
        fontSize: FontSize.xs,
        fontWeight: '500',
        color: Colors.textSecondary,
    },
    copyButtonTextCopied: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        color: Colors.accent,
    },
    secondaryBar: { backgroundColor: Colors.badgeNewBg, paddingVertical: 6, paddingHorizontal: 12 },
    secondaryBarText: { fontSize: 12, color: Colors.badgeNew, textAlign: 'center' },
});

// Routed utility screens behave as native iPhone sheets: UIKit owns the grabber, rounded
// surface and pull-down dismissal. Other platforms keep their existing modal presentation.
const dismissibleSheetPresentation = Platform.OS === 'ios'
    ? {
        presentation: 'formSheet' as const,
        sheetAllowedDetents: [1],
        sheetGrabberVisible: true,
    }
    : { presentation: 'modal' as const };

/** Idempotent: hideAsync rejects when the splash is already gone, which is not a failure. */
function hideSplash(): void {
    void SplashScreen.hideAsync().catch(() => undefined);
}

/**
 * Hands the screen over from the native splash exactly once, when a real surface is ready.
 * Every terminal state counts as ready — a startup failure must reach the user, not stay
 * hidden behind the launch image. Returns whether the splash has been released.
 */
function useSplashHandoff(ready: boolean): boolean {
    const [graceElapsed, setGraceElapsed] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setGraceElapsed(true), SPLASH_GRACE_MS);
        return () => clearTimeout(timer);
    }, []);

    const released = ready || graceElapsed;
    useEffect(() => {
        if (released) hideSplash();
    }, [released]);

    return released;
}

/**
 * Shown only when startup outlives the splash. It repeats the splash's own background so the
 * handover reads as the launch image gaining a spinner rather than as a second loading screen.
 */
function StartupProgress() {
    const colors = useThemeColors();
    const { t } = useSystemI18n();
    return (
        <View style={[errorStyles.container, { backgroundColor: colors.bgPrimary }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ fontSize: FontSize.md, color: colors.textMuted, marginTop: Spacing.lg }}>
                {t('common.loading')}
            </Text>
        </View>
    );
}

/** Ensures the web SQLite (sql.js) database is ready before any screen renders. */
function WebDbGate({ children }: { children: React.ReactNode }) {
    const { t } = useSystemI18n();
    const [ready, setReady] = useState(Platform.OS !== 'web');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (Platform.OS !== 'web') return;

        initWebDb()
            .then(() => setReady(true))
            .catch((e) => {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('[WebDbGate] initWebDb failed:', e);
                setError(msg);
            });
    }, []);

    if (error) {
        const safeMessage = userFacingErrorMessage(error, t('common.genericError'));
        return (
            <View style={errorStyles.container}>
                <View style={errorStyles.card}>
                    <View style={errorStyles.iconBadge}>
                        <Text style={{ fontSize: 32 }}>⚠️</Text>
                    </View>
                    <Text style={errorStyles.title}>{t('root.databaseError')}</Text>
                    <Text style={errorStyles.message}>{safeMessage}</Text>
                    <TouchableOpacity
                        style={errorStyles.primaryButton}
                        onPress={() => {
                            setError(null);
                            setReady(false);
                            initWebDb()
                                .then(() => setReady(true))
                                .catch((e2) => setError(e2 instanceof Error ? e2.message : String(e2)));
                        }}
                    >
                        <Text style={errorStyles.primaryButtonText}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!ready) {
        return (
            <View style={errorStyles.container}>
                <Text style={{ fontSize: 40 }}>🧠</Text>
                {/* Locale discovery differs between static rendering and the user's browser.
                    Keep the hydration placeholder language-neutral so React can attach without
                    replacing the security-hardened server document. */}
                <Text style={{ fontSize: FontSize.lg, color: Colors.textMuted, marginTop: Spacing.sm }}>TusAnkiM</Text>
            </View>
        );
    }

    return (
        <>
            {Platform.OS === 'web' && !isPrimaryTab() && (
                <View style={errorStyles.secondaryBar}>
                    <Text style={errorStyles.secondaryBarText}>
                        {t('root.secondaryTab')}
                    </Text>
                </View>
            )}
            {children}
        </>
    );
}

/** Applies the persisted system/light/dark preference to every theme-aware screen. */
function ThemeGate({ children }: { children: React.ReactNode }) {
    const { settings } = useAppSettings();
    const activeMode = DARK_MODE_UI_ENABLED ? settings.themeMode : 'light';

    // Our palette only covers what this app draws. Keyboards, native form sheets, scroll
    // indicators and the status bar follow the process-wide trait instead, so an explicit
    // Light/Dark preference has to reach UIKit as well — otherwise a dark collection is
    // reviewed with a white keyboard over it. 'system' clears the override.
    useEffect(() => {
        if (Platform.OS === 'web') return;
        Appearance.setColorScheme(activeMode === 'system' ? null : activeMode);
    }, [activeMode]);

    return <ThemeColorsProvider mode={activeMode}>{children}</ThemeColorsProvider>;
}

/**
 * Holds route screens until startup finishes. Several screens read SQLite in state initializers,
 * and a fresh install has no tables until migrations complete. Purchased content is installed
 * later, from the store screen, so this gate never waits on the network.
 */
function StartupGate({ children }: { children: React.ReactNode }) {
    const { isLoading, startupError } = useStartupStatus();
    const ready = !isLoading || Boolean(startupError);
    const splashReleased = useSplashHandoff(ready);

    if (ready) return children;
    // Still covered by the launch image: render nothing rather than a placeholder that would
    // be revealed for one frame during the fade.
    return splashReleased ? <StartupProgress /> : null;
}

/** Renders the navigator + DialogHost; lives inside ThemeGate so it can read live theme colors. */
function AppStack() {
    const router = useRouter();
    const colors = useThemeColors();
    const { t } = useI18n();

    useEffect(() => {
        if (Platform.OS === 'web') return;
        let active = true;
        const openIncomingUrl = (url: string | null) => {
            if (!active || !url) return;
            const externalAction = parseExternalAppUrl(url);
            if (externalAction?.kind === 'search') {
                router.push({ pathname: '/browser', params: { initialSearch: externalAction.query } } as any);
                return;
            }
            if (externalAction?.kind === 'addnote') {
                const noteType = getAllNoteTypes().find((entry) => (
                    entry.name.normalize('NFC').toLocaleLowerCase() === externalAction.noteTypeName.normalize('NFC').toLocaleLowerCase()
                ));
                const deck = getDeckByName(externalAction.deckName);
                if (!noteType || !deck || deck.isFiltered) {
                    console.warn('[Linking] add-note target not found:', externalAction.noteTypeName, externalAction.deckName);
                    return;
                }
                const fieldValues = noteType.fields.map((field) => externalAction.fields[field.name] ?? '');
                router.push({
                    pathname: '/editor',
                    params: {
                        deckId: String(deck.id),
                        noteTypeId: String(noteType.id),
                        question: fieldValues[0] ?? '',
                        answer: fieldValues[1] ?? '',
                        fieldValues: JSON.stringify(fieldValues),
                        tags: externalAction.tags.join(' '),
                        externalSuccessUrl: externalAction.successUrl ?? '',
                    },
                } as any);
                return;
            }
            if (!inferImportFileType(url)) return;
            router.push({ pathname: '/import', params: { incomingUri: url } } as any);
        };

        void Linking.getInitialURL()
            .then(openIncomingUrl)
            .catch((error) => console.warn('[Linking] initial URL failed:', error));
        const subscription = Linking.addEventListener('url', ({ url }) => openIncomingUrl(url));
        return () => {
            active = false;
            subscription.remove();
        };
    }, [router]);

    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        const openReminder = (response: Notifications.NotificationResponse | null) => {
            if (!response || !isStudyReminderData(response.notification.request.content.data)) return;
            router.replace('/decks' as any);
            Notifications.clearLastNotificationResponse();
        };

        let active = true;
        void Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                if (active) openReminder(response);
            })
            .catch((error) => console.warn('[Notifications] launch response failed:', error));
        const subscription = Notifications.addNotificationResponseReceivedListener(openReminder);
        return () => {
            active = false;
            subscription.remove();
        };
    }, [router]);

    return (
        <>
            <StatusBar style={DARK_MODE_UI_ENABLED ? 'auto' : 'dark'} />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bgPrimary },
                    // Screens left behind on the stack keep their state but stop rendering, so a
                    // collection invalidation only costs a re-render on the screen being looked
                    // at instead of on every editor, browser and stats screen still mounted.
                    freezeOnBlur: true,
                }}
            >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                    name="catalog"
                    options={{
                        presentation: 'fullScreenModal',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="browser"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="settings"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="stats"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="editor"
                    options={{
                        // The note editor is a complete work surface. A full-screen native
                        // presentation prevents iOS from turning it into a rounded page sheet
                        // and keeps nested dialogs (tags, attachments, formatting) attached to
                        // the active screen.
                        presentation: 'fullScreenModal',
                        gestureEnabled: false,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="card-info"
                    options={{
                        ...dismissibleSheetPresentation,
                        gestureEnabled: true,
                        gestureDirection: 'vertical',
                        headerShown: true,
                        title: t('root.cardInfo'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="import"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        gestureDirection: 'horizontal',
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="export"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        gestureDirection: 'horizontal',
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="backups"
                    options={{
                        // Backup management is a canonical full-screen workflow. Keep it out of
                        // a nested sheet so iOS owns the horizontal back gesture and the screen's
                        // own header provides the visible back affordance.
                        presentation: 'card',
                        gestureEnabled: true,
                        gestureDirection: 'horizontal',
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="empty-cards"
                    options={{
                        // Empty Cards can delete persisted cards, so it is a distinct route with
                        // native back navigation rather than a modal embedded in Decks.
                        presentation: 'card',
                        gestureEnabled: true,
                        gestureDirection: 'horizontal',
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="note-types"
                    options={{
                        ...dismissibleSheetPresentation,
                        gestureEnabled: true,
                        gestureDirection: 'vertical',
                        headerShown: true,
                        title: t('root.noteTypes'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="note-type"
                    options={{
                        headerShown: true,
                        title: t('root.editNoteType'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
            </Stack>
            <DialogHost />
        </>
    );
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <AppErrorBoundary>
                <WebDbGate>
                    <AppProvider>
                        <ThemeGate>
                            <StartupGate>
                                <AppStack />
                            </StartupGate>
                        </ThemeGate>
                    </AppProvider>
                </WebDbGate>
            </AppErrorBoundary>
        </SafeAreaProvider>
    );
}
