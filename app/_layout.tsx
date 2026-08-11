import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors, FontSize, ThemeColorsProvider, useThemeColors } from '../constants/theme';
import { initWebDb, isPrimaryTab } from '../lib/db';
import { DialogHost } from '../components/DialogHost';
import { AppProvider, useApp } from '../contexts/AppContext';
import { useI18n, useSystemI18n } from '../hooks/useI18n';

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
    return (
        <View style={errorStyles.container}>
            <Text style={errorStyles.icon}>!</Text>
            <Text style={errorStyles.title}>{t('root.errorTitle')}</Text>
            <Text style={errorStyles.message}>{message}</Text>
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
            <View style={errorStyles.container}>
                <Text style={errorStyles.icon}>!</Text>
                <Text style={errorStyles.title}>{t('root.databaseError')}</Text>
                <Text style={errorStyles.message}>{error}</Text>
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
                <Text style={errorStyles.icon}>…</Text>
                <Text style={{ fontSize: FontSize.lg, color: Colors.textMuted }}>{t('common.loading')}</Text>
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

/** Resolves the persisted themeMode against the OS scheme; must sit inside AppProvider. */
function ThemeGate({ children }: { children: React.ReactNode }) {
    const { settings } = useApp();
    return <ThemeColorsProvider mode={settings.themeMode}>{children}</ThemeColorsProvider>;
}

/** Renders the navigator + DialogHost; lives inside ThemeGate so it can read live theme colors. */
function AppStack() {
    const colors = useThemeColors();
    const { t } = useI18n();

    return (
        <>
            <StatusBar style="auto" />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bgPrimary },
                }}
            >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                    name="editor"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: t('root.editCard'),
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
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
            <SafeAreaProvider>
                <WebDbGate>
                    <AppProvider>
                        <ThemeGate>
                            <AppStack />
                        </ThemeGate>
                    </AppProvider>
                </WebDbGate>
            </SafeAreaProvider>
        </AppErrorBoundary>
    );
}
