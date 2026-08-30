import React, { useEffect, useState } from 'react';
import {
    Stack,
    useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Platform,
    View,
    StyleSheet,
    useColorScheme,
} from 'react-native';
import { Text } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
    ThemeColorsProvider,
    schemeColors,
    useThemeColors,
    useThemeScheme,
    type ColorScheme,
    type ResolvedScheme,
} from '../constants/theme';
import { getDB, initWebDb, isPrimaryTab } from '../lib/db';
import { DialogHost } from '../components/DialogHost';
import { SplashFallback } from '../components/SplashFallback';
import { AppProvider, useApp } from '../contexts/AppContext';
import { useI18n, useSystemI18n } from '../hooks/useI18n';
import { useHideSplashWhenReady } from '../hooks/useSplashScreen';
import { isStudyReminderData } from '../lib/studyNotifications';
import { CatalogScreen } from './catalog';

const CATALOG_OFFER_SEEN_KEY = 'bka_catalog_offer_seen_v1';

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

/**
 * Startup failures render before (or instead of) the theme provider, so they resolve their own
 * palette from the OS scheme and release the splash themselves -- otherwise the launch screen
 * would sit on top of the message forever.
 */
function StartupErrorView({
    icon,
    title,
    message,
    onRetry,
    retryLabel,
}: {
    icon: string;
    title: string;
    message: string;
    onRetry: () => void;
    retryLabel: string;
}) {
    const scheme: ResolvedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
    const styles = React.useMemo(() => createErrorStyles(schemeColors(scheme)), [scheme]);
    useHideSplashWhenReady(true);

    return (
        <View style={styles.container}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            <TouchableOpacity style={styles.button} onPress={onRetry}>
                <Text style={styles.buttonText}>{retryLabel}</Text>
            </TouchableOpacity>
        </View>
    );
}

function LocalizedErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { t } = useSystemI18n();
    return (
        <StartupErrorView
            icon="⚠️"
            title={t('root.errorTitle')}
            message={message}
            onRetry={onRetry}
            retryLabel={t('common.retry')}
        />
    );
}

function createErrorStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.bgPrimary,
            padding: 32,
        },
        icon: { fontSize: 48, marginBottom: 16 },
        title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
        message: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
        button: {
            backgroundColor: colors.accent,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
        },
        buttonText: { fontSize: 16, fontWeight: '600', color: colors.white },
        secondaryBar: { backgroundColor: colors.badgeNewBg, paddingVertical: 6, paddingHorizontal: 12 },
        secondaryBarText: { fontSize: 12, color: colors.badgeNew, textAlign: 'center' },
    });
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
        return (
            <StartupErrorView
                icon="⚠️"
                title={t('root.databaseError')}
                message={error}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    setError(null);
                    setReady(false);
                    initWebDb()
                        .then(() => setReady(true))
                        .catch((e2) => setError(e2 instanceof Error ? e2.message : String(e2)));
                }}
            />
        );
    }

    // Web only in practice: on native `ready` starts true. There is no native splash on web,
    // so this branch keeps a label while sql.js loads.
    if (!ready) return <SplashFallback label={t('common.loading')} />;

    return (
        <>
            {Platform.OS === 'web' && !isPrimaryTab() && <SecondaryTabBar label={t('root.secondaryTab')} />}
            {children}
        </>
    );
}

/** Web-only banner shown in duplicate tabs, which share one database and cannot both write. */
function SecondaryTabBar({ label }: { label: string }) {
    const scheme: ResolvedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
    const styles = React.useMemo(() => createErrorStyles(schemeColors(scheme)), [scheme]);
    return (
        <View style={styles.secondaryBar}>
            <Text style={styles.secondaryBarText}>{label}</Text>
        </View>
    );
}

/** Resolves the persisted themeMode against the OS scheme; must sit inside AppProvider. */
function ThemeGate({ children }: { children: React.ReactNode }) {
    const { settings } = useApp();
    return <ThemeColorsProvider mode={settings.themeMode}>{children}</ThemeColorsProvider>;
}

/** Hold route screens until database/receipt reconciliation, then show the one-time freemium
 * offer. The learner can explicitly choose the 1,200-card trial without purchasing. */
function CatalogGate({ children }: { children: React.ReactNode }) {
    const { isLoading, startupError, catalogAccess } = useApp();
    const [offerChecked, setOfferChecked] = useState(false);
    const [showInitialOffer, setShowInitialOffer] = useState(false);

    useEffect(() => {
        if (isLoading || startupError || catalogAccess.status === 'loading') return;
        if (catalogAccess.hasAccess) {
            setShowInitialOffer(false);
            setOfferChecked(true);
            return;
        }
        const seen = getDB().getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            CATALOG_OFFER_SEEN_KEY,
        )?.value === 'true';
        setShowInitialOffer(!seen);
        setOfferChecked(true);
    }, [isLoading, startupError, catalogAccess.status, catalogAccess.hasAccess]);

    const continueWithTrial = () => {
        getDB().runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            CATALOG_OFFER_SEEN_KEY,
            'true',
        );
        setShowInitialOffer(false);
    };
    // Do not mount route screens until migrations and the one-time catalog replacement finish;
    // several screens read SQLite in state initializers and a fresh web/native install has no
    // tables before startup completes.
    const stillPreparing = isLoading
        || (!startupError && (catalogAccess.status === 'loading' || !offerChecked));

    // This is the last gate before real content, so it owns the splash handover.
    useHideSplashWhenReady(!stillPreparing);

    if (stillPreparing) return <SplashFallback />;
    if (!startupError && showInitialOffer && !catalogAccess.hasAccess) {
        return <CatalogScreen embedded onContinueTrial={continueWithTrial} />;
    }
    return children;
}

/** Renders the navigator + DialogHost; lives inside ThemeGate so it can read live theme colors. */
function AppStack() {
    const router = useRouter();
    const colors = useThemeColors();
    const scheme = useThemeScheme();
    const { t, l } = useI18n();

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
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bgPrimary },
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
                        presentation: 'modal',
                        headerShown: true,
                        title: t('root.cardInfo'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="import"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: t('root.import'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="export"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: l('Dışa Aktar', 'Export'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="backups"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: t('root.backups'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="note-types"
                    options={{
                        presentation: 'modal',
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
            {/* Required by react-native-gesture-handler; every native gesture below is
                registered against this root. */}
            <GestureHandlerRootView style={rootStyles.root}>
                <SafeAreaProvider>
                    <WebDbGate>
                        <AppProvider>
                            <ThemeGate>
                                <CatalogGate>
                                    <AppStack />
                                </CatalogGate>
                            </ThemeGate>
                        </AppProvider>
                    </WebDbGate>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </AppErrorBoundary>
    );
}

const rootStyles = StyleSheet.create({ root: { flex: 1 } });
