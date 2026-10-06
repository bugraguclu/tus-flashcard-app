import type { ScreenGuardSnapshot } from '../lib/screenGuardPolicy';

const DISABLED_SNAPSHOT: ScreenGuardSnapshot = {
    protect: false,
    blank: false,
    holders: [],
    screenshots: 0,
};

/**
 * Screen capture and screenshot protection is disabled.
 * Hook returns an inactive snapshot and installs no guards.
 */
export function useScreenGuard(_active?: boolean, _holder?: string): ScreenGuardSnapshot {
    return DISABLED_SNAPSHOT;
}

export const screenGuardStackListeners = {};
