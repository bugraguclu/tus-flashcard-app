import { Fragment, useContext, useEffect, useState, type ReactNode, type Ref } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../AppText';
import { sanitizeNumericDraft } from '../../lib/deckOptionsForm';
import { Button, HelpButton } from '../ui/Button';
import { Card, Divider } from '../ui/Card';
import { SegmentedControl } from '../ui/Choice';
import { AppDialog } from '../ui/Dialog';
import { Notice } from '../ui/Feedback';
import { TextField } from '../ui/Fields';
import { ListRow, SelectRow, ValueRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';
import { DeckOptionsContext } from './DeckOptionsContext';
import type { DeckOptionsStyles } from './deckOptionsStyles';
import type { OptionHelp, SelectOption } from './types';

/**
 * A card of options. Its children sit between the card's hairlines, one per row: a control and the
 * advice printed under it go together in one fragment, so advice that is not shown leaves no line.
 */
export function OptionCard({ title, children, styles, wide = false, help }: {
    title: string;
    children: ReactNode;
    styles: DeckOptionsStyles;
    wide?: boolean;
    help?: OptionHelp;
}) {
    const [helpOpen, setHelpOpen] = useState(false);
    const closeHelp = () => setHelpOpen(false);

    return (
        <View style={[styles.optionCard, wide && styles.optionCardWide]}>
            <Card
                divided
                title={title}
                accessory={help ? (
                    <HelpButton
                        accessibilityLabel={`${title}: ${help.title}`}
                        accessibilityHint={help.summary}
                        expanded={helpOpen}
                        onPress={() => { Keyboard.dismiss(); setHelpOpen(true); }}
                    />
                ) : undefined}
            >
                {children}
            </Card>
            {help ? (
                <AppSheet
                    visible={helpOpen}
                    onClose={closeHelp}
                    title={help.title}
                    subtitle={help.eyebrow}
                    closeButton
                    closeLabel={help.dismissLabel}
                    backdropLabel={help.dismissLabel}
                >
                    <ScrollView
                        style={styles.helpScroll}
                        contentContainerStyle={styles.helpContent}
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
                        {help.note ? <Notice title={help.noteLabel}>{help.note}</Notice> : null}
                    </ScrollView>
                    <Button label={help.dismissLabel} onPress={closeHelp} style={styles.helpDismiss} />
                </AppSheet>
            ) : null}
        </View>
    );
}

/** Full-width text block, for values too long to sit beside their label (FSRS parameters). */
export function TextBlockSetting({ label, value, onChange, styles, hint, error, placeholder }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    styles: DeckOptionsStyles;
    hint?: string;
    error?: string;
    placeholder?: string;
}) {
    return (
        <View style={styles.block}>
            <Text style={styles.blockLabel}>{label}</Text>
            <TextField
                style={styles.parameterField}
                invalid={Boolean(error)}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                multiline
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={label}
                accessibilityHint={error}
            />
            {error ? <Text style={styles.fieldErrorInline} accessibilityLiveRegion="polite">{error}</Text> : null}
            {hint && !error ? <Text style={styles.blockHint}>{hint}</Text> : null}
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
        <View collapsable={false}>
            <ValueRow label={label} summary={hint}>
                <View style={styles.numberControl}>
                    <TextField
                        ref={inputRef}
                        style={freeText ? styles.wideField : styles.numberField}
                        invalid={Boolean(error)}
                        textAlign="right"
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
                    {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
                </View>
            </ValueRow>
            {error ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{error}</Text> : null}
        </View>
    );
}

export function SelectSetting({ label, value, options, onChange, styles, cancelLabel }: {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    styles: DeckOptionsStyles;
    cancelLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find((option) => option.key === value) ?? options[0];
    return (
        <>
            <SelectRow label={label} value={selected?.label ?? ''} onPress={() => setOpen(true)} />
            {open ? (
                <AppDialog
                    visible
                    onClose={() => setOpen(false)}
                    title={label}
                    actions={<Button variant="plain" label={cancelLabel} onPress={() => setOpen(false)} />}
                >
                    <ScrollView style={styles.optionList}>
                        {options.map((option, index) => (
                            <Fragment key={option.key}>
                                {index > 0 ? <Divider /> : null}
                                <ListRow
                                    title={option.label}
                                    selected={option.key === value}
                                    onPress={() => { onChange(option.key); setOpen(false); }}
                                    style={styles.dialogRow}
                                />
                            </Fragment>
                        ))}
                    </ScrollView>
                </AppDialog>
            ) : null}
        </>
    );
}

export function LimitTabs<Key extends 'preset' | 'deck' | 'today'>({ value, onChange, styles, labels, keys, accessibilityLabel }: {
    value: Key;
    onChange: (value: Key) => void;
    styles: DeckOptionsStyles;
    labels: { preset: string; deck: string; today: string };
    /** The tabs to offer; desired retention has no "today only" value in Anki. */
    keys?: readonly Key[];
    /** Names the value the tabs choose the scope of, for VoiceOver. */
    accessibilityLabel: string;
}) {
    const options = (keys ?? (['preset', 'deck', 'today'] as unknown as readonly Key[]))
        .map((key) => ({ value: key, label: labels[key] }));
    return (
        <SegmentedControl
            options={options}
            value={value}
            onChange={onChange}
            accessibilityLabel={accessibilityLabel}
            style={styles.limitTabs}
        />
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
    return (
        <View style={ctx.styles.adviceList}>
            {items.map((warning) => (
                <Notice key={warning.id} tone={warning.level}>
                    {ctx.warningText(warning.id)}
                </Notice>
            ))}
        </View>
    );
}
