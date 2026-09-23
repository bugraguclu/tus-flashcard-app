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

export interface ScreenGuardSnapshot {
    /** Window-level capture protection should be installed. */
    protect: boolean;
    /** Content must be hidden right now: a capture is already running. */
    blank: boolean;
    /** Holder ids currently requesting protection, for diagnostics. */
    holders: string[];
    /** Screenshots observed while protection was active, since app start. */
    screenshots: number;
}

export class ScreenGuardPolicy {
    private readonly counts = new Map<string, number>();
    private readonly listeners = new Set<(state: ScreenGuardSnapshot) => void>();
    private captured = false;
    private screenshots = 0;

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

    /** A screenshot was taken. It cannot be undone; this drives the warning and the counter. */
    noteScreenshot(): void {
        if (!this.isProtecting()) return;
        this.screenshots += 1;
        this.emit();
    }

    isProtecting(): boolean {
        return this.counts.size > 0;
    }

    snapshot(): ScreenGuardSnapshot {
        const protect = this.isProtecting();
        return {
            protect,
            blank: protect && this.captured,
            holders: [...this.counts.keys()].sort(),
            screenshots: this.screenshots,
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
        this.emit();
    }

    private emit(): void {
        const state = this.snapshot();
        for (const listener of this.listeners) listener(state);
    }
}

/** One switch per app; every screen shares it. */
export const screenGuard = new ScreenGuardPolicy();
