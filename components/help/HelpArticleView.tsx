import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Linking,
    Platform,
    ScrollView,
    useWindowDimensions,
    View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Choice';
import { Text } from '../AppText';
import { useI18n } from '../../hooks/useI18n';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import type { HelpArticle, HelpBlock, HelpCalloutTone, HelpInline } from '../../lib/helpTypes';
import type { HelpStyles } from './helpStyles';

interface HelpArticleViewProps {
    article: HelpArticle;
    targetSectionId?: string | null;
    styles: HelpStyles;
    onOpenArticle: (articleId: string, sectionId?: string) => void;
    missingNotice?: string | null;
}

export default function HelpArticleView({
    article,
    targetSectionId,
    styles,
    onOpenArticle,
    missingNotice,
}: HelpArticleViewProps) {
    const { l } = useI18n();
    const { width } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const scrollRef = useRef<ScrollView>(null);
    const sectionOffsetsRef = useRef<Record<string, number>>({});
    const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
    const [copiedValue, setCopiedValue] = useState<string | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isWideTable = width >= 620;
    const h2Sections = useMemo(
        () => article.sections.filter((section) => section.level === 2),
        [article.sections],
    );

    const scrollToSection = useCallback((sectionId: string) => {
        const y = sectionOffsetsRef.current[sectionId];
        if (typeof y === 'number') {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reduceMotion });
            setHighlightedSection(sectionId);
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = setTimeout(() => setHighlightedSection(null), 2200);
            return true;
        }
        return false;
    }, [reduceMotion]);

    useEffect(() => {
        sectionOffsetsRef.current = {};
        if (!targetSectionId) {
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
        // Only clear cached section offsets when switching to a different article; switching
        // sections within the same article keeps already-measured layout offsets intact.
    }, [article.id]);

    // A deep link scrolls to its section once. The highlight changes the section's padding, so
    // its onLayout fires again when the highlight comes and goes; scrolling there each time
    // would pull the reader back to the section every 2.2 s.
    const autoScrollKey = targetSectionId ? `${article.id}#${targetSectionId}` : null;
    const autoScrolledRef = useRef<string | null>(null);
    const autoScrollToTarget = useCallback(() => {
        if (!autoScrollKey || !targetSectionId || autoScrolledRef.current === autoScrollKey) return true;
        if (!scrollToSection(targetSectionId)) return false;
        autoScrolledRef.current = autoScrollKey;
        return true;
    }, [autoScrollKey, scrollToSection, targetSectionId]);

    useEffect(() => {
        if (autoScrollToTarget()) return;
        // Wait for layout measurements when opening directly to a section anchor.
        const timer = setTimeout(autoScrollToTarget, 80);
        return () => clearTimeout(timer);
    }, [autoScrollToTarget]);

    useEffect(() => () => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    }, []);

    const copyCode = useCallback((value: string) => {
        void Clipboard.setStringAsync(value).then(() => {
            setCopiedValue(value);
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = setTimeout(() => setCopiedValue(null), 1800);
        }).catch(() => undefined);
    }, []);

    const handleLinkPress = useCallback((inline: Extract<HelpInline, { kind: 'link' }>) => {
        if (inline.url) {
            void Linking.openURL(inline.url).catch(() => undefined);
            return;
        }
        if (inline.articleId) {
            if (inline.articleId === article.id && inline.sectionId) {
                scrollToSection(inline.sectionId);
            } else {
                onOpenArticle(inline.articleId, inline.sectionId);
            }
        }
    }, [article.id, onOpenArticle, scrollToSection]);

    const renderInlines = (inlines: readonly HelpInline[], keyPrefix: string) => inlines.map((inline, index) => {
        const key = `${keyPrefix}-${index}`;
        if (inline.kind === 'text') return <React.Fragment key={key}>{inline.text}</React.Fragment>;
        if (inline.kind === 'bold') return <Text key={key} style={styles.inlineBold}>{inline.text}</Text>;
        if (inline.kind === 'italic') return <Text key={key} style={styles.inlineItalic}>{inline.text}</Text>;
        if (inline.kind === 'code') {
            return (
                <Text
                    key={key}
                    style={styles.inlineCode}
                    onPress={() => copyCode(inline.text)}
                    accessibilityRole="button"
                    accessibilityHint={l('Kopyalamak için dokunun', 'Tap to copy')}
                >
                    {` ${inline.text} `}
                </Text>
            );
        }
        return (
            <Text
                key={key}
                style={styles.inlineLink}
                onPress={() => handleLinkPress(inline)}
                accessibilityRole="link"
            >
                {inline.text}
            </Text>
        );
    });

    const calloutToneStyle = (tone: HelpCalloutTone) => {
        if (tone === 'anki') return styles.calloutAnki;
        if (tone === 'web') return styles.calloutWeb;
        if (tone === 'warning') return styles.calloutWarning;
        return styles.calloutNote;
    };

    const renderBlocks = (blocks: readonly HelpBlock[], keyPrefix: string): React.ReactNode => blocks.map((block, index) => {
        const key = `${keyPrefix}-b-${index}`;
        if (block.kind === 'paragraph') {
            return (
                <Text key={key} style={styles.paragraph} selectable={Platform.OS === 'web'}>
                    {renderInlines(block.inlines, key)}
                </Text>
            );
        }
        if (block.kind === 'list') {
            return (
                <View key={key} style={styles.listBlock}>
                    {block.items.map((item, itemIdx) => (
                        <View key={`${key}-i-${itemIdx}`} style={styles.listRow}>
                            <Text style={styles.listBullet}>{block.ordered ? `${itemIdx + 1}.` : '•'}</Text>
                            <Text style={styles.listItemText} selectable={Platform.OS === 'web'}>
                                {renderInlines(item, `${key}-i-${itemIdx}`)}
                            </Text>
                        </View>
                    ))}
                </View>
            );
        }
        if (block.kind === 'callout') {
            return (
                <View key={key} style={[styles.callout, calloutToneStyle(block.tone)]}>
                    {renderBlocks(block.blocks, `${key}-c`)}
                </View>
            );
        }
        if (block.kind === 'code') {
            return (
                <View key={key} style={styles.codeBlock}>
                    <Text style={styles.codeBlockText} selectable>{block.text}</Text>
                    <Button variant="plain" size="compact" label={l('Kod örneğini kopyala', 'Copy code example')} onPress={() => copyCode(block.text)} />
                </View>
            );
        }
        // Table: stacked key-value cards on phone, semantic columns on wide screens.
        if (!isWideTable) {
            return (
                <View key={key} style={styles.tableCards}>
                    {block.rows.map((row, rowIdx) => (
                        <View key={`${key}-r-${rowIdx}`} style={styles.tableCard}>
                            {row.map((cell, cellIdx) => {
                                const header = block.headers[cellIdx];
                                return (
                                    <View key={`${key}-r-${rowIdx}-c-${cellIdx}`} style={styles.tableCardField}>
                                        {header ? (
                                            <Text style={styles.tableCardLabel}>
                                                {renderInlines(header, `${key}-h-${rowIdx}-${cellIdx}`)}
                                            </Text>
                                        ) : null}
                                        <Text style={styles.tableCardValue}>
                                            {renderInlines(cell, `${key}-v-${rowIdx}-${cellIdx}`)}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                </View>
            );
        }
        return (
            <View key={key} style={styles.tableWide}>
                <View style={styles.tableWideHeader}>
                    {block.headers.map((header, cellIdx) => (
                        <View key={`${key}-wh-${cellIdx}`} style={styles.tableWideCell}>
                            <Text style={styles.tableWideHeaderText}>
                                {renderInlines(header, `${key}-wht-${cellIdx}`)}
                            </Text>
                        </View>
                    ))}
                </View>
                {block.rows.map((row, rowIdx) => (
                    <View
                        key={`${key}-wr-${rowIdx}`}
                        style={[styles.tableWideRow, rowIdx === block.rows.length - 1 && styles.tableWideRowLast]}
                    >
                        {row.map((cell, cellIdx) => (
                            <View key={`${key}-wr-${rowIdx}-c-${cellIdx}`} style={styles.tableWideCell}>
                                <Text style={styles.tableWideCellText}>
                                    {renderInlines(cell, `${key}-wct-${rowIdx}-${cellIdx}`)}
                                </Text>
                            </View>
                        ))}
                    </View>
                ))}
            </View>
        );
    });

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.articleContent}
                keyboardShouldPersistTaps="handled"
            >
                {missingNotice ? (
                    <View style={[styles.noticeCard, { marginHorizontal: 0, marginTop: 0 }]}>
                        <Text style={styles.noticeText}>{missingNotice}</Text>
                    </View>
                ) : null}

                <Text style={styles.articleSummary}>{article.summary}</Text>

                {h2Sections.length > 2 ? (
                    <View style={styles.tocCard}>
                        <Text style={styles.tocLabel} accessibilityRole="header">
                            {l('Bu makaledeki bölümler', 'In this article')}
                        </Text>
                        <View style={styles.tocChipWrap}>
                            {h2Sections.map((section) => (
                                <Chip key={section.id} label={section.title} selected={highlightedSection === section.id} onPress={() => scrollToSection(section.id)} />
                            ))}
                        </View>
                    </View>
                ) : null}

                {article.introBlocks.length > 0 ? renderBlocks(article.introBlocks, `${article.id}-intro`) : null}

                {article.sections.map((section) => {
                    const isHighlighted = highlightedSection === section.id;
                    return (
                        <View
                            key={section.id}
                            nativeID={section.id}
                            style={[styles.sectionBlock, isHighlighted && styles.sectionHighlight]}
                            onLayout={(event) => {
                                const y = event.nativeEvent.layout.y;
                                sectionOffsetsRef.current[section.id] = y;
                                if (targetSectionId === section.id) autoScrollToTarget();
                            }}
                        >
                            <Text
                                style={section.level === 2 ? styles.h2 : styles.h3}
                                accessibilityRole="header"
                            >
                                {section.title}
                            </Text>
                            {renderBlocks(section.blocks, `${article.id}-${section.id}`)}
                        </View>
                    );
                })}
            </ScrollView>

            {copiedValue ? (
                <View style={styles.copiedToast} accessibilityLiveRegion="polite">
                    <Text style={styles.copiedToastText}>
                        {l('Kopyalandı', 'Copied')}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}
