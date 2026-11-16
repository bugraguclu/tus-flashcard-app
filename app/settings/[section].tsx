import { Redirect, useLocalSearchParams } from 'expo-router';
import SettingsScreen from '../../components/settings/SettingsScreen';
import { isSettingsSectionId, SETTINGS_SECTION_IDS } from '../../components/settings/settingsCategories';

/**
 * The static web build writes a page per category. Without this the address of a category was
 * answered by the not-found page with HTTP 404: the app then showed the right screen, but a link
 * preview or a link checker saw a broken link.
 */
export function generateStaticParams(): { section: string }[] {
    return SETTINGS_SECTION_IDS.map((section) => ({ section }));
}

/** One Settings category, pushed over the list so the back swipe returns to it. */
export default function SettingsSectionScreen() {
    const { section } = useLocalSearchParams<{ section?: string }>();
    if (!isSettingsSectionId(section)) return <Redirect href="/settings" />;
    return <SettingsScreen section={section} />;
}
