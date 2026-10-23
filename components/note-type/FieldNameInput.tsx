import { useEffect, useRef, useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

interface FieldNameInputProps {
    name: string;
    /** Called once per edit, when the input loses focus or Return is pressed, with the typed text. */
    onCommit: (draft: string) => void;
    /** Reports whether typed text is waiting to be committed, for the screen's unsaved-changes guard. */
    onPendingChange?: (pending: boolean) => void;
    accessibilityLabel?: string;
    placeholderTextColor?: string;
    style?: StyleProp<TextStyle>;
}

/**
 * A field-name input that keeps keystrokes as a local draft. Renaming a field rewrites every
 * template reference to it, so the rename must run once with the final name: applied per
 * keystroke, an intermediate name equal to another field's would capture that field's
 * references too.
 */
export function FieldNameInput({
    name,
    onCommit,
    onPendingChange,
    accessibilityLabel,
    placeholderTextColor,
    style,
}: FieldNameInputProps) {
    const [draft, setDraft] = useState<string | null>(null);
    // Return fires onSubmitEditing and then onBlur; the ref lets the second one see the first's commit.
    const draftRef = useRef<string | null>(null);
    const pendingChangeRef = useRef(onPendingChange);
    pendingChangeRef.current = onPendingChange;

    const updateDraft = (next: string | null) => {
        const wasPending = draftRef.current !== null;
        draftRef.current = next;
        setDraft(next);
        if (wasPending !== (next !== null)) pendingChangeRef.current?.(next !== null);
    };

    const commit = () => {
        const pending = draftRef.current;
        if (pending === null) return;
        updateDraft(null);
        onCommit(pending);
    };

    // A row removed while its draft is pending must not leave the screen marked dirty.
    useEffect(() => () => {
        if (draftRef.current !== null) pendingChangeRef.current?.(false);
    }, []);

    return (
        <TextInput
            style={style}
            value={draft ?? name}
            onChangeText={updateDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
            autoCorrect={false}
            accessibilityLabel={accessibilityLabel}
            placeholderTextColor={placeholderTextColor}
        />
    );
}
