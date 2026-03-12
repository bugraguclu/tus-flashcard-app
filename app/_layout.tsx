import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

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
});

export default function RootLayout() {
    return (
        <AppErrorBoundary>
            <StatusBar style="auto" />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: Colors.bgPrimary },
                }}
            >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                    name="editor"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: 'Kart Düzenle',
                        headerStyle: { backgroundColor: Colors.bgSecondary },
                        headerTintColor: Colors.accent,
                    }}
                />
                <Stack.Screen
                    name="card-info"
                    options={{
                        presentation: 'modal',
                        headerShown: true,
                        title: 'Kart Bilgisi',
                        headerStyle: { backgroundColor: Colors.bgSecondary },
                        headerTintColor: Colors.accent,
                    }}
                />
            </Stack>
        </AppErrorBoundary>
    );
}
