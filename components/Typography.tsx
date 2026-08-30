import React, { forwardRef } from 'react';
import {
    Text as RNText,
    TextInput as RNTextInput,
} from 'react-native';
import {
    DEFAULT_TYPE_ROLE,
    INPUT_FONT_SCALE_CAP,
    fontScaleCap,
    type TypeRole,
} from '../lib/typography';

/**
 * Dynamic Type caps. React Native scales every Text with the system font size and has no global
 * setting, so screens import these drop-ins instead of the react-native ones (the same pattern
 * `components/Touchable` uses for press feedback). Without a cap, the largest accessibility sizes
 * push labels past fixed row heights and clip button text.
 *
 * The cap is chosen per role (see lib/typography.ts): body copy grows furthest because that is
 * what the reader actually needs bigger, while a title sharing a row with controls, or a count
 * inside a pill, has almost no room to give. `scaleRole` picks the role — the prop is not called
 * `role` because React Native already uses that name for the ARIA role. An explicit
 * `maxFontSizeMultiplier` still wins over both.
 */

/** Body cap, kept as a named export for callers that need the number rather than a role. */
export const MAX_FONT_SCALE = fontScaleCap(DEFAULT_TYPE_ROLE);

/** Inputs get a tighter cap: their height is driven by the platform text view. */
export const MAX_INPUT_FONT_SCALE = INPUT_FONT_SCALE_CAP;

type TextProps = React.ComponentProps<typeof RNText> & { scaleRole?: TypeRole };
type TextInputProps = React.ComponentProps<typeof RNTextInput> & { scaleRole?: TypeRole };

export const Text = forwardRef<React.ComponentRef<typeof RNText>, TextProps>(
    function Text({ scaleRole, ...props }, ref) {
        return <RNText maxFontSizeMultiplier={fontScaleCap(scaleRole)} {...props} ref={ref} />;
    },
);

export const TextInput = forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>(
    function TextInput({ scaleRole, ...props }, ref) {
        return (
            <RNTextInput
                maxFontSizeMultiplier={scaleRole ? fontScaleCap(scaleRole) : MAX_INPUT_FONT_SCALE}
                {...props}
                ref={ref}
            />
        );
    },
);
