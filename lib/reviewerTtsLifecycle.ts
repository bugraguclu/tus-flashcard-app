/**
 * Native speech belongs to the focused, foreground reviewer only. The gate is deliberately
 * independent from the persisted on/off preference: leaving the screen stops speech without
 * changing what the learner chose for the next reviewer visit.
 */
export class ReviewerTtsLifecycle {
    private focused = false;
    private foreground = true;

    constructor(private readonly stop: () => void) {}

    setFocused(focused: boolean): void {
        const wasEligible = this.canSpeak();
        this.focused = focused;
        if (wasEligible && !focused) this.stop();
    }

    setForeground(active: boolean): void {
        const wasEligible = this.canSpeak();
        this.foreground = active;
        if (wasEligible && !active) this.stop();
    }

    canSpeak(): boolean {
        return this.focused && this.foreground;
    }
}

