import { Text, TouchableOpacity, View } from 'react-native';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import type { ColorScheme } from '../../constants/theme';
import { KeyboardDismissIcon } from './EditorIcons';
import type { EditorStyles } from './editorStyles';
import type { EditorI18n } from './types';

interface KeyboardDoneProps {
    onPress: () => void;
    colors: ColorScheme;
    styles: EditorStyles;
    l: EditorI18n['l'];
}

function DoneButton({ onPress, colors, styles, l }: KeyboardDoneProps) {
    return (
        <TouchableOpacity
            style={styles.keyboardDismissButton}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={l('Klavyeyi kapat', 'Dismiss keyboard')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <KeyboardDismissIcon color={colors.accent} size={17} />
            <Text style={styles.keyboardDismissText}>{l('Kapat', 'Done')}</Text>
        </TouchableOpacity>
    );
}

/** The "Done" key inside the formatting toolbar. Shows itself while the keyboard is up. */
export function ToolbarKeyboardDoneButton(props: KeyboardDoneProps) {
    const keyboardVisible = useKeyboardVisible();
    return keyboardVisible ? <DoneButton {...props} /> : null;
}

/** The "Done" bar shown when the formatting toolbar is hidden. Shows itself while the keyboard is up. */
export function StandaloneKeyboardDoneBar(props: KeyboardDoneProps) {
    const keyboardVisible = useKeyboardVisible();
    if (!keyboardVisible) return null;
    return (
        <View style={props.styles.standaloneKeyboardDismissBar}>
            <DoneButton {...props} />
        </View>
    );
}
