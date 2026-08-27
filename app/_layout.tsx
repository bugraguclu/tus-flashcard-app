import React, { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Linking, Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
    Colors,
    DARK_MODE_UI_ENABLED,
    FontSize,
    ThemeColorsProvider,
    useThemeColors,
} from '../constants/theme';
import { initWebDb, isPrimaryTab } from '../lib/db';
import { DialogHost } from '../components/DialogHost';
import { AppProvider, useApp } from '../contexts/AppContext';
import { useI18n, useSystemI18n } from '../hooks/useI18n';
import { isStudyReminderData } from '../lib/studyNotifications';
import { inferImportFileType } from '../lib/importFile';
import { parseExternalAppUrl } from '../lib/externalLinking';
import { getAllNoteTypes } from '../lib/noteManager';
import { getDeckByName } from '../lib/deckManager';
import { userFacingErrorMessage } from '../lib/userFacingError';

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
    const { settings } = useApp();
    const activeMode = DARK_MODE_UI_ENABLED ? settings.themeMode : 'light';
    return <ThemeColorsProvider mode={activeMode}>{children}</ThemeColorsProvider>;
}

/**
 * Holds route screens until startup finishes. Several screens read SQLite in state initializers,
 * and a fresh install has no tables until migrations complete. Purchased content is installed
 * later, from the store screen, so this gate never waits on the network.
 */
function StartupGate({ children }: { children: React.ReactNode }) {
    const { isLoading, startupError } = useApp();
    const { t } = useSystemI18n();

    if (isLoading && !startupError) {
        return (
            <View style={errorStyles.container}>
                <Text style={errorStyles.icon}>🧠</Text>
                <Text style={{ fontSize: FontSize.lg, color: Colors.textMuted }}>{t('common.loading')}</Text>
            </View>
        );
    }
    return children;
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
