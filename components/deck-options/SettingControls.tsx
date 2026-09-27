import { useContext, useEffect, useState, type ReactNode, type Ref } from 'react';
import {
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ColorScheme } from '../../constants/theme';
import { sanitizeNumericDraft } from '../../lib/deckOptionsForm';
import SwipeDismissSheet from '../SwipeDismissSheet';
import { DeckOptionsContext } from './DeckOptionsContext';
import type { DeckOptionsStyles } from './deckOptionsStyles';
import type { OptionHelp, SelectOption } from './types';

export function OptionCard({ title, children, styles, wide = false, help }: {
    title: string;
    children: ReactNode;
    styles: DeckOptionsStyles;
    wide?: boolean;
    help?: OptionHelp;
}) {
    const { height: windowHeight } = useWindowDimensions();
    const [helpOpen, setHelpOpen] = useState(false);
    const closeHelp = () => setHelpOpen(false);

    return (
        <View style={[styles.optionCard, wide && styles.optionCardWide]}>
            <View style={styles.optionCardHeader}>
                <Text style={styles.optionCardTitle}>{title}</Text>
                {help ? (
                    <TouchableOpacity
                        style={styles.helpButton}
                        onPress={() => { Keyboard.dismiss(); setHelpOpen(true); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${title}: ${help.title}`}
                        accessibilityHint={help.summary}
                        accessibilityState={{ expanded: helpOpen }}
                    >
                        <View style={[styles.helpBadge, { pointerEvents: 'none' }]}>
                            <Text style={styles.helpBadgeText}>?</Text>
                        </View>
                    </TouchableOpacity>
                ) : null}
            </View>
            <View style={styles.optionCardBody}>{children}</View>
            {help && helpOpen ? (
                <Modal
                    visible={helpOpen}
                    transparent
                    animationType="slide"
                    onRequestClose={closeHelp}
                    statusBarTranslucent
                >
                    <SafeAreaView style={styles.helpOverlay}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={closeHelp}
                            accessibilityLabel={help.dismissLabel}
                        />
                        <SwipeDismissSheet
                            active={helpOpen}
                            style={[styles.helpSheet, { maxHeight: Math.max(280, windowHeight - 120) }]}
                            onDismiss={closeHelp}
                            accessibilityViewIsModal
                        >
                            <View style={styles.helpSheetHeader}>
                                <View style={styles.helpSheetTitleWrap}>
                                    <Text style={styles.helpSheetEyebrow}>{help.eyebrow}</Text>
                                    <Text style={styles.helpSheetTitle}>{help.title}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.helpCloseButton}
                                    onPress={closeHelp}
                                    accessibilityRole="button"
                                    accessibilityLabel={help.dismissLabel}
                                >
                                    <Text style={styles.helpCloseText}>×</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                style={styles.helpSheetScroll}
                                contentContainerStyle={styles.helpSheetContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={styles.helpSummary}>{help.summary}</Text>
                                <View style={styles.helpPoints}>
                                    {help.points.map((point, index) => (
                                        <View key={`${index}-${point}`} style={styles.helpPointRow}>
                                            <View style={styles.helpPointDot} />
                                            <Text style={styles.helpPointText}>{point}</Text>
                                        </View>
                                    ))}
                                </View>
                                {help.note ? (
                                    <View style={styles.helpNote}>
                                        <Text style={styles.helpNoteLabel}>{help.noteLabel}</Text>
                                        <Text style={styles.helpNoteText}>{help.note}</Text>
                                    </View>
                                ) : null}
                            </ScrollView>
                            <TouchableOpacity
                                style={styles.helpDismissButton}
                                onPress={closeHelp}
                                accessibilityRole="button"
                            >
                                <Text style={styles.helpDismissText}>{help.dismissLabel}</Text>
                            </TouchableOpacity>
                        </SwipeDismissSheet>
                    </SafeAreaView>
                </Modal>
            ) : null}
        </View>
    );
}

/** Full-width text block, for values too long to sit beside their label (FSRS parameters). */
export function TextBlockSetting({ label, value, onChange, styles, colors, hint, error, placeholder }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    styles: DeckOptionsStyles;
    colors: ColorScheme;
    hint?: string;
    error?: string;
    placeholder?: string;
}) {
    return (
        <View style={styles.settingBlock}>
            <Text style={styles.settingLabel}>{label}</Text>
            <TextInput
                style={[styles.input, styles.parameterInput, error && styles.numberInputInvalid]}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                multiline
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={label}
                accessibilityHint={error}
            />
            {error ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{error}</Text> : null}
            {hint && !error ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        </View>
    );
}

function NumberSetting({ label, value, onChange, styles, suffix, hint, kind = 'integer', error, inputRef, placeholder }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    styles: DeckOptionsStyles;
    suffix?: string;
    hint?: string;
    kind?: 'integer' | 'decimal' | 'steps' | 'text';
    error?: string;
    autoFocus?: boolean;
    inputRef?: Ref<TextInput>;
    placeholder?: string;
}) {
    const [draft, setDraft] = useState(value);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setDraft(value);
        }
    }, [isFocused, value]);

    const keyboardType = kind === 'integer'
        ? 'number-pad' as const
        : kind === 'decimal'
            ? 'decimal-pad' as const
            : 'default' as const;
    const inputMode = kind === 'integer'
        ? 'numeric' as const
        : kind === 'decimal'
            ? 'decimal' as const
            : 'text' as const;
    const freeText = kind === 'steps' || kind === 'text';
    const maxLength = kind === 'steps' ? 128 : kind === 'text' ? 32 : kind === 'decimal' ? 10 : 5;

    const handleChangeText = (text: string) => {
        const cleaned = freeText
            ? text.slice(0, maxLength)
            : sanitizeNumericDraft(text, kind === 'decimal').slice(0, maxLength);
        setDraft(cleaned);
        onChange(cleaned);
    };

    return (
        <View style={styles.settingBlock} collapsable={false}>
            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>{label}</Text>
                <View style={styles.numberControl}>
                    <TextInput
                        ref={inputRef}
                        style={[styles.numberInput, error && styles.numberInputInvalid]}
                        value={isFocused ? draft : value}
                        placeholder={placeholder}
                        placeholderTextColor={styles.inputSuffix.color}
                        onFocus={() => {
                            setIsFocused(true);
                            setDraft(value);
                        }}
                        onBlur={() => {
                            setIsFocused(false);
                            if (draft !== value) {
                                onChange(draft);
                            }
                        }}
                        onSubmitEditing={() => {
                            if (draft !== value) {
                                onChange(draft);
                            }
                        }}
                        onChangeText={handleChangeText}
                        keyboardType={keyboardType}
                        inputMode={inputMode}
                        maxLength={maxLength}
                        autoCorrect={false}
                        autoCapitalize="none"
                        spellCheck={false}
                        accessibilityLabel={label}
                        accessibilityHint={error}
                    />
                    {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
                </View>
            </View>
            {error ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{error}</Text> : null}
            {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
        </View>
    );
}

function ToggleSetting({ label, value, onChange, styles, colors, hint }: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    styles: DeckOptionsStyles;
    colors: ColorScheme;
    hint?: string;
}) {
    return (
        <View style={styles.settingBlock}>
            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>{label}</Text>
                <Switch
                    value={value}
                    onValueChange={onChange}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    accessibilityLabel={label}
                />
            </View>
            {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
        </View>
    );
}

export function SelectSetting({ label, value, options, onChange, styles, colors, cancelLabel }: {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    styles: DeckOptionsStyles;
    colors: ColorScheme;
    cancelLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find((option) => option.key === value) ?? options[0];
    return (
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{label}</Text>
            <TouchableOpacity
                style={styles.selectControl}
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
            >
                <Text style={styles.selectControlText} numberOfLines={1}>{selected?.label ?? ''}</Text>
                <Text style={styles.selectChevron}>⌄</Text>
            </TouchableOpacity>
            {open ? <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{label}</Text>
                        <ScrollView style={styles.selectList}>
                            {options.map((option) => (
                                <TouchableOpacity
                                    key={option.key}
                                    style={[styles.selectOption, option.key === value && styles.selectOptionActive]}
                                    onPress={() => { onChange(option.key); setOpen(false); }}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: option.key === value }}
                                >
                                    <Text style={[styles.selectOptionText, option.key === value && { color: colors.accent, fontWeight: '700' }]}>
                                        {option.label}
                                    </Text>
                                    {option.key === value ? <Text style={styles.selectCheck}>✓</Text> : null}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={cancelLabel}>
                            <Text style={styles.cancelText}>{cancelLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal> : null}
        </View>
    );
}

export function LimitTabs<Key extends 'preset' | 'deck' | 'today'>({ value, onChange, styles, labels, keys }: {
    value: Key;
    onChange: (value: Key) => void;
    styles: DeckOptionsStyles;
    labels: { preset: string; deck: string; today: string };
    /** The tabs to offer; desired retention has no "today only" value in Anki. */
    keys?: readonly Key[];
}) {
    return (
        <View style={styles.limitTabs}>
            {(keys ?? (['preset', 'deck', 'today'] as unknown as readonly Key[])).map((key) => (
                <TouchableOpacity
                    key={key}
                    style={[styles.limitTab, value === key && styles.limitTabActive]}
                    onPress={() => onChange(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: value === key }}
                >
                    <Text style={[styles.limitTabText, value === key && styles.limitTabTextActive]}>{labels[key]}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export function Field({ field, label, value, onChange, hint, suffix, kind = 'integer', autoFocus, inputRef, placeholder }: {
    field: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    hint?: string;
    suffix?: string;
    kind?: 'integer' | 'decimal' | 'steps' | 'text';
    autoFocus?: boolean;
    inputRef?: Ref<TextInput>;
    placeholder?: string;
}) {
    const ctx = useContext(DeckOptionsContext);
    if (!ctx) return null;
    return (
        <NumberSetting
            label={label}
            value={value}
            onChange={onChange}
            hint={hint}
            suffix={suffix}
            kind={kind}
            error={ctx.errors[field]}
            styles={ctx.styles}
            autoFocus={autoFocus}
            inputRef={inputRef}
            placeholder={placeholder}
        />
    );
}

/**
 * Anki's `Warning` rows: what the value in the field above will do, printed where it applies.
 * Nothing here stops a save — that is the difference between advice and an error.
 */
export function FieldAdvice({ field }: { field: string }) {
    const ctx = useContext(DeckOptionsContext);
    const items = ctx?.warnings[field];
    if (!ctx || !items?.length) return null;
    const { styles } = ctx;
    return (
        <>
            {items.map((warning) => (
                <View
                    key={warning.id}
                    style={[
                        styles.warningBox,
                        warning.level === 'danger' && styles.warningBoxDanger,
                        warning.level === 'info' && styles.warningBoxInfo,
                    ]}
                    accessibilityLiveRegion="polite"
                >
                    <Text style={[
                        styles.warningText,
                        warning.level === 'danger' && styles.warningTextDanger,
                        warning.level === 'info' && styles.warningTextInfo,
                    ]}>
                        {ctx.warningText(warning.id)}
                    </Text>
                </View>
            ))}
        </>
    );
}

export function SwitchRow({ label, value, onChange, hint }: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    hint?: string;
}) {
    const ctx = useContext(DeckOptionsContext);
    if (!ctx) return null;
    return (
        <ToggleSetting
            label={label}
            value={value}
            onChange={onChange}
            hint={hint}
            styles={ctx.styles}
            colors={ctx.colors}
        />
    );
}
