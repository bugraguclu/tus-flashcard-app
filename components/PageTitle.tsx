import { createContext, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import Head from 'expo-router/head';
import { usePathname } from 'expo-router';
import { pageTitle } from '../lib/pageTitle';

/**
 * Titles the browser tab, and the link preview of a shared address, after the screen being shown.
 * Web only. The root layout renders it, in Turkish until settings have loaded (which is what the
 * static pages carry); the app shell then reports the learner's language with `usePageTitleLocale`.
 * One instance holds the title: a second, nested `Head` did not reliably win over the first.
 */
export default function PageTitle({ locale }: { locale: 'tr' | 'en' }) {
    const pathname = usePathname();
    if (Platform.OS !== 'web') return null;
    const title = pageTitle(pathname, locale);
    return (
        <Head>
            <title>{title}</title>
            <meta property="og:title" content={title} />
        </Head>
    );
}

/** How the app shell, inside the settings provider, tells the root layout which language to title in. */
export const PageTitleLocaleContext = createContext<(locale: 'tr' | 'en') => void>(() => {});

export function usePageTitleLocale(locale: 'tr' | 'en'): void {
    const setLocale = useContext(PageTitleLocaleContext);
    useEffect(() => {
        setLocale(locale);
    }, [setLocale, locale]);
}
