import React, { useMemo } from 'react';
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
    type GestureResponderEvent,
} from 'react-native';
import { Text } from '../AppText';
import { dropShadow } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { AlertGlyph, ArrowRightGlyph, CheckGlyph, MailGlyph } from './AccountGlyphs';
import { useAccountPalette, type AccountPalette } from './accountPalette';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface AuthButtonProps {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
    busy?: boolean;
    disabled?: boolean;
    /** The forward arrow the primary actions carry. */
    arrow?: boolean;
    accessibilityHint?: string;
}

/** A full-width action. Busy keeps its label (no jump) and swaps the arrow for a spinner. */
export function AuthButton({ label, onPress, variant = 'primary', busy = false, disabled = false, arrow = false, accessibilityHint }: AuthButtonProps) {
    const palette = useAccountPalette();
    const styles = useMemo(() => createControlStyles(palette), [palette]);
    const inactive = disabled || busy;
    const surface = variant === 'primary'
        ? (disabled ? palette.primaryDisabled : palette.primary)
        : variant === 'danger'
            ? (disabled ? palette.primaryDisabled : palette.danger)
            : 'transparent';
    const ink = variant === 'secondary'
        ? palette.ink
        : disabled ? palette.onPrimaryDisabled : variant === 'danger' ? '#ffffff' : palette.onPrimary;

    return (
        <TouchableOpacity
            style={[
                styles.button,
                { backgroundColor: surface },
                variant === 'secondary' && styles.buttonSecondary,
            ]}
            onPress={onPress}
            disabled={inactive}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: inactive, busy }}
        >
            <Text style={[styles.buttonLabel, { color: ink }]} numberOfLines={2}>{label}</Text>
            {busy || arrow ? (
                <View style={styles.buttonTrail}>
                    {busy ? <ActivityIndicator color={ink} /> : <ArrowRightGlyph color={ink} />}
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

interface TextLinkProps {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    tone?: 'link' | 'muted' | 'danger';
    accessibilityHint?: string;
    leading?: React.ReactNode;
}

export function TextLink({ label, onPress, disabled = false, tone = 'link', accessibilityHint, leading }: TextLinkProps) {
    const palette = useAccountPalette();
    const styles = useMemo(() => createControlStyles(palette), [palette]);
    const color = disabled ? palette.inkSecondary : tone === 'danger' ? palette.danger : tone === 'muted' ? palette.inkSecondary : palette.link;
    return (
        <TouchableOpacity
            style={styles.textLink}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled }}
            hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
        >
            {leading}
            <Text style={[styles.textLinkLabel, { color }]}>{label}</Text>
        </TouchableOpacity>
    );
}

interface ModeSwitchProps<T extends string> {
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
    disabled?: boolean;
}

/** Two segments on a tinted track, the chosen one lifted onto white. */
export function ModeSwitch<T extends string>({ value, options, onChange, disabled = false }: ModeSwitchProps<T>) {
    const palette = useAccountPalette();
    const styles = useMemo(() => createControlStyles(palette), [palette]);
    return (
        <View style={styles.track} accessibilityRole="tablist">
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        style={[styles.segment, selected && styles.segmentSelected]}
                        onPress={() => {
                            if (!selected) onChange(option.value);
                        }}
                        disabled={disabled}
                        accessibilityRole="tab"
                        accessibilityLabel={option.label}
                        accessibilityState={{ selected, disabled }}
                    >
                        <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]} numberOfLines={1}>
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

interface AuthNoticeProps {
    tone: 'error' | 'info' | 'warn';
    text: string;
}

export function AuthNotice({ tone, text }: AuthNoticeProps) {
    const palette = useAccountPalette();
    const styles = useMemo(() => createControlStyles(palette), [palette]);
    const color = tone === 'error' ? palette.danger : tone === 'warn' ? palette.warn : palette.info;
    const background = tone === 'error' ? palette.dangerSoft : tone === 'warn' ? palette.warnSoft : palette.infoSoft;
    return (
        <View
            style={[styles.notice, { backgroundColor: background }]}
            accessibilityRole={tone === 'error' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
        >
            <View style={styles.noticeIcon}>
                {tone === 'info' ? <MailGlyph color={color} /> : <AlertGlyph color={color} />}
            </View>
            <Text style={[styles.noticeText, { color: tone === 'info' ? palette.ink : color }]}>{text}</Text>
        </View>
    );
}

interface ConsentRowProps {
    checked: boolean;
    onToggle: () => void;
    error?: string | null;
    onOpenTerms: () => void;
    onOpenPrivacy: () => void;
}

/**
 * The agreement checkbox. The two document names are links of their own; VoiceOver reaches them
 * as actions on the checkbox, since one control cannot hold another.
 */
export function ConsentRow({ checked, onToggle, error, onOpenTerms, onOpenPrivacy }: ConsentRowProps) {
    const { l, locale } = useI18n();
    const palette = useAccountPalette();
    const styles = useMemo(() => createControlStyles(palette), [palette]);
    const termsLabel = l('Kullanım koşullarını aç', 'Open the terms of use');
    const privacyLabel = l('Gizlilik politikasını aç', 'Open the privacy policy');
    const openLink = (open: () => void) => (event: GestureResponderEvent) => {
        // On web the click would also reach the row and tick the box.
        event?.stopPropagation?.();
        open();
    };

    return (
        <View style={styles.consent}>
            <Pressable
                style={styles.consentRow}
                onPress={onToggle}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                aria-checked={checked}
                accessibilityLabel={l(
                    'Kullanım koşullarını ve gizlilik politikasını okudum, kabul ediyorum',
                    'I have read and accept the terms of use and the privacy policy',
                )}
                accessibilityHint={error ?? undefined}
                accessibilityActions={[{ name: 'terms', label: termsLabel }, { name: 'privacy', label: privacyLabel }]}
                onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'terms') onOpenTerms();
                    if (event.nativeEvent.actionName === 'privacy') onOpenPrivacy();
                }}
            >
                <View style={[styles.checkbox, checked && styles.checkboxChecked, error ? styles.checkboxError : null]}>
                    {checked ? <CheckGlyph color={palette.onPrimary} size={15} /> : null}
                </View>
                {/* The two languages put the links in different places, so each has its own sentence. */}
                {locale === 'tr' ? (
                    <Text style={styles.consentText}>
                        <Text style={styles.consentLink} onPress={openLink(onOpenTerms)} accessibilityRole="link">Kullanım koşullarını</Text>
                        {' ve '}
                        <Text style={styles.consentLink} onPress={openLink(onOpenPrivacy)} accessibilityRole="link">gizlilik politikasını</Text>
                        {' okudum, kabul ediyorum.'}
                    </Text>
                ) : (
                    <Text style={styles.consentText}>
                        {'I have read and accept the '}
                        <Text style={styles.consentLink} onPress={openLink(onOpenTerms)} accessibilityRole="link">terms of use</Text>
                        {' and the '}
                        <Text style={styles.consentLink} onPress={openLink(onOpenPrivacy)} accessibilityRole="link">privacy policy</Text>
                        {'.'}
                    </Text>
                )}
            </Pressable>
            {error ? <Text style={styles.consentError} accessibilityLiveRegion="polite">{error}</Text> : null}
        </View>
    );
}

/** The app icon, rounded as iOS rounds it. */
export function BrandMark({ size = 36 }: { size?: number }) {
    return (
        <Image
            source={require('../../assets/account/brand-mark.png')}
            style={{ width: size, height: size, borderRadius: size * 0.2237 }}
            accessibilityIgnoresInvertColors
            accessible={false}
        />
    );
}

function createControlStyles(palette: AccountPalette) {
    return StyleSheet.create({
        button: {
            minHeight: 54,
            borderRadius: 14,
            paddingHorizontal: 52,
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
        },
        buttonSecondary: { borderWidth: 1, borderColor: palette.fieldBorder },
        buttonLabel: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
        buttonTrail: {
            position: 'absolute',
            right: 18,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
        },
        // Where the link sits is the parent's choice (centred under a button, right of a field).
        textLink: {
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
        },
        textLinkLabel: { fontSize: 15, fontWeight: '600' },
        track: {
            flexDirection: 'row',
            padding: 4,
            borderRadius: 14,
            backgroundColor: palette.track,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: palette.divider,
        },
        segment: {
            flex: 1,
            minHeight: 40,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
        },
        segmentSelected: {
            backgroundColor: palette.trackSelected,
            ...dropShadow({ y: 1, blur: 3, opacity: palette.isDark ? 0.3 : 0.08, elevation: 1 }),
        },
        segmentLabel: { fontSize: 15, fontWeight: '500', color: palette.inkSecondary },
        segmentLabelSelected: { fontWeight: '600', color: palette.ink },
        notice: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
        },
        noticeIcon: { paddingTop: 1 },
        noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
        consent: { gap: 6 },
        consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
        checkbox: {
            width: 22,
            height: 22,
            marginTop: 1,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: palette.fieldBorder,
            backgroundColor: palette.field,
            alignItems: 'center',
            justifyContent: 'center',
        },
        checkboxChecked: { backgroundColor: palette.primary, borderColor: palette.primary },
        checkboxError: { borderColor: palette.danger },
        consentText: { flex: 1, fontSize: 14, lineHeight: 21, color: palette.inkSecondary },
        consentLink: {
            color: palette.link,
            fontWeight: '600',
            textDecorationLine: 'underline',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' as never } : null),
        },
        consentError: { fontSize: 13, lineHeight: 18, color: palette.danger, paddingLeft: 34 },
    });
}
