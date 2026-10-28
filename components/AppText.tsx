import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, useWindowDimensions } from 'react-native';
import {
    effectiveTextMultiplier,
    remainingSystemMultiplier,
    scaleTextStyle,
} from '../lib/textScale';

/**
 * Text and TextInput drawn at the in-app text size (Settings → General → Text size). Screens
 * import these instead of React Native's, keep their fixed styles, and get the user's step;
 * `lib/appText.test.ts` keeps it that way.
 *
 * `allowFontScaling={false}` opts a Text out of both the in-app and the system text size, as it
 * does in React Native. `maxFontSizeMultiplier` caps the two together: geometry drawn around a
 * fixed number of glyphs (a calendar day, a badge) uses it instead of guessing at wrap points.
 */

type TextScale = {
    multiplier: number;
    /** Inside another Text, where a missing `fontSize` means the parent's, not the default. */
    nested: boolean;
};

const TextScaleContext = createContext<TextScale>({ multiplier: 1, nested: false });

export function TextScaleProvider({ multiplier, children }: { multiplier: number; children?: React.ReactNode }) {
    const value = useMemo<TextScale>(() => ({ multiplier, nested: false }), [multiplier]);
    return <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>;
}

/** The multiplier Text below this point is drawn at; 1 means the designed size. */
export function useTextScale(): number {
    return useContext(TextScaleContext).multiplier;
}

/**
 * How much larger than designed text is drawn here: the in-app step times the system text size.
 * Geometry that has to hold a known piece of text, like a table column, grows by this.
 */
export function useLayoutTextScale(): number {
    const { fontScale } = useWindowDimensions();
    return useTextScale() * (fontScale > 0 ? fontScale : 1);
}

export type Text = NativeText;
type TextProps = React.ComponentPropsWithRef<typeof NativeText>;

export function Text(props: TextProps) {
    const scale = useContext(TextScaleContext);
    const own = effectiveTextMultiplier(scale.multiplier, props.allowFontScaling, props.maxFontSizeMultiplier);
    const inner = useMemo<TextScale>(() => ({ multiplier: own, nested: true }), [own]);
    // The designed size is React Native's own Text, with no extra work per row.
    if (scale.multiplier === 1) return <NativeText {...props} />;
    const patch = own === 1 ? null : scaleTextStyle(StyleSheet.flatten(props.style), own, scale.nested);
    return (
        <TextScaleContext.Provider value={inner}>
            <NativeText
                {...props}
                style={patch ? [props.style, patch] : props.style}
                maxFontSizeMultiplier={remainingSystemMultiplier(props.maxFontSizeMultiplier, own)}
            />
        </TextScaleContext.Provider>
    );
}

export type TextInput = NativeTextInput;
type TextInputProps = React.ComponentPropsWithRef<typeof NativeTextInput>;

export function TextInput(props: TextInputProps) {
    const { multiplier } = useContext(TextScaleContext);
    const own = effectiveTextMultiplier(multiplier, props.allowFontScaling, props.maxFontSizeMultiplier);
    if (own === 1) return <NativeTextInput {...props} />;
    const patch = scaleTextStyle(StyleSheet.flatten(props.style), own);
    return (
        <NativeTextInput
            {...props}
            style={[props.style, patch]}
            maxFontSizeMultiplier={remainingSystemMultiplier(props.maxFontSizeMultiplier, own)}
        />
    );
}
