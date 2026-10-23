import { useEffect, type RefObject } from 'react';
import type { ActiveElapsedTimer } from './activeElapsedTimer';

/** The side owns the dwell clock; menus and focus only pause it. */
export function useReviewerDwellTimer(
    timer: RefObject<ActiveElapsedTimer>,
    cardId: number | undefined,
    answer: boolean,
    enabled: boolean,
    seconds: number,
    blocked: boolean,
): void {
    useEffect(() => {
        timer.current.reset(Date.now(), false);
    }, [timer, cardId, answer, enabled, seconds]);

    useEffect(() => {
        timer.current.setActive(enabled && cardId !== undefined && seconds > 0 && !blocked, Date.now());
        return () => timer.current.setActive(false, Date.now());
    }, [timer, cardId, answer, enabled, seconds, blocked]);
}
