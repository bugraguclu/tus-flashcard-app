import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSize, ThemeColorsProvider, useThemeColors } from '../constants/theme';
import { initWebDb, isPrimaryTab } from '../lib/db';
import { DialogHost } from '../components/DialogHost';
import { AppProvider, useApp } from './(tabs)/app-context';

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
                <View style={errorStyles.container}>
                    <Text style={errorStyles.icon}>⚠️</Text>
                    <Text style={errorStyles.title}>Bir hata oluştu</Text>
                    <Text style={errorStyles.message}>{this.state.error}</Text>
                    <TouchableOpacity
                        style={errorStyles.button}
                        onPress={() => this.setState({ hasError: false, error: '' })}
                    >
                        <Text style={errorStyles.buttonText}>Tekrar Dene</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return this.props.children;
    }
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
                <Text style={errorStyles.icon}>⚠️</Text>
                <Text style={errorStyles.title}>Veritabanı başlatılamadı</Text>
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
                    <Text style={errorStyles.buttonText}>Tekrar Dene</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!ready) {
        return (
            <View style={errorStyles.container}>
                <Text style={errorStyles.icon}>🧠</Text>
                <Text style={{ fontSize: FontSize.lg, color: Colors.textMuted }}>Yükleniyor...</Text>
            </View>
        );
    }

    return (
        <>
            {Platform.OS === 'web' && !isPrimaryTab() && (
                <View style={errorStyles.secondaryBar}>
                    <Text style={errorStyles.secondaryBarText}>
                        ⚠️ Uygulama başka bir sekmede açık — değişiklikler bu sekmede kaydedilmez.
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
                        title: 'Kart Düzenle',
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="card-info"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: 'Kart Bilgisi',
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="import"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: 'İçe Aktar',
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="backups"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: 'Yedekler',
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="note-types"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: 'Not Türleri',
                        headerStyle: { backgroundColor: colors.bgSecondary },
                        headerTintColor: colors.accent,
                    }}
                />
                <Stack.Screen
                    name="note-type"
                    options={{
                        headerShown: true,
                        title: 'Not Türü Düzenle',
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
            <WebDbGate>
                <AppProvider>
                    <ThemeGate>
                        <AppStack />
                    </ThemeGate>
                </AppProvider>
            </WebDbGate>
        </AppErrorBoundary>
    );
}
