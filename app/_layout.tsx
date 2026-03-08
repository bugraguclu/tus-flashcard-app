import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/theme';

export default function RootLayout() {
    return (
        <>
            <StatusBar style="dark" />
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
        </>
    );
}
