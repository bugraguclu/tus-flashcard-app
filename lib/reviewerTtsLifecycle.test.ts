import { describe, expect, it, vi } from 'vitest';
import { ReviewerTtsLifecycle } from './reviewerTtsLifecycle';

describe('reviewer TTS lifecycle', () => {
    it('stops speech when the reviewer blurs or the app backgrounds', () => {
        const stop = vi.fn();
        const lifecycle = new ReviewerTtsLifecycle(stop);

        lifecycle.setFocused(true);
        expect(lifecycle.canSpeak()).toBe(true);
        lifecycle.setForeground(false);
        expect(lifecycle.canSpeak()).toBe(false);
        expect(stop).toHaveBeenCalledTimes(1);
        lifecycle.setFocused(false);
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('allows the persisted preference to resume only after focus and foreground return', () => {
        const lifecycle = new ReviewerTtsLifecycle(vi.fn());
        lifecycle.setForeground(false);
        lifecycle.setFocused(true);
        expect(lifecycle.canSpeak()).toBe(false);
        lifecycle.setForeground(true);
        expect(lifecycle.canSpeak()).toBe(true);
    });
});

