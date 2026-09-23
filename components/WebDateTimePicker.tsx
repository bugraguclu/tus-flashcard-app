import React from 'react';
import type { DateTimePickerChangeEvent, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useIsDarkTheme, useThemeColors } from '../constants/theme';

/**
 * Browser implementation of `@react-native-community/datetimepicker`.
 *
 * The package ships no web build — on web its default export renders nothing — so `metro.config.js`
 * resolves the package to this file for the web platform. It keeps the package's component
 * contract (`value`, `mode`, `minimumDate`, `maximumDate`, `onChange`/`onValueChange`) and draws the
 * browser's own date and time controls, which are the web counterpart of the compact iOS picker.
 */

type PickerMode = 'date' | 'time' | 'datetime' | 'countdown';

type Props = {
    value: Date;
    mode?: PickerMode;
    minimumDate?: Date;
    maximumDate?: Date;
    disabled?: boolean;
    testID?: string;
    accentColor?: string;
    onChange?: (event: DateTimePickerEvent, date?: Date) => void;
    onValueChange?: (event: DateTimePickerChangeEvent, date: Date) => void;
    // Accepted for API compatibility; the browser control has no equivalent for these.
    display?: string;
    locale?: string;
    is24Hour?: boolean;
    minuteInterval?: number;
};

const pad = (value: number): string => String(value).padStart(2, '0');

function localDateString(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeString(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function inputType(mode: PickerMode): 'date' | 'time' | 'datetime-local' {
    if (mode === 'time' || mode === 'countdown') return 'time';
    if (mode === 'datetime') return 'datetime-local';
    return 'date';
}

function formatForInput(date: Date, mode: PickerMode): string {
    const type = inputType(mode);
    if (type === 'time') return localTimeString(date);
    if (type === 'datetime-local') return `${localDateString(date)}T${localTimeString(date)}`;
    return localDateString(date);
}

/**
 * Read the control's value back as a local date. The parts the control does not edit keep the
 * values they had, so a date picker never moves the time of day and a time picker never the day.
 */
export function parseWebPickerValue(raw: string, mode: PickerMode, previous: Date): Date | null {
    const next = new Date(previous.getTime());
    const type = inputType(mode);
    const dateMatch = /^(\d{4,})-(\d{2})-(\d{2})/.exec(raw);
    const timeMatch = /(?:^|T)(\d{2}):(\d{2})/.exec(raw);
    if (type !== 'time') {
        if (!dateMatch) return null;
        next.setFullYear(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
    }
    if (type !== 'date') {
        if (!timeMatch) return null;
        next.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    }
    return Number.isNaN(next.getTime()) ? null : next;
}

export default function WebDateTimePicker({
    value,
    mode = 'date',
    minimumDate,
    maximumDate,
    disabled,
    testID,
    accentColor,
    onChange,
    onValueChange,
}: Props) {
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const type = inputType(mode);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = parseWebPickerValue(event.target.value, mode, value);
        // Clearing the field is the browser's way of dismissing without a choice.
        if (!next) return;
        if (minimumDate && next.getTime() < minimumDate.getTime()) return;
        if (maximumDate && next.getTime() > maximumDate.getTime()) return;
        const nativeEvent = { timestamp: next.getTime(), utcOffset: -next.getTimezoneOffset() };
        onValueChange?.({ nativeEvent }, next);
        onChange?.({ type: 'set', nativeEvent }, next);
    };

    return (
        <input
            type={type}
            value={formatForInput(value, mode)}
            min={minimumDate ? formatForInput(minimumDate, mode) : undefined}
            max={maximumDate ? formatForInput(maximumDate, mode) : undefined}
            disabled={disabled}
            data-testid={testID}
            onChange={handleChange}
            style={{
                font: 'inherit',
                fontSize: 15,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                accentColor: accentColor ?? colors.accent,
                colorScheme: isDark ? 'dark' : 'light',
            }}
        />
    );
}
