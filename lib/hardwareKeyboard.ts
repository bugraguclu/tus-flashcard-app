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
