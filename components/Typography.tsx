import React, { forwardRef } from 'react';
import {
    Text as RNText,
    TextInput as RNTextInput,
} from 'react-native';

/**
 * Dynamic Type caps. React Native scales every Text with the system font size and has no global
 * setting, so screens import these drop-ins instead of the react-native ones (the same pattern
 * `components/Touchable` uses for press feedback). Without a cap, the largest accessibility sizes
 * push labels past fixed row heights and clip button text; 1.4x keeps the app legible at
 * "Daha Büyük Metin" settings while still honouring the user's preference. An explicit
 * `maxFontSizeMultiplier` still wins — pass 1 for numeric badges that must not grow.
 */
export const MAX_FONT_SCALE = 1.4;

/** Inputs get a slightly tighter cap: their height is driven by the platform text view. */
export const MAX_INPUT_FONT_SCALE = 1.3;

type TextProps = React.ComponentProps<typeof RNText>;
type TextInputProps = React.ComponentProps<typeof RNTextInput>;

export const Text = forwardRef<React.ComponentRef<typeof RNText>, TextProps>(
    function Text(props, ref) {
        return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} ref={ref} />;
    },
);

export const TextInput = forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>(
    function TextInput(props, ref) {
        return <RNTextInput maxFontSizeMultiplier={MAX_INPUT_FONT_SCALE} {...props} ref={ref} />;
    },
);
