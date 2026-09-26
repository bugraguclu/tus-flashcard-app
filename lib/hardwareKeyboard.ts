import type { Grade, KeyBindings } from './types';

/** Normalize React Native and DOM key names to the values stored in AppSettings. */
export function normalizeHardwareKey(key: string): string {
    if (key === 'Space' || key === 'Spacebar') return ' ';
    if (key === 'Esc') return 'Escape';
    return key;
}

/** Letter shortcuts follow Anki's case-insensitive behavior; named keys stay exact. */
export function matchesKeyBinding(key: string, binding: string): boolean {
    const normalizedKey = normalizeHardwareKey(key);
    return binding.length === 1
        ? normalizedKey.toLocaleLowerCase() === binding.toLocaleLowerCase()
        : normalizedKey === binding;
}

/** Anki treats Enter as the companion to the default Space reveal/Good shortcut. */
export function matchesShowAnswerKey(key: string, binding: string): boolean {
    const normalizedKey = normalizeHardwareKey(key);
    return matchesKeyBinding(normalizedKey, binding)
        || (binding === ' ' && normalizedKey === 'Enter');
}

export function gradeForHardwareKey(key: string, bindings: KeyBindings): Grade | null {
    if (matchesKeyBinding(key, bindings.again)) return 1;
    if (matchesKeyBinding(key, bindings.hard)) return 2;
    if (matchesKeyBinding(key, bindings.good)) return 3;
    if (matchesKeyBinding(key, bindings.easy)) return 4;
    return null;
}

const MODIFIER_ONLY_KEYS = new Set([
    'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Hyper', 'Super', 'Fn', 'FnLock',
    'CapsLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock', 'Dead', 'Process', 'Unidentified',
]);

/** A key that only shapes the next one (Shift, AltGr, a dead accent) and is never a binding itself. */
export function isModifierOnlyKey(key: string): boolean {
    return MODIFIER_ONLY_KEYS.has(key);
}

export interface KeyPress {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    /** `getModifierState('AltGraph')`: AltGr, which Windows also reports as Ctrl+Alt. */
    altGraph: boolean;
}

/**
 * Whether a browser key press types a character rather than forming a shortcut. AltGr, and on a
 * Mac the Option key alone, are how a Turkish keyboard types characters such as @ (Anki's default
 * suspend key), so those presses count as the character they produce.
 */
export function typesCharacter(press: KeyPress, isMac: boolean): boolean {
    if (press.key.length !== 1) return false;
    if (press.altGraph) return true;
    return isMac && press.altKey && !press.ctrlKey && !press.metaKey;
}
