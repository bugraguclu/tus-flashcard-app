/**
 * Minimal react-native replacement for vitest (node). The real package ships
 * Flow syntax that vite cannot parse; lib code under test only ever touches
 * Platform, so that is all the stub provides. Wired up via the resolve.alias
 * entry in vitest.config.ts.
 */

export const Platform = {
    OS: 'ios' as string,
    select<T>(spec: { ios?: T; android?: T; native?: T; web?: T; default?: T }): T | undefined {
        return spec.ios ?? spec.native ?? spec.default;
    },
};

export const Linking = {
    openSettings: async (): Promise<void> => {},
    openURL: async (_url: string): Promise<boolean> => true,
    canOpenURL: async (_url: string): Promise<boolean> => true,
};

export const Alert = {
    alert: (_title: string, _message?: string, _buttons?: any[], _options?: any): void => {},
};
