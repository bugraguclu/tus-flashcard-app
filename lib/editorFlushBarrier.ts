/**
 * Lets a save wait until a native rich-text field has delivered every edit it made.
 *
 * A WebView field can only be reached through messages, and the message for the last keystroke
 * can still be on its way when ✓ is pressed, so a save that read the fields straight away wrote
 * the previous text. The host sends the field a token and saves once the token comes back:
 * messages arrive in the order the field posted them, so every edit made before the request has
 * been handed over by then. A field that never answers (unloading, stuck) releases the wait after
 * `timeoutMs` rather than holding the save forever.
 */
export class EditorFlushBarrier {
    private nextToken = 1;
    private readonly pending = new Map<number, { resolve: () => void; timer: ReturnType<typeof setTimeout> }>();

    constructor(private readonly timeoutMs = 400) {}

    /** Hands `send` a fresh token and resolves once that token is settled or the wait times out. */
    request(send: (token: number) => void): Promise<void> {
        const token = this.nextToken++;
        return new Promise<void>((resolve) => {
            const timer = setTimeout(() => this.settle(token), this.timeoutMs);
            this.pending.set(token, { resolve, timer });
            try {
                send(token);
            } catch {
                this.settle(token);
            }
        });
    }

    /** The field's answer. Unknown or repeated tokens are ignored. */
    settle(token: unknown): void {
        if (typeof token !== 'number') return;
        const entry = this.pending.get(token);
        if (!entry) return;
        this.pending.delete(token);
        clearTimeout(entry.timer);
        entry.resolve();
    }

    /** Releases every wait, for a field that is going away. */
    settleAll(): void {
        for (const token of [...this.pending.keys()]) this.settle(token);
    }

    get waiting(): number {
        return this.pending.size;
    }
}
