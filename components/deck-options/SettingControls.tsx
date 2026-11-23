import React, { useContext, useEffect, useState, type ReactNode, type Ref } from 'react';
import { Keyboard, ScrollView, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, type TextInput } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { sanitizeNumericDraft } from '../../lib/deckOptionsForm';
import { useI18n } from '../../hooks/useI18n';
import { useHelpHandoff } from '../../hooks/useHelpHandoff';
import { Button, HelpButton } from '../ui/Button';
import { Card, Divider } from '../ui/Card';
import { SegmentedControl } from '../ui/Choice';
import { AppDialog } from '../ui/Dialog';
import { Notice } from '../ui/Feedback';
import { TextField } from '../ui/Fields';
import { ListRow, SelectRow, ValueRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';
import { Type } from '../ui/tokens';
import { SheetScrollView } from '../SwipeDismissSheet';
import { DeckOptionsContext } from './DeckOptionsContext';
import type { OptionHelp, SelectOption } from './types';

/**
 * The deck options form's controls, drawn from the design system: each section is a `Card` of
 * rows (`ValueRow` + `TextField`, `SwitchRow`, `SelectRow`), its help a "?" that opens a sheet,
 * its advice a `Notice` under the row it is about.
 */

/**
 * A card's rows as a flat list. The card draws a hairline between its direct children, and a
 * fragment counts as one, so rows that appear together behind a condition are unwrapped here.
 */
function flattenRows(children: ReactNode, prefix = ''): React.ReactNode[] {
    return React.Children.toArray(children).flatMap((child) => {
        if (!React.isValidElement(child)) return [child];
        const key = `${prefix}${child.key ?? ''}`;
        if (child.type === React.Fragment) {
            return flattenRows((child.props as { children?: ReactNode }).children, `${key}/`);
        }
        return [React.cloneElement(child, { key })];
    });
}

/** A card of setting rows with a hairline between them, whatever fragments group them in the source. */
export function SettingsCard({ children, title, description, accessory, style }: {
    children: ReactNode;
    title?: string;
    description?: string;
    accessory?: ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    return (
        <Card divided title={title} description={description} accessory={accessory} style={style}>
            {flattenRows(children)}
        </Card>
    );
}

export function OptionCard({ title, description, children, wide = false, help }: {
    title: string;
    /** Under the title: what the section is for. */
    description?: string;
    children: ReactNode;
    /** Half the width, for the two-column layout of a wide window. */
    wide?: boolean;
    help?: OptionHelp;
}) {
    const colors = useThemeColors();
    const [helpOpen, setHelpOpen] = useState(false);
    const { l } = useI18n();
    const closeHelp = () => setHelpOpen(false);
    const helpLink = useHelpHandoff(helpOpen, closeHelp, help?.more ?? { article: 'deck-options' });

    return (
        <>
            <SettingsCard
                title={title}
                description={description}
                accessory={help ? (
                    <HelpButton
                        accessibilityLabel={`${title}: ${help.title}`}
                        accessibilityHint={help.summary}
                        onPress={() => { Keyboard.dismiss(); setHelpOpen(true); }}
                        expanded={helpOpen}
                    />
                ) : undefined}
                style={wide ? styles.cardWide : styles.card}
            >
                {children}
            </SettingsCard>
            {help ? (
                <AppSheet visible={helpOpen} onClose={closeHelp} onDismiss={helpLink.onDismiss} title={help.title} backdropLabel={help.dismissLabel}>
                    <SheetScrollView style={styles.helpScroll} contentContainerStyle={styles.helpContent} showsVerticalScrollIndicator={false}>
                        <Text style={[Type.rowTitle, styles.helpSummary, { color: colors.textPrimary }]}>{help.summary}</Text>
                        <View style={styles.helpPoints}>
                            {help.points.map((point, index) => (
                                <View key={`${index}-${point}`} style={styles.helpPointRow}>
                                    <View style={[styles.helpPointDot, { backgroundColor: colors.accent }]} />
                                    <Text style={[Type.caption, styles.helpPointText, { color: colors.textSecondary }]}>{point}</Text>
                                </View>
                            ))}
                        </View>
                        {help.note ? <Notice title={help.noteLabel}>{help.note}</Notice> : null}
                    </SheetScrollView>
                    <Button label={l('Daha fazla bilgi', 'Learn more')} variant="plain" onPress={helpLink.open} style={styles.helpDismiss} />
                </AppSheet>
            ) : null}
        </>
    );
}

/** Free content of a card (a button with its explanation, a multi-line field), inset like a row. */
export function SettingBlock({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.block, style]}>{children}</View>;
}

/** The explanation under a control. */
export function SettingHint({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    const colors = useThemeColors();
    return <Text style={[Type.caption, { color: colors.textMuted }, style as object]}>{children}</Text>;
}

function FieldError({ children, inset = true }: { children: string; inset?: boolean }) {
    const colors = useThemeColors();
    return (
        <Text
            style={[Type.caption, styles.error, inset && styles.underRow, { color: colors.danger }]}
            accessibilityLiveRegion="polite"
        >
            {children}
        </Text>
    );
}

/** Full-width text block, for values too long to sit beside their label (FSRS parameters). */
export function TextBlockSetting({ label, value, onChange, hint, error, placeholder, advice }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    hint?: string;
    error?: string;
    placeholder?: string;
    /** The field whose advice (`FieldAdvice`) is printed under this one. */
    advice?: string;
}) {
    return (
        <SettingBlock>
            <TextField
                label={label}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                multiline
                invalid={Boolean(error)}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityHint={error}
            />
            {error ? <FieldError inset={false}>{error}</FieldError> : null}
            {hint && !error ? <SettingHint>{hint}</SettingHint> : null}
            {advice ? <FieldAdvice field={advice} inset={false} /> : null}
        </SettingBlock>
    );
}

export function NumberSetting({ label, value, onChange, suffix, hint, kind = 'integer', error, inputRef, placeholder, advice }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix?: string;
    hint?: string;
    kind?: 'integer' | 'decimal' | 'steps' | 'text';
    error?: string;
    inputRef?: Ref<TextInput>;
    placeholder?: string;
    /** The field whose advice (`FieldAdvice`) is printed under this row. */
    advice?: string;
}) {
    const colors = useThemeColors();
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
        <View collapsable={false}>
            <ValueRow label={label} summary={hint}>
                <TextField
                    ref={inputRef}
                    style={freeText ? styles.textValue : styles.numberValue}
                    invalid={Boolean(error)}
                    value={isFocused ? draft : value}
                    placeholder={placeholder}
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
                {suffix ? <Text style={[Type.caption, { color: colors.textMuted }]}>{suffix}</Text> : null}
            </ValueRow>
            {error ? <FieldError>{error}</FieldError> : null}
            {advice ? <FieldAdvice field={advice} /> : null}
        </View>
    );
}

export function SelectSetting({ label, value, options, onChange, cancelLabel, advice }: {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    cancelLabel: string;
    /** The field whose advice (`FieldAdvice`) is printed under this row. */
    advice?: string;
}) {
    const [open, setOpen] = useState(false);
    const close = () => setOpen(false);
    const selected = options.find((option) => option.key === value) ?? options[0];
    return (
        <View>
            <SelectRow
                label={label}
                value={selected?.label ?? ''}
                onPress={() => { Keyboard.dismiss(); setOpen(true); }}
                accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
            />
            {advice ? <FieldAdvice field={advice} /> : null}
            {open ? (
                <AppDialog
                    visible
                    onClose={close}
                    title={label}
                    actions={<Button label={cancelLabel} variant="plain" tone="muted" onPress={close} />}
                >
                    <ScrollView style={styles.optionList} accessibilityRole="radiogroup">
                        {options.map((option, index) => (
                            <React.Fragment key={option.key}>
                                {index > 0 ? <Divider /> : null}
                                <ListRow
                                    title={option.label}
                                    selected={option.key === value}
                                    onPress={() => { onChange(option.key); close(); }}
                                    style={styles.dialogRow}
                                />
                            </React.Fragment>
                        ))}
                    </ScrollView>
                </AppDialog>
            ) : null}
        </View>
    );
}

/** Which value a limit edits: the preset's, this deck's own or today's only. */
export function LimitTabs<Key extends 'preset' | 'deck' | 'today'>({ value, onChange, labels, keys, accessibilityLabel }: {
    value: Key;
    onChange: (value: Key) => void;
    labels: { preset: string; deck: string; today: string };
    /** The tabs to offer; desired retention has no "today only" value in Anki. */
    keys?: readonly Key[];
    /** Names the choice for VoiceOver, e.g. "Maximum reviews/day applies to". */
    accessibilityLabel: string;
}) {
    return (
        <SegmentedControl
            options={(keys ?? (['preset', 'deck', 'today'] as unknown as readonly Key[])).map((key) => ({ value: key, label: labels[key] }))}
            value={value}
            onChange={onChange}
            accessibilityLabel={accessibilityLabel}
            fill
            style={styles.limitTabs}
        />
    );
}

export function Field({ field, label, value, onChange, hint, suffix, kind = 'integer', inputRef, placeholder, advice }: {
    field: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    hint?: string;
    suffix?: string;
    kind?: 'integer' | 'decimal' | 'steps' | 'text';
    inputRef?: Ref<TextInput>;
    placeholder?: string;
    /** The field whose advice (`FieldAdvice`) is printed under this row. */
    advice?: string;
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
            inputRef={inputRef}
            placeholder={placeholder}
            advice={advice}
        />
    );
}

/**
 * Anki's `Warning` rows: what the value in the field above will do, printed where it applies.
 * Nothing here stops a save — that is the difference between advice and an error. It belongs
 * inside the row it is about (a control's `advice`), never as a row of its own: a card would draw
 * a hairline around nothing while there is no advice.
 */
export function FieldAdvice({ field, inset = true }: {
    field: string;
    /** Insets itself like a row; off inside a `SettingBlock`, which is inset already. */
    inset?: boolean;
}) {
    const ctx = useContext(DeckOptionsContext);
    const items = ctx?.warnings[field];
    if (!ctx || !items?.length) return null;
    return (
        <View style={[styles.advice, inset && styles.underRow]}>
            {items.map((warning) => (
                <Notice key={warning.id} tone={warning.level === 'danger' ? 'danger' : warning.level === 'info' ? 'info' : 'warning'}>
                    {ctx.warningText(warning.id)}
                </Notice>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { width: '100%' },
    cardWide: { width: '49.25%' },
    helpScroll: { flexShrink: 1 },
    helpContent: { gap: Spacing.lg, paddingBottom: Spacing.md },
    helpSummary: { lineHeight: 23 },
    helpPoints: { gap: Spacing.md },
    helpPointRow: { flexDirection: 'row', alignItems: 'flex-start' },
    helpPointDot: { width: 7, height: 7, marginTop: 7, marginRight: Spacing.sm, borderRadius: 4 },
    helpPointText: { flex: 1, lineHeight: 21 },
    helpDismiss: { marginTop: Spacing.sm },
    block: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
    numberValue: { width: 96 },
    textValue: { width: 150 },
    error: { fontWeight: '500' },
    // What hangs under a row (its error, its advice) shares the row's inset and closes its gap.
    underRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm + 2 },
    advice: { gap: Spacing.sm },
    optionList: { flexShrink: 1 },
    // A row set in a dialog lines up with the dialog's title, not a card's inset.
    dialogRow: { paddingHorizontal: 0 },
    limitTabs: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
});
