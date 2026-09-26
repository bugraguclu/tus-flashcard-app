import { createContext, useContext } from 'react';

/**
 * Lets a chart stop the page from scrolling while a finger scrubs sideways across it. On iOS the
 * native scroll view wins every gesture it recognises, so a chart cannot keep a sideways drag by
 * itself; the screen that owns the scroll view provides this and turns scrolling off meanwhile.
 */
const ChartScrollLockContext = createContext<(locked: boolean) => void>(() => undefined);

export const ChartScrollLockProvider = ChartScrollLockContext.Provider;

export function useChartScrollLock(): (locked: boolean) => void {
    return useContext(ChartScrollLockContext);
}
