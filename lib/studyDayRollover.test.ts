import { describe, expect, it, vi } from 'vitest';
vi.mock('./maintenance', () => ({ runDailyMaintenance: vi.fn() }));
vi.mock('./queueBookkeeping', () => ({ pruneQueueBookkeeping: vi.fn() }));
import { StudyDayWatcher, startNewStudyDay } from './studyDayRollover';
import { runDailyMaintenance } from './maintenance';
import { pruneQueueBookkeeping } from './queueBookkeeping';

describe('StudyDayWatcher', () => {
    it('reports the rollover once, at the rollover hour rather than at midnight', () => {
        const before = new Date(2026, 9, 23, 3, 59).getTime();
        const watcher = new StudyDayWatcher(4, before);
        expect(watcher.check(new Date(2026, 9, 23, 3, 59, 59).getTime())).toBe(false);
        expect(watcher.check(new Date(2026, 9, 23, 4, 0, 1).getTime())).toBe(true);
        expect(watcher.check(new Date(2026, 9, 23, 4, 0, 30).getTime())).toBe(false);
    });
});

describe('startNewStudyDay', () => {
    it('runs the daily housekeeping and prunes queue markers, surviving a failure of either', () => {
        vi.mocked(runDailyMaintenance).mockImplementationOnce(() => { throw new Error('busy'); });
        startNewStudyDay(4);
        expect(pruneQueueBookkeeping).toHaveBeenCalledWith(4);
    });
});
