import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Platform,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { Card } from '../ui/Card';
import { BorderRadius, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import {
    collectNewlyVisibleSections,
    STATS_LAZY_ROOT_MARGIN_NATIVE,
    type StatsSectionId,
} from '../../lib/statsSectionPriority';

interface StatsSectionPriorityContextValue {
    isMounted: (id: StatsSectionId) => boolean;
    registerSectionY: (id: StatsSectionId, relativeY: number) => void;
}

const StatsSectionPriorityContext = createContext<StatsSectionPriorityContextValue | null>(null);

export interface StatsSectionPriorityController {
    contextValue: StatsSectionPriorityContextValue;
    onScrollViewLayout: (event: LayoutChangeEvent) => void;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onBodyLayout: (event: LayoutChangeEvent) => void;
    mountedIds: ReadonlySet<StatsSectionId>;
}

/**
 * Coordinates visibility-prioritized mounting for the Statistics ScrollView.
 *
 * Normal scroll ticks never trigger React re-renders: scroll offset and section Y coordinates stay
 * in refs and state updates only when a not-yet-mounted section enters the lookahead margin.
 * VoiceOver / screen reader mode immediately mounts all sections so reading order stays complete.
 */
export function useStatsSectionPriority(
    allSectionIds: readonly StatsSectionId[],
    eagerSectionIds: ReadonlySet<StatsSectionId>,
): StatsSectionPriorityController {
    const rootMargin = STATS_LAZY_ROOT_MARGIN_NATIVE;
    // Browsers cannot reliably expose screen-reader state. RN Web's query always returns true;
    // keep the full reading order available there, and optimize the shipped iPhone surface.
    const [screenReaderEnabled, setScreenReaderEnabled] = useState(Platform.OS === 'web');
    const [mountedIds, setMountedIds] = useState<ReadonlySet<StatsSectionId>>(() => new Set(eagerSectionIds));

    const mountedRef = useRef<ReadonlySet<StatsSectionId>>(mountedIds);
    mountedRef.current = mountedIds;
    const screenReaderRef = useRef(screenReaderEnabled);
    screenReaderRef.current = screenReaderEnabled;

    const scrollYRef = useRef(0);
    const viewportHeightRef = useRef(0);
    const bodyOffsetYRef = useRef(0);
    const relativeLayoutsRef = useRef<Map<StatsSectionId, number>>(new Map());
    const absoluteLayoutsRef = useRef<Map<StatsSectionId, number>>(new Map());

    // A section made eager by layout editing/reordering stays eligible after that mode ends.
    useEffect(() => {
        setMountedIds((previous) => {
            const missing = [...eagerSectionIds].filter((id) => !previous.has(id));
            return missing.length ? new Set([...previous, ...missing]) : previous;
        });
    }, [eagerSectionIds]);

    const flushVisible = useCallback(() => {
        // Previously mounted hidden sections must not count as newly visible sections.
        if (allSectionIds.every((id) => mountedRef.current.has(id))) return;
        const newlyVisible = collectNewlyVisibleSections(
            allSectionIds,
            absoluteLayoutsRef.current,
            mountedRef.current,
            eagerSectionIds,
            {
                scrollY: scrollYRef.current,
                viewportHeight: viewportHeightRef.current,
                rootMargin,
                screenReaderEnabled: screenReaderRef.current,
            },
        );
        if (newlyVisible.length === 0) return;
        setMountedIds((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const id of newlyVisible) {
                if (!next.has(id)) {
                    next.add(id);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [allSectionIds, eagerSectionIds, rootMargin]);

    useEffect(() => {
        if (Platform.OS === 'web') return undefined;
        let active = true;
        AccessibilityInfo.isScreenReaderEnabled?.()
            .then((enabled) => {
                if (!active || !enabled) return;
                screenReaderRef.current = true;
                setScreenReaderEnabled(true);
                setMountedIds(new Set(allSectionIds));
            })
            .catch(() => {});

        const subscription = AccessibilityInfo.addEventListener?.('screenReaderChanged', (enabled) => {
            screenReaderRef.current = Boolean(enabled);
            setScreenReaderEnabled(Boolean(enabled));
            if (enabled) setMountedIds(new Set(allSectionIds));
        });
        return () => {
            active = false;
            subscription?.remove?.();
        };
    }, [allSectionIds]);

    const registerSectionY = useCallback((id: StatsSectionId, relativeY: number) => {
        relativeLayoutsRef.current.set(id, relativeY);
        absoluteLayoutsRef.current.set(id, bodyOffsetYRef.current + relativeY);
        flushVisible();
    }, [flushVisible]);

    const onBodyLayout = useCallback((event: LayoutChangeEvent) => {
        const nextOffset = event.nativeEvent.layout.y;
        if (bodyOffsetYRef.current === nextOffset) return;
        bodyOffsetYRef.current = nextOffset;
        for (const [id, relY] of relativeLayoutsRef.current.entries()) {
            absoluteLayoutsRef.current.set(id, nextOffset + relY);
        }
        flushVisible();
    }, [flushVisible]);

    const onScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (viewportHeightRef.current === nextHeight) return;
        viewportHeightRef.current = nextHeight;
        flushVisible();
    }, [flushVisible]);

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollYRef.current = event.nativeEvent.contentOffset.y;
        const layoutHeight = event.nativeEvent.layoutMeasurement?.height;
        if (typeof layoutHeight === 'number' && layoutHeight > 0) {
            viewportHeightRef.current = layoutHeight;
        }
        flushVisible();
    }, [flushVisible]);

    const isMounted = useCallback(
        (id: StatsSectionId) => mountedIds.has(id) || eagerSectionIds.has(id) || screenReaderEnabled,
        [mountedIds, eagerSectionIds, screenReaderEnabled],
    );

    const contextValue = useMemo<StatsSectionPriorityContextValue>(
        () => ({ isMounted, registerSectionY }),
        [isMounted, registerSectionY],
    );

    return { contextValue, onScrollViewLayout, onScroll, onBodyLayout, mountedIds };
}

export function StatsSectionPriorityProvider({
    value,
    children,
}: {
    value: StatsSectionPriorityContextValue;
    children: React.ReactNode;
}) {
    return (
        <StatsSectionPriorityContext.Provider value={value}>
            {children}
        </StatsSectionPriorityContext.Provider>
    );
}

interface LazyStatsSectionProps {
    id: StatsSectionId;
    title: string;
    estimatedHeight: number;
    eager?: boolean;
    children: () => React.ReactNode;
}

/**
 * Defers mounting heavy below-the-fold statistics charts until the section nears the viewport.
 * Keeps a card-shaped placeholder with the section's title and estimated height so scroll position
 * stays stable. Web retains the complete accessible reading order from its first render.
 */
export default function LazyStatsSection({
    id,
    title,
    estimatedHeight,
    eager = false,
    children,
}: LazyStatsSectionProps) {
    const context = useContext(StatsSectionPriorityContext);
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const mounted = eager || !context || context.isMounted(id);

    return (
        <View>
            {mounted ? children() : (
                <Card padded title={title} style={{ minHeight: estimatedHeight }}>
                    <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <View style={[styles.line, { width: '58%' }]} />
                        <View style={styles.plotArea}>
                            {[34, 62, 48, 82, 55, 70, 42].map((pct, index) => (
                                <View key={index} style={[styles.bar, { height: `${pct}%` }]} />
                            ))}
                        </View>
                        <View style={[styles.line, { width: '42%' }]} />
                    </View>
                </Card>
            )}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        placeholder: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            padding: Spacing.lg,
            gap: Spacing.md,
        },
        title: {
            color: colors.textPrimary,
            fontSize: 17,
            fontWeight: '600',
        },
        bars: {
            flex: 1,
            justifyContent: 'space-between',
            gap: Spacing.md,
        },
        line: {
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.bgInput,
        },
        plotArea: {
            flex: 1,
            minHeight: 120,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: Spacing.sm,
            paddingTop: Spacing.sm,
        },
        bar: {
            flex: 1,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            backgroundColor: colors.bgInput,
        },
    });
}
