import { describe, expect, it } from 'vitest';
import {
    gradeForHardwareKey,
    isModifierOnlyKey,
    matchesKeyBinding,
    matchesShowAnswerKey,
    typesCharacter,
    type KeyPress,
} from './hardwareKeyboard';
import { DEFAULT_SETTINGS } from './storage';

const press = (overrides: Partial<KeyPress>): KeyPress => ({
    key: 'a',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    altGraph: false,
    ...overrides,
});

describe('hardware keyboard bindings', () => {
    it('matches letters without regard to case and named keys exactly', () => {
        expect(matchesKeyBinding('R', 'r')).toBe(true);
        expect(matchesKeyBinding('Spacebar', ' ')).toBe(true);
        expect(matchesKeyBinding('Enter', 'enter')).toBe(false);
    });

    it('lets Enter show the answer alongside the default Space', () => {
        expect(matchesShowAnswerKey('Enter', ' ')).toBe(true);
        expect(matchesShowAnswerKey('Enter', 'j')).toBe(false);
    });

    it('grades 1 to 4 with the default bindings', () => {
        const bindings = DEFAULT_SETTINGS.keyBindings;
        expect(['1', '2', '3', '4'].map((key) => gradeForHardwareKey(key, bindings))).toEqual([1, 2, 3, 4]);
    });
});

describe('isModifierOnlyKey', () => {
    it('recognises keys that only shape the next one', () => {
        for (const key of ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Dead']) {
            expect(isModifierOnlyKey(key)).toBe(true);
        }
    });

    it('lets real keys through, including Enter and the default suspend key', () => {
        for (const key of ['@', '-', '*', 'r', ' ', 'Enter', 'Escape']) {
            expect(isModifierOnlyKey(key)).toBe(false);
        }
    });
});

describe('typesCharacter', () => {
    it('treats AltGr, reported by Windows as Ctrl+Alt, as typing the character', () => {
        expect(typesCharacter(press({ key: '@', ctrlKey: true, altKey: true, altGraph: true }), false)).toBe(true);
    });

    it('treats the Mac Option key alone as typing the character', () => {
        expect(typesCharacter(press({ key: '@', altKey: true }), true)).toBe(true);
        expect(typesCharacter(press({ key: '@', altKey: true, metaKey: true }), true)).toBe(false);
    });

    it('keeps Ctrl, Cmd and a Windows Alt chord as shortcuts', () => {
        expect(typesCharacter(press({ key: 'z', ctrlKey: true }), false)).toBe(false);
        expect(typesCharacter(press({ key: 'z', metaKey: true }), true)).toBe(false);
        expect(typesCharacter(press({ key: 'd', altKey: true }), false)).toBe(false);
    });

    it('does not count named keys as typed characters', () => {
        expect(typesCharacter(press({ key: 'Enter', altGraph: true }), false)).toBe(false);
    });
});
