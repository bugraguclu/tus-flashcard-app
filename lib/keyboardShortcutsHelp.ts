/**
 * Opens the web build's list of keyboard shortcuts from anywhere: the `?` key and the deck list's
 * ••• menu ask for it, and `WebAppIntegrations` shows it.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function openKeyboardShortcuts(): void {
    listeners.forEach((listener) => listener());
}

export function onKeyboardShortcutsRequested(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
