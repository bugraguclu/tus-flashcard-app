/**
 * Refcounted decision layer for screen-capture protection.
 *
 * Several screens can show paid catalog content at the same time — the reviewer behind a card
 * options sheet, the browser behind its preview — and window-level protection is a single
 * global switch. Counting holders here keeps one screen's unmount from lifting protection that
 * another screen still needs, and keeps that rule unit-testable without a native module.
 *
 * This module deliberately imports nothing. `hooks/useScreenGuard.ts` binds it to the native
 * side; on platforms with no native half the policy still runs and drives the in-app blanking.
 */

/**
 * How long the card stays hidden after a screenshot.
 *
 * A screenshot cannot be taken back, so this is not about the one that just happened — it is
 * about the next nine thousand. Capturing a deck one card at a time only works if the next card
 * can be revealed and shot immediately; making every shot cost a wait, and a deliberate tap to
 * bring the card back, turns a mechanical job into one nobody finishes. It costs a learner who
 * is not copying the deck nothing at all, because they never take the first screenshot.
 */
export const SCREENSHOT_BLANK_MS = 3000;

export interface ScreenGuardSnapshot {
    /** Window-level capture protection should be installed. */
    protect: boolean;
    /** Content must be hidden right now: a capture is running, or one was just taken. */
    blank: boolean;
    /** A capture — recording, mirroring, USB — is running right now. */
    captured: boolean;
    /** Holder ids currently requesting protection, for diagnostics. */
    holders: string[];
    /** Screenshots observed while protection was active, since app start. */
    screenshots: number;
    /**
     * Whether the window-level shield is actually installed.
     *
     * The native call reports this and it used to be discarded, so a build where the shield
     * could not be installed — a future iOS that moves the private layer, the build switch
     * turned off, Expo Go with no native half at all — believed it was protected while every
     * screenshot went straight through. It is not shown to the learner (that would tell a
     * copier exactly where to work); it decides how hard the other layers have to try.
     */
    shielded: boolean;
    /**
     * When the screenshot blanking ends, as an epoch millisecond, or null when nothing is
     * pending. The hook uses it to schedule the re-render that brings the card back.
     */
    blankUntil: number | null;
}

export class ScreenGuardPolicy {
    private readonly counts = new Map<string, number>();
    private readonly listeners = new Set<(state: ScreenGuardSnapshot) => void>();
    private captured = false;
    private screenshots = 0;
    private shielded = false;
    private blankUntil = 0;

    /** Register a screen that is displaying protected content. Returns the release function. */
    acquire(holder: string): () => void {
        this.counts.set(holder, (this.counts.get(holder) ?? 0) + 1);
        this.emit();
        let released = false;
        return () => {
            // A component can unmount twice under Strict Mode; releasing once is the contract.
            if (released) return;
            released = true;
            this.release(holder);
        };
    }

    release(holder: string): void {
        const count = this.counts.get(holder);
        if (count === undefined) return;
        if (count <= 1) this.counts.delete(holder);
        else this.counts.set(holder, count - 1);
        this.emit();
    }

    /** Screen recording, mirroring or USB capture started or stopped. */
    setCaptured(captured: boolean): void {
        if (this.captured === captured) return;
        this.captured = captured;
        this.emit();
    }

    /**
     * Whether the native window-level shield is really installed.
     *
     * Reported by the native call that turns protection on. Losing it is not a reason to stop
     * showing a bought deck — a legitimate learner would be locked out of what they paid for by
     * an iOS update — so it is recorded rather than acted on as a refusal.
     */
    setShielded(shielded: boolean): void {
        if (this.shielded === shielded) return;
        this.shielded = shielded;
        this.emit();
    }

    /**
     * A screenshot was taken.
     *
     * The shutter has already fired and nothing can call that frame back. What this does is make
     * the *next* one cost something: the card is hidden for a few seconds, so a deck cannot be
     * walked through at one shot per second. See `SCREENSHOT_BLANK_MS`.
     */
    noteScreenshot(now = Date.now()): void {
        if (!this.isProtecting()) return;
        this.screenshots += 1;
        this.blankUntil = Math.max(this.blankUntil, now + SCREENSHOT_BLANK_MS);
        this.emit();
    }

    isProtecting(): boolean {
        return this.counts.size > 0;
    }

    snapshot(now = Date.now()): ScreenGuardSnapshot {
        const protect = this.isProtecting();
        const blanking = this.blankUntil > now;
        return {
            protect,
            blank: protect && (this.captured || blanking),
            captured: this.captured,
            holders: [...this.counts.keys()].sort(),
            screenshots: this.screenshots,
            shielded: this.shielded,
            blankUntil: protect && blanking ? this.blankUntil : null,
        };
    }

    subscribe(listener: (state: ScreenGuardSnapshot) => void): () => void {
        this.listeners.add(listener);
        listener(this.snapshot());
        return () => { this.listeners.delete(listener); };
    }

    /** Test seam: drop every holder and reset observed capture state. */
    reset(): void {
        this.counts.clear();
        this.captured = false;
        this.screenshots = 0;
        this.shielded = false;
        this.blankUntil = 0;
        this.emit();
    }

    private emit(): void {
        const state = this.snapshot();
        for (const listener of this.listeners) listener(state);
    }
}

/** One switch per app; every screen shares it. */
export const screenGuard = new ScreenGuardPolicy();
