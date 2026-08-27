import React, { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
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
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
    Colors,
    DARK_MODE_UI_ENABLED,
    FontSize,
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

class AppErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: string }
> {
    state = { hasError: false, error: '' };

    static getDerivedStateFromError(error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { hasError: true, error: msg };
    }

    componentDidCatch(error: Error) {
        console.error('[AppErrorBoundary]', error);
        // A crash during startup would otherwise sit behind the launch image forever.
        hideSplash();
    }

    render() {
        if (this.state.hasError) {
            return (
                <LocalizedErrorFallback
                    message={this.state.error}
                    onRetry={() => this.setState({ hasError: false, error: '' })}
                />
            );
        }
        return this.props.children;
    }
}

function LocalizedErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { t } = useSystemI18n();
    const safeMessage = userFacingErrorMessage(message, t('root.startupErrorMessage'));
    return (
        <View style={errorStyles.container}>
            <Text style={errorStyles.icon}>⚠️</Text>
            <Text style={errorStyles.title}>{t('root.errorTitle')}</Text>
            <Text style={errorStyles.message}>{safeMessage}</Text>
            <TouchableOpacity style={errorStyles.button} onPress={onRetry}>
                <Text style={errorStyles.buttonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
        </View>
    );
}

const errorStyles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.bgPrimary,
        padding: 32,
    },
    icon: { fontSize: 48, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    message: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 24 },
    button: {
        backgroundColor: Colors.accent,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
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
                <Text style={errorStyles.icon}>⚠️</Text>
                <Text style={errorStyles.title}>{t('root.databaseError')}</Text>
                <Text style={errorStyles.message}>{safeMessage}</Text>
                <TouchableOpacity
                    style={errorStyles.button}
                    onPress={() => {
                        setError(null);
                        setReady(false);
                        initWebDb()
                            .then(() => setReady(true))
                            .catch((e2) => setError(e2 instanceof Error ? e2.message : String(e2)));
                    }}
                >
                    <Text style={errorStyles.buttonText}>{t('common.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!ready) {
        return (
            <View style={errorStyles.container}>
                <Text style={errorStyles.icon}>🧠</Text>
                {/* Locale discovery differs between static rendering and the user's browser.
                    Keep the hydration placeholder language-neutral so React can attach without
                    replacing the security-hardened server document. */}
                <Text style={{ fontSize: FontSize.lg, color: Colors.textMuted }}>TusAnkiM</Text>
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
                        ...dismissibleSheetPresentation,
                        gestureEnabled: true,
                        gestureDirection: 'vertical',
                        headerShown: true,
                        title: t('root.backups'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
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
        <AppErrorBoundary>
            <SafeAreaProvider>
                <WebDbGate>
                    <AppProvider>
                        <ThemeGate>
                            <StartupGate>
                                <AppStack />
                            </StartupGate>
                        </ThemeGate>
                    </AppProvider>
                </WebDbGate>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}
