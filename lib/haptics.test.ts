import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ selection: 0, impact: [] as string[], notification: [] as string[] }));

vi.mock('expo-haptics', () => ({
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    selectionAsync: async () => { calls.selection += 1; },
    impactAsync: async (style: string) => { calls.impact.push(style); },
    notificationAsync: async (type: string) => { calls.notification.push(type); },
}));

import {
    configureHaptics,
    haptic,
    hapticAnswer,
    hapticError,
    hapticLight,
    hapticMedium,
    hapticSelection,
    hapticSuccess,
    hapticWarning,
    type HapticIntent,
} from './haptics';

describe('haptics facade', () => {
    beforeEach(() => {
        calls.selection = 0;
        calls.impact = [];
        calls.notification = [];
        configureHaptics(true);
    });

    it('maps each helper to its expo-haptics effect', () => {
        hapticSelection();
        hapticLight();
        hapticMedium();
        hapticSuccess();
        hapticError();

        expect(calls.selection).toBe(1);
        expect(calls.impact).toEqual(['light', 'medium']);
        expect(calls.notification).toEqual(['success', 'error']);
    });

    it('gives "Tekrar" a heavier tap than the passing grades', () => {
        hapticAnswer(1);
        hapticAnswer(2);
        hapticAnswer(3);
        hapticAnswer(4);

        expect(calls.impact).toEqual(['medium', 'light', 'light', 'light']);
    });

    it('stays silent once the preference is turned off', () => {
        configureHaptics(false);

        hapticSelection();
        hapticLight();
        hapticAnswer(1);
        hapticSuccess();

        expect(calls.selection).toBe(0);
        expect(calls.impact).toEqual([]);
        expect(calls.notification).toEqual([]);
    });

    it('never throws when the native module rejects', () => {
        expect(() => hapticSuccess()).not.toThrow();
    });

    it('maps every intent to the matching effect', () => {
        haptic('selection');
        haptic('impact');
        haptic('success');
        haptic('warning');
        haptic('error');

        expect(calls.selection).toBe(1);
        expect(calls.impact).toEqual(['light']);
        expect(calls.notification).toEqual(['success', 'warning', 'error']);
    });

    it('honours the preference for intent dispatch too', () => {
        configureHaptics(false);

        const intents: HapticIntent[] = ['selection', 'impact', 'success', 'warning', 'error'];
        for (const intent of intents) haptic(intent);

        expect(calls.selection).toBe(0);
        expect(calls.impact).toEqual([]);
        expect(calls.notification).toEqual([]);
    });

    it('ignores an intent the map does not know instead of throwing', () => {
        expect(() => haptic('nope' as HapticIntent)).not.toThrow();
        expect(calls.selection).toBe(0);
    });

    it('warns without throwing', () => {
        expect(() => hapticWarning()).not.toThrow();
        expect(calls.notification).toEqual(['warning']);
    });
});
