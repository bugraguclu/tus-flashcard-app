import { Stack } from 'expo-router';
import { SettingsDraftProvider } from '../../components/settings/SettingsDraft';
import { useThemeColors } from '../../constants/theme';

// A category opened from a link still has the list beneath it to go back to.
export const unstable_settings = { initialRouteName: 'index' };

/**
 * Settings is a stack of its own: the category list, and each category as a page pushed over it,
 * so the back swipe on a category returns to the list (where it was scrolled) rather than
 * leaving Settings. The draft is held here, above the pages, and survives that.
 */
export default function SettingsLayout() {
    const colors = useThemeColors();

    return (
        <SettingsDraftProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bgPrimary },
                    freezeOnBlur: true,
                }}
            />
        </SettingsDraftProvider>
    );
}
