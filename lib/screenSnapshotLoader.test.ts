import { describe, expect, it } from 'vitest';
import { LatestSnapshotGeneration, ScreenSnapshotRepository } from './screenSnapshotLoader';

describe('heavy-screen snapshot loading', () => {
    it('does not let an older deck/filter generation overwrite the newest result', async () => {
        const generation = new LatestSnapshotGeneration();
        const committed: string[] = [];
        let finishOld!: (value: string) => void;
        let finishNew!: (value: string) => void;
        const oldResult = new Promise<string>((resolve) => { finishOld = resolve; });
        const newResult = new Promise<string>((resolve) => { finishNew = resolve; });

        const oldToken = generation.begin();
        const oldCommit = oldResult.then((value) => generation.commit(oldToken, () => committed.push(value)));
        const newToken = generation.begin();
        const newCommit = newResult.then((value) => generation.commit(newToken, () => committed.push(value)));

        finishNew('new-deck');
        await newCommit;
        finishOld('old-deck');
        await oldCommit;

        expect(committed).toEqual(['new-deck']);
    });

    it('builds one snapshot for an identical scope/range/revision key', () => {
        const repository = new ScreenSnapshotRepository<{ value: number }>();
        let builds = 0;
        const create = () => ({ value: ++builds });

        const first = repository.getOrCreate('scope:range:revision', create);
        const second = repository.getOrCreate('scope:range:revision', create);

        expect(first).toBe(second);
        expect(builds).toBe(1);
    });
});
