export type RepeatPressOptions = {
    /** Delay before the first repeat tick fires in milliseconds (default: 400). */
    initialDelayMs?: number;
    /** Base interval between repeat ticks in milliseconds (default: 80). */
    intervalMs?: number;
    /** Fastest interval allowed when accelerating in milliseconds (default: 35). */
    minIntervalMs?: number;
    /** Factor multiplied to the interval after each tick (default: 0.92). */
    accelerationFactor?: number;
};

/**
 * Manages tap vs hold-to-repeat state transitions for buttons.
 *
 * - Single tap: executes on release (onPress) once.
 * - Long press: begins auto-repeating after initialDelayMs, accelerating until minIntervalMs.
 * - Release after hold: does not trigger an extra onPress execution.
 */
export class RepeatPressController {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private isRepeating = false;
    private currentInterval: number;
    private readonly initialDelayMs: number;
    private readonly baseIntervalMs: number;
    private readonly minIntervalMs: number;
    private readonly accelerationFactor: number;
    public onTick: () => void;

    constructor(onTick: () => void, options?: RepeatPressOptions) {
        this.onTick = onTick;
        this.initialDelayMs = options?.initialDelayMs ?? 400;
        this.baseIntervalMs = options?.intervalMs ?? 80;
        this.minIntervalMs = options?.minIntervalMs ?? 35;
        this.accelerationFactor = options?.accelerationFactor ?? 0.92;
        this.currentInterval = this.baseIntervalMs;
    }

    onPressIn(): void {
        this.stop();
        this.isRepeating = false;
        this.currentInterval = this.baseIntervalMs;

        const schedule = (delay: number) => {
            this.timer = setTimeout(() => {
                this.isRepeating = true;
                this.onTick();
                this.currentInterval = Math.max(
                    this.minIntervalMs,
                    Math.round(this.currentInterval * this.accelerationFactor),
                );
                schedule(this.currentInterval);
            }, delay);
        };

        schedule(this.initialDelayMs);
    }

    onPressOut(): void {
        this.stop();
    }

    onPress(): void {
        this.stop();
        if (this.isRepeating) {
            this.isRepeating = false;
            return;
        }
        this.onTick();
    }

    stop(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    get repeating(): boolean {
        return this.isRepeating;
    }
}
