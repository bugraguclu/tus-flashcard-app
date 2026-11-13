/**
 * Stand-ins for React Native's `Animated` and `Easing` in screen tests that mock 'react-native':
 * the shared parts now grow menus from their button and sink pressed buttons (components/Popover,
 * components/PressableScale). Every animation finishes at once and animated components render as
 * the component they wrap. Use inside a `vi.mock('react-native', ...)` factory:
 * `...(await import('../test/animatedMock')).animatedModules()`.
 */
type Done = ((result: { finished: boolean }) => void) | undefined;

class Value {
    constructor(public value: number) {}
    setValue(value: number) { this.value = value; }
    setOffset() {}
    flattenOffset() {}
    stopAnimation(callback?: (value: number) => void) { callback?.(this.value); }
    resetAnimation() {}
    interpolate() { return this; }
    addListener() { return ''; }
    removeListener() {}
    removeAllListeners() {}
}

const finished = (run: () => void = () => {}) => ({
    start: (done?: Done) => { run(); done?.({ finished: true }); },
    stop() {},
    reset() {},
});

export function animatedModules() {
    const toValue = (value: Value, config: { toValue: number }) => finished(() => value.setValue(config.toValue));
    const group = (animations: { start: (done?: Done) => void }[]) => finished(() => animations.forEach((animation) => animation.start()));
    return {
        Animated: {
            Value,
            ValueXY: class { x = new Value(0); y = new Value(0); },
            View: 'View',
            Text: 'Text',
            ScrollView: 'ScrollView',
            createAnimatedComponent: (component: unknown) => component,
            timing: toValue,
            spring: toValue,
            decay: () => finished(),
            parallel: group,
            sequence: group,
            stagger: (_ms: number, animations: { start: (done?: Done) => void }[]) => group(animations),
            delay: () => finished(),
            loop: () => finished(),
            event: () => () => {},
            add: (a: Value) => a,
            multiply: (a: Value) => a,
            diffClamp: (a: Value) => a,
        },
        Easing: {
            bezier: () => (t: number) => t,
            linear: (t: number) => t,
            ease: (t: number) => t,
            in: (easing: unknown) => easing,
            out: (easing: unknown) => easing,
            inOut: (easing: unknown) => easing,
            cubic: (t: number) => t,
            quad: (t: number) => t,
        },
    };
}
