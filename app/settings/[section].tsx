import { Redirect, useLocalSearchParams } from 'expo-router';
import SettingsScreen from '../../components/settings/SettingsScreen';
import { isSettingsSectionId } from '../../components/settings/settingsCategories';

/** One Settings category, pushed over the list so the back swipe returns to it. */
export default function SettingsSectionScreen() {
    const { section } = useLocalSearchParams<{ section?: string }>();
    if (!isSettingsSectionId(section)) return <Redirect href="/settings" />;
    return <SettingsScreen section={section} />;
}
