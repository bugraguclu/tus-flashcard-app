import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Animated,
    Platform,
    RefreshControl,
    StyleSheet,
    View,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { Text } from './AppText';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import {
    PULL_INDICATOR_HEIGHT,
    isPullArmed,
    pullPhase,
    pullPhaseText,
    runPullRefresh,
    type PullPhase,
    type PullRefreshLabels,
    type RefreshRunState,
} from '../lib/pullToRefresh';

/**
 * iOS shows our own indicator in the gap a pulled list opens (UIScrollView rubber-bands past its
 * top); Android gets the platform RefreshControl. Web lists don't pull past their top, so a web
 * build keeps the list as it was.
 */
const USES_OWN_INDICATOR = Platform.OS === 'ios';
const NATIVE_DRIVER = Platform.OS !== 'web';
/** Tall enough for any pull; the clip keeps the indicator out of the view above the list. */
const CLIP_HEIGHT = 240;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export interface PullToRefreshOptions {
    /** Re-reads the screen's data. A promise keeps the spinner until it settles. */
    onRefresh: () => void | Promise<unknown>;
    labels: PullRefreshLabels;
    /** True while the screen is still loading; the spinner waits for it to turn false. */
    busy?: boolean;
    /** The screen's own scroll handler, still called for every scroll event. */
    onScroll?: (event: ScrollEvent) => void;
    /** The list, scrolled back over the indicator when it folds away. */
    scrollRef?: RefObject<unknown>;
    enabled?: boolean;
}

export interface PullToRefreshBinding {
    /** Spread onto an Animated.ScrollView / Animated.FlatList / Animated.SectionList. */
    scrollProps: Record<string, unknown>;
    /** The list's vertical offset, driven natively. */
    scrollY: Animated.Value;
    /** The indicator, placed at the list's top edge (see PullToRefreshIndicator). */
    indicator: React.ReactElement | null;
    phase: PullPhase;
}

function scrollToTop(target: unknown): void {
    const list = target as {
        scrollToOffset?: (options: { offset: number; animated: boolean }) => void;
        scrollTo?: (options: { y: number; animated: boolean }) => void;
        getScrollResponder?: () => { scrollTo?: (options: { y: number; animated: boolean }) => void } | null;
    } | null | undefined;
    if (!list) return;
    if (typeof list.scrollToOffset === 'function') list.scrollToOffset({ offset: 0, animated: true });
    else if (typeof list.scrollTo === 'function') list.scrollTo({ y: 0, animated: true });
    else list.getScrollResponder?.()?.scrollTo?.({ y: 0, animated: true });
}

function armHaptic(): void {
    try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch {
        // Haptics unavailable on this platform.
    }
}

/**
 * Pull-to-refresh for a data view. Spread `scrollProps` on the list (an Animated one, so the
 * offset reaches the indicator on the native thread) and render `indicator` with
 * PullToRefreshIndicator at the list's top edge.
 */
export function usePullToRefresh(options: PullToRefreshOptions): PullToRefreshBinding {
    const { l } = useI18n();
    const enabled = options.enabled ?? true;
    const scrollY = useRef(new Animated.Value(0)).current;
    const [run, setRun] = useState<RefreshRunState>('idle');
    const [armed, setArmed] = useState(false);
    const latest = useRef(options);
    latest.current = options;
    const localize = useRef(l);
    localize.current = l;
    const runRef = useRef<RefreshRunState>('idle');
    const armedRef = useRef(false);
    const draggingRef = useRef(false);
    const offsetRef = useRef(0);
    const busyRef = useRef(Boolean(options.busy));
    busyRef.current = Boolean(options.busy);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const setArmedState = useCallback((next: boolean) => {
        if (armedRef.current === next) return;
        armedRef.current = next;
        setArmed(next);
    }, []);

    const start = useCallback(() => {
        if (runRef.current !== 'idle') return;
        setArmedState(false);
        void runPullRefresh({
            refresh: () => latest.current.onRefresh(),
            isBusy: () => busyRef.current,
            isMounted: () => mountedRef.current,
            onState: (state) => {
                runRef.current = state;
                setRun(state);
                if (state === 'done' || state === 'failed') {
                    const { labels } = latest.current;
                    AccessibilityInfo.announceForAccessibility(pullPhaseText(state, labels, localize.current));
                }
            },
            close: () => {
                if (offsetRef.current < 0) scrollToTop(latest.current.scrollRef?.current);
            },
        });
    }, [setArmedState]);

    const onScroll = useMemo(() => Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
            useNativeDriver: NATIVE_DRIVER,
            listener: (event: ScrollEvent) => {
                const y = event.nativeEvent.contentOffset.y;
                offsetRef.current = y;
                if (draggingRef.current && runRef.current === 'idle' && latest.current.enabled !== false) {
                    const next = isPullArmed(y);
                    if (next && !armedRef.current) armHaptic();
                    setArmedState(next);
                }
                latest.current.onScroll?.(event);
            },
        },
    ), [scrollY, setArmedState]);

    const onScrollBeginDrag = useCallback(() => {
        draggingRef.current = true;
    }, []);

    const onScrollEndDrag = useCallback((event: ScrollEvent) => {
        draggingRef.current = false;
        const y = event.nativeEvent.contentOffset.y;
        offsetRef.current = y;
        if (latest.current.enabled !== false && runRef.current === 'idle' && isPullArmed(y)) start();
        else setArmedState(false);
    }, [setArmedState, start]);

    const phase = pullPhase(run, armed);
    const holdingGap = run !== 'idle';

    const scrollProps = useMemo<Record<string, unknown>>(() => {
        if (USES_OWN_INDICATOR) {
            return {
                onScroll,
                onScrollBeginDrag,
                onScrollEndDrag,
                scrollEventThrottle: 16,
                // Keeps the list pulled down over the indicator while it refreshes.
                contentInset: { top: holdingGap ? PULL_INDICATOR_HEIGHT : 0, left: 0, bottom: 0, right: 0 },
                alwaysBounceVertical: true,
            };
        }
        if (Platform.OS === 'android' && enabled) {
            return {
                onScroll,
                scrollEventThrottle: 16,
                refreshControl: <RefreshControl refreshing={run === 'refreshing'} onRefresh={start} />,
            };
        }
        return { onScroll, scrollEventThrottle: 16 };
    }, [enabled, holdingGap, onScroll, onScrollBeginDrag, onScrollEndDrag, run, start]);

    const labels = options.labels;
    const indicator = USES_OWN_INDICATOR && enabled
        ? <PullIndicatorRow scrollY={scrollY} phase={phase} text={pullPhaseText(phase, labels, l)} />
        : null;

    return { scrollProps, scrollY, indicator, phase };
}

/**
 * Places the indicator at the top edge of a list: render it right after the list, inside the
 * view that holds it. It stays clear of everything above the list and of the list's touches.
 */
export function PullToRefreshIndicator({ binding, top = 0 }: { binding: PullToRefreshBinding; top?: number }) {
    if (!binding.indicator) return null;
    return (
        <View style={[styles.clip, { top, pointerEvents: 'none' }]}>
            {binding.indicator}
        </View>
    );
}

/**
 * For a ScrollView whose top part stays put while the rest is pulled (the Kronometre's hero and
 * "Son Çalışmalarınız" heading): wrap that part in this, inside the scroll content. The gap, and
 * the indicator, open beneath it.
 */
export function PullToRefreshPinnedHeader({ binding, children }: { binding: PullToRefreshBinding; children: React.ReactNode }) {
    if (!USES_OWN_INDICATOR) return <>{children}</>;
    const translateY = binding.scrollY.interpolate({
        inputRange: [-1, 0],
        outputRange: [-1, 0],
        extrapolateLeft: 'extend',
        extrapolateRight: 'clamp',
    });
    return (
        <Animated.View style={[styles.pinned, { transform: [{ translateY }] }]}>
            {children}
            {binding.indicator && (
                <View style={[styles.clip, styles.underPinned, { pointerEvents: 'none' }]}>
                    {binding.indicator}
                </View>
            )}
        </Animated.View>
    );
}

function PullIndicatorRow({ scrollY, phase, text }: { scrollY: Animated.Value; phase: PullPhase; text: string }) {
    const colors = useThemeColors();
    // The row's bottom edge follows the content's top edge, so it slides out of the gap.
    const translateY = scrollY.interpolate({
        inputRange: [-CLIP_HEIGHT, 0],
        outputRange: [CLIP_HEIGHT - PULL_INDICATOR_HEIGHT, -PULL_INDICATOR_HEIGHT],
        extrapolate: 'clamp',
    });
    const opacity = scrollY.interpolate({
        inputRange: [-PULL_INDICATOR_HEIGHT * 0.7, -8],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });
    const color = colors.textMuted;
    return (
        <Animated.View
            style={[styles.row, { opacity, transform: [{ translateY }] }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={phase === 'pulling' ? undefined : text}
        >
            <View style={styles.glyph}>
                {phase === 'refreshing'
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <PullGlyph phase={phase} color={color} />}
            </View>
            <Text style={[styles.text, { color }]} numberOfLines={1}>{text}</Text>
        </Animated.View>
    );
}

function PullGlyph({ phase, color }: { phase: PullPhase; color: string }) {
    const stroke = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            {phase === 'pulling' && <Path d="M12 4v15M6 13l6 6 6-6" {...stroke} />}
            {phase === 'armed' && (
                <>
                    <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" {...stroke} />
                    <Path d="M19.8 3.8v4.6h-4.6" {...stroke} />
                </>
            )}
            {phase === 'done' && <Path d="M4.5 12.5l5 5L19.5 7" {...stroke} />}
            {phase === 'failed' && (
                <>
                    <Path d="M12 6.5v7" {...stroke} />
                    <Path d="M12 17.5v.1" {...stroke} strokeWidth={2.6} />
                </>
            )}
        </Svg>
    );
}

const styles = StyleSheet.create({
    clip: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: CLIP_HEIGHT,
        overflow: 'hidden',
        zIndex: 5,
    },
    pinned: { zIndex: 5 },
    underPinned: { top: '100%' },
    row: {
        height: PULL_INDICATOR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    glyph: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: FontSize.md, flexShrink: 1 },
});
