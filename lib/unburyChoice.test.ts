import { beforeEach, describe, expect, it, vi } from 'vitest';

const chooseOption = vi.fn<(title: string, message: string, options: readonly string[]) => Promise<number | null>>();
vi.mock('./confirm', () => ({ chooseOption: (...args: Parameters<typeof chooseOption>) => chooseOption(...args) }));

import { chooseUnburyKind } from './unburyChoice';

const l = (_tr: string, en: string) => en;

describe('chooseUnburyKind', () => {
    beforeEach(() => chooseOption.mockReset());

    it('asks nothing when only one kind is buried', async () => {
        await expect(chooseUnburyKind({ manual: 2, siblings: 0 }, l)).resolves.toBe('all');
        await expect(chooseUnburyKind({ manual: 0, siblings: 3 }, l)).resolves.toBe('all');
        expect(chooseOption).not.toHaveBeenCalled();
    });

    it('offers manual, siblings and all, in Anki order', async () => {
        chooseOption.mockResolvedValueOnce(1);
        await expect(chooseUnburyKind({ manual: 2, siblings: 3 }, l)).resolves.toBe('siblings');
        expect(chooseOption.mock.calls[0][2]).toEqual(['Manually buried (2)', 'Buried siblings (3)', 'All buried cards']);
        chooseOption.mockResolvedValueOnce(0);
        await expect(chooseUnburyKind({ manual: 2, siblings: 3 }, l)).resolves.toBe('manual');
        chooseOption.mockResolvedValueOnce(2);
        await expect(chooseUnburyKind({ manual: 2, siblings: 3 }, l)).resolves.toBe('all');
    });

    it('unburies nothing when the learner cancels', async () => {
        chooseOption.mockResolvedValueOnce(null);
        await expect(chooseUnburyKind({ manual: 2, siblings: 3 }, l)).resolves.toBeNull();
    });
});
