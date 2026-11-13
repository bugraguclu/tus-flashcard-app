import React, { useEffect, useState } from 'react';
import { Stack, router as globalRouter, useNavigationContainerRef, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
    ActivityIndicator,
    Appearance,
    Image,
    Linking,
    Platform,
    View,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../components/ui/Button';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '../components/ui/icons';
import { Radius, Type } from '../components/ui/tokens';
import { CopyGlyph, ShieldAlertGlyph } from '../components/UiGlyphs';
import {
    Colors,
    DARK_MODE_UI_ENABLED,
    FontSize,
    Shadows,
    Spacing,
    ThemeColorsProvider,
    useIsDarkTheme,
    useThemeColors,
} from '../constants/theme';
import { initWebDb, isPrimaryTab, isStorageReadError } from '../lib/db';
import { DialogHost } from '../components/DialogHost';
import { AppProvider, useAppSettings, useStartupStatus } from '../contexts/AppContext';
import { useI18n, useSystemI18n } from '../hooks/useI18n';
import { onStudyReminderOpened } from '../lib/studyNotifications';
import { onStopwatchAlertOpened } from '../lib/stopwatchNotifications';
import { inferImportFileType } from '../lib/importFile';
import { parseExternalAppUrl } from '../lib/externalLinking';
import { externalActionRoute } from '../lib/externalActionRoute';
import WebAppIntegrations from '../components/WebAppIntegrations';
import { TextScaleProvider } from '../components/AppText';
import { textSizeMultiplier } from '../lib/textScale';
import { userFacingErrorMessage } from '../lib/userFacingError';
// Imported here, ahead of the router, so its `popstate` listener is added before the router's.
import '../lib/webPopStateGuard';

const APP_MARK = require('../assets/app-mark.png');

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
                    <ShieldAlertGlyph color={Colors.accent} size={38} />
                </View>
                <Text style={errorStyles.title}>{t('root.errorTitle')}</Text>
                <Text style={errorStyles.message}>{safeMessage}</Text>

                <View style={errorStyles.buttonGroup}>
                    <Button label={t('common.retry')} onPress={onRetry} />
                    <Button label={t('root.returnHome')} variant="secondary" onPress={handleReturnHome} />
                </View>

                <Button
                    label={showDetails
                        ? l('Teknik detayları gizle', 'Hide technical details')
                        : l('Teknik detayları göster', 'Show technical details')}
                    icon={showDetails
                        ? <ChevronUpIcon color={Colors.textMuted} size={14} />
                        : <ChevronDownIcon color={Colors.textMuted} size={14} />}
                    variant="plain"
                    tone="muted"
                    size="compact"
                    onPress={() => setShowDetails(!showDetails)}
                    accessibilityLabel={t('root.technicalDetails')}
                    style={errorStyles.detailsToggle}
                />

                {showDetails && (
                    <View style={errorStyles.detailsBox}>
                        <ScrollView style={errorStyles.detailsScroll} nestedScrollEnabled>
                            <Text style={errorStyles.detailsText} selectable>
                                {message}
                                {componentStack ? `\n\nComponent Stack:\n${componentStack}` : ''}
                            </Text>
                        </ScrollView>
                        <View style={errorStyles.copyRow}>
                            <Button
                                label={copied ? t('root.errorCopied') : t('root.copyError')}
                                icon={copied
                                    ? <CheckIcon color={Colors.accent} size={15} />
                                    : <CopyGlyph color={Colors.textSecondary} size={15} />}
                                variant="plain"
                                tone={copied ? 'accent' : 'muted'}
                                size="compact"
                                onPress={handleCopyDetails}
                                accessibilityLabel={t('root.copyError')}
                            />
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
}

// The error screens sit outside the theme provider (they must survive a crash in it), so they draw
// with the static light palette; the shared Button reads that same palette there.
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
        borderRadius: Radius.card,
        padding: Spacing.xxl,
        alignItems: 'center',
        ...Shadows.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.border,
    },
    iconBadge: {
        width: 72,
        height: 72,
        borderRadius: Radius.pill,
        backgroundColor: Colors.infoBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    appMark: { width: 72, height: 72 },
    title: {
        ...Type.title,
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
    detailsToggle: {
        marginTop: Spacing.md,
    },
    detailsBox: {
        width: '100%',
        marginTop: Spacing.md,
        backgroundColor: Colors.bgSecondary,
        borderRadius: Radius.inset,
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
    copyRow: {
        alignItems: 'center',
        marginTop: Spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.border,
    },
    secondaryBar: { backgroundColor: Colors.infoBg, paddingVertical: 6, paddingHorizontal: 12 },
    secondaryBarText: { ...Type.caption, color: Colors.info, textAlign: 'center' },
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
                console.error('[WebDbGate] initWebDb failed:', e);
                setError(isStorageReadError(e)
                    ? t('root.storageReadError')
                    : e instanceof Error ? e.message : String(e));
            });
    }, []);

    if (error) {
        const safeMessage = userFacingErrorMessage(error, t('common.genericError'));
        return (
            <View style={errorStyles.container}>
                <View style={errorStyles.card}>
                    <View style={errorStyles.iconBadge}>
                        <ShieldAlertGlyph color={Colors.accent} size={38} />
                    </View>
                    <Text style={errorStyles.title}>{t('root.databaseError')}</Text>
                    <Text style={errorStyles.message}>{safeMessage}</Text>
                    <View style={errorStyles.buttonGroup}>
                        <Button
                            label={t('common.retry')}
                            // sql.js keeps a failed WebAssembly start for the life of the page, so a
                            // second attempt in place fails at once; a reload starts everything afresh.
                            onPress={() => window.location.reload()}
                        />
                    </View>
                </View>
            </View>
        );
    }

    if (!ready) {
        return (
            <View style={errorStyles.container}>
                <Image source={APP_MARK} style={errorStyles.appMark} accessibilityIgnoresInvertColors />
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

/** Applies the current system/light/dark preference and the text size to every screen. */
function ThemeGate({ children }: { children: React.ReactNode }) {
    const { settings } = useAppSettings();
    const activeMode = DARK_MODE_UI_ENABLED ? settings.themeMode : 'light';
    const textMultiplier = textSizeMultiplier(settings.textSizeLevel);

    // Our palette only covers what this app draws. Keyboards, native form sheets, scroll
    // indicators and the status bar follow the process-wide trait instead, so an explicit
    // Light/Dark preference has to reach UIKit as well — otherwise a dark collection is
    // reviewed with a white keyboard over it. 'system' clears the override.
    useEffect(() => {
        if (Platform.OS === 'web') return;
        // React Native 0.86 replaced `null` with 'unspecified' as the value that clears the override.
        Appearance.setColorScheme(activeMode === 'system' ? 'unspecified' : activeMode);
    }, [activeMode]);

    return (
        <ThemeColorsProvider mode={activeMode}>
            <TextScaleProvider multiplier={textMultiplier}>{children}</TextScaleProvider>
        </ThemeColorsProvider>
    );
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
    const isDarkTheme = useIsDarkTheme();
    const { t, locale } = useI18n();

    // The page's own chrome — scroll bars, native date and time inputs, the mobile address bar and
    // an installed app's title bar — follows the app's Light/Dark/System choice, as UIKit does on
    // iPhone, rather than the system scheme the static page could only guess from.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        document.documentElement.style.colorScheme = isDarkTheme ? 'dark' : 'light';
        document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
            meta.setAttribute('content', colors.bgPrimary);
        });
    }, [colors.bgPrimary, isDarkTheme]);

    // The static page is served as Turkish; once English is chosen, screen readers, hyphenation
    // and the browser's translate offer need the document language to say so.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        document.documentElement.lang = locale;
    }, [locale]);

    // The only handler for file hand-offs and x-callback actions: `app/+native-intent.tsx` keeps
    // Expo Router from also reading these URLs as screen addresses.
    useEffect(() => {
        if (Platform.OS === 'web') return;
        let active = true;
        const openIncomingUrl = (url: string | null) => {
            if (!active || !url) return;
            const externalAction = parseExternalAppUrl(url);
            if (externalAction) {
                const route = externalActionRoute(externalAction);
                if (route) router.push(route as any);
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

    // The web build takes reminder clicks in WebAppIntegrations, which is mounted below.
    useEffect(() => {
        if (Platform.OS !== 'ios') return undefined;
        return onStudyReminderOpened(() => router.replace('/decks' as any));
    }, [router]);

    // A Kronometre block reminder brings the stopwatch to the front, unless it already is.
    const navigationRef = useNavigationContainerRef();
    useEffect(() => onStopwatchAlertOpened(() => {
        const current = navigationRef.getCurrentRoute() as { name?: string } | undefined;
        if (current?.name !== 'stopwatch') router.push('/stopwatch' as any);
    }), [router, navigationRef]);

    return (
        <>
            {/* Follows the theme the app resolved rather than iOS ("auto"): the in-app Light/Dark
                choice can differ from the system appearance, and the clock has to stay legible on
                the page that is actually drawn. */}
            <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
            {Platform.OS === 'web' ? <WebAppIntegrations /> : null}
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
                    name="study-calendar"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="stopwatch"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="study-analysis"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="study-plans"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="study-plan-wizard"
                    options={{
                        presentation: 'card',
                        gestureEnabled: true,
                        headerShown: false,
                    }}
                />
                <Stack.Screen
                    name="study-clear"
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
                        // The screen draws its own title and back control. A native header on top
                        // of that repeated both and pushed the first section under the bar.
                        headerShown: false,
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
            {/* The browser tab and shared links name the app; the static pages carry it as well. */}
            {Platform.OS === 'web' ? (
                <Head>
                    <title>TusAnkiM</title>
                </Head>
            ) : null}
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
