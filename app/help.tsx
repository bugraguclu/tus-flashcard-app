import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Linking,
    Platform,
    ScrollView,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '../components/AppText';
import { SearchField } from '../components/ui/Fields';
import { Button } from '../components/ui/Button';
import { Card, SectionLabel } from '../components/ui/Card';
import { ListRow } from '../components/ui/Rows';
import { EmptyState, Notice } from '../components/ui/Feedback';
import ScreenHeader from '../components/ScreenHeader';
import HelpArticleView from '../components/help/HelpArticleView';
import { createHelpStyles } from '../components/help/helpStyles';
import { useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { goBackOr } from '../lib/backNavigation';
import {
    getGroupedHelpArticles,
    resolveHelpTarget,
    searchHelpGuide,
    type HelpSearchHit,
} from '../lib/helpSearch';

const SUPPORT_URL = 'https://bugraguclu.github.io/tus-flashcard-app/support.html';

interface ArticleHistoryEntry {
    articleId: string;
    sectionId?: string;
}

function readParam(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return typeof value === 'string' ? value : '';
}

export default function HelpCenterScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ article?: string; section?: string; q?: string }>();
    const colors = useThemeColors();
    const { l, locale } = useI18n();
    const styles = useMemo(() => createHelpStyles(colors), [colors]);

    const routeArticle = readParam(params.article);
    const routeSection = readParam(params.section);
    const routeQuery = readParam(params.q);

    const [query, setQuery] = useState(routeQuery);
    const [activeEntry, setActiveEntry] = useState<ArticleHistoryEntry | null>(() => {
        if (!routeArticle) return null;
        const resolved = resolveHelpTarget(locale, routeArticle, routeSection);
        return resolved.article ? { articleId: resolved.article.id, sectionId: resolved.section?.id } : null;
    });
    const [history, setHistory] = useState<ArticleHistoryEntry[]>([]);
    const [missingTarget, setMissingTarget] = useState<boolean>(() => {
        if (!routeArticle && !routeSection) return false;
        return resolveHelpTarget(locale, routeArticle, routeSection).missing;
    });
    const [activeHitIndex, setActiveHitIndex] = useState(-1);
    const searchInputRef = useRef<any>(null);

    // Sync deep-link param changes in place when `/help` is already mounted.
    useEffect(() => {
        if (routeQuery) setQuery(routeQuery);
    }, [routeQuery]);

    const appliedRouteTargetRef = useRef<string>(`${routeArticle ?? ''}#${routeSection ?? ''}`);

    useEffect(() => {
        if (!routeArticle && !routeSection) {
            appliedRouteTargetRef.current = '#';
            return;
        }
        const routeKey = `${routeArticle ?? ''}#${routeSection ?? ''}`;
        if (routeKey === appliedRouteTargetRef.current) return;
        appliedRouteTargetRef.current = routeKey;
        const resolved = resolveHelpTarget(locale, routeArticle, routeSection);
        setMissingTarget(resolved.missing);
        if (resolved.article) {
            setActiveEntry({ articleId: resolved.article.id, sectionId: resolved.section?.id });
            setHistory([]);
        } else {
            setActiveEntry(null);
            setHistory([]);
        }
    }, [locale, routeArticle, routeSection]);

    const grouped = useMemo(() => getGroupedHelpArticles(locale), [locale]);
    const trimmedQuery = query.trim();
    const searchHits = useMemo<HelpSearchHit[]>(
        () => (trimmedQuery ? searchHelpGuide(locale, trimmedQuery, { limit: 24 }) : []),
        [locale, trimmedQuery],
    );

    useEffect(() => {
        setActiveHitIndex(-1);
    }, [trimmedQuery, locale]);

    const activeResolved = useMemo(
        () => (activeEntry ? resolveHelpTarget(locale, activeEntry.articleId, activeEntry.sectionId) : null),
        [activeEntry, locale],
    );

    const openArticle = useCallback((articleId: string, sectionId?: string) => {
        if (activeEntry?.articleId === articleId) {
            setActiveEntry({ articleId, sectionId });
            router.setParams({ article: articleId, section: sectionId });
            return;
        }
        router.push({ pathname: '/help', params: { article: articleId, ...(sectionId ? { section: sectionId } : {}) } });
    }, [activeEntry, router]);
    const handleBack = useCallback(() => {
        if (router.canGoBack()) router.back();
        else if (activeEntry) router.replace('/help');
        else goBackOr(router, '/decks');
    }, [activeEntry, router]);

    const handleSearchKeyDown = useCallback((event: any) => {
        if (Platform.OS !== 'web' || !trimmedQuery) return;
        const key = event?.nativeEvent?.key ?? event?.key;
        if (key === 'ArrowDown' && searchHits.length > 0) {
            event.preventDefault?.();
            setActiveHitIndex((prev) => (prev + 1) % searchHits.length);
        } else if (key === 'ArrowUp' && searchHits.length > 0) {
            event.preventDefault?.();
            setActiveHitIndex((prev) => (prev <= 0 ? searchHits.length - 1 : prev - 1));
        } else if (key === 'Enter' && searchHits.length > 0) {
            event.preventDefault?.();
            const chosen = searchHits[activeHitIndex >= 0 ? activeHitIndex : 0];
            if (chosen) openArticle(chosen.articleId, chosen.sectionId);
        } else if (key === 'Escape') {
            event.preventDefault?.();
            setQuery('');
        }
    }, [activeHitIndex, openArticle, searchHits, trimmedQuery]);

    const missingNoticeText = missingTarget
        ? l(
            'Bu bölüm bulunamadı; yardım listesi açıldı.',
            'That section could not be found, so the help topics are shown.',
        )
        : null;

    const headerTitle = activeResolved?.article
        ? activeResolved.article.title
        : l('Yardım', 'Help');

    const backLabel = activeResolved?.article
        ? l('Yardım listesine dön', 'Back to help topics')
        : l('Yardımı kapat', 'Close help');

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={headerTitle}
                onBack={handleBack}
                backAccessibilityLabel={backLabel}
            />

            <View style={styles.inner}>
                {activeResolved?.article ? (
                    <HelpArticleView
                        article={activeResolved.article}
                        targetSectionId={activeEntry?.sectionId}
                        styles={styles}
                        onOpenArticle={openArticle}
                        missingNotice={missingNoticeText}
                    />
                ) : (
                    <>
                        <View style={styles.searchWrap}>
                            <SearchField ref={searchInputRef} value={query} onChangeText={setQuery} placeholder={l('Kılavuzda ara', 'Search the guide')} accessibilityLabel={l('Kılavuzda ara', 'Search the guide')} clearLabel={l('Aramayı temizle', 'Clear search')} autoCapitalize="none" {...(Platform.OS === 'web' ? { onKeyPress: handleSearchKeyDown } : {})} onSubmitEditing={() => { const hit = searchHits[activeHitIndex >= 0 ? activeHitIndex : 0]; if (hit) openArticle(hit.articleId, hit.sectionId); }} />
                        </View>
                        {missingNoticeText ? <Notice>{missingNoticeText}</Notice> : null}
                        <ScrollView
                            style={styles.scroll}
                            contentContainerStyle={styles.listContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {trimmedQuery ? searchHits.length ? <Card divided>
                                {searchHits.map((hit, index) => <ListRow key={hit.key} title={hit.title} summary={[hit.subtitle, hit.snippet].filter(Boolean).join(' · ')} onPress={() => openArticle(hit.articleId, hit.sectionId)} selected={index === activeHitIndex} />)}
                            </Card> : <EmptyState body={l('Eşleşen bölüm yok. Daha kısa bir kelime deneyin.', 'No matching section. Try a shorter word.')} /> : grouped.map(({ group, articles }) => <View key={group.id} style={styles.groupBlock}>
                                <SectionLabel>{group.title[locale]}</SectionLabel>
                                <Card divided>{articles.map((article) => <ListRow key={article.id} title={article.title} summary={article.summary} onPress={() => openArticle(article.id)} />)}</Card>
                            </View>)}

                            <View style={styles.footer}>
                                <Text style={styles.offlineNote}>
                                    {l(
                                        'Bu kılavuz uygulamayla birlikte gelir; internet olmadan açılır.',
                                        'This guide ships with the app and opens without an internet connection.',
                                    )}
                                </Text>
                                <Button variant="plain" label={l('Destek', 'Support')} onPress={() => void Linking.openURL(SUPPORT_URL).catch(() => undefined)} />
                            </View>
                        </ScrollView>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}
