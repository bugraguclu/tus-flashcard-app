/** Independently implemented from https://docs.ankiweb.net/backups.html. */
export const DEFAULT_BACKUP_POLICY = { backupIntervalMinutes: 30, backupDailyCopies: 12, backupWeeklyCopies: 10, backupMonthlyCopies: 9 };
type Policy = typeof DEFAULT_BACKUP_POLICY;
export function normalizeBackupPolicy(raw: Partial<Policy>): Policy {
    // These four values were forced by older builds, rather than chosen by the learner.
    if (raw.backupIntervalMinutes === 10080 && raw.backupDailyCopies === 0 && raw.backupWeeklyCopies === 7 && raw.backupMonthlyCopies === 0) return { ...DEFAULT_BACKUP_POLICY };
    const result = { ...DEFAULT_BACKUP_POLICY };
    for (const key of Object.keys(result) as (keyof Policy)[]) {
        const value = raw[key];
        if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.max(key === 'backupIntervalMinutes' ? 1 : 0, Math.min(key === 'backupIntervalMinutes' ? 10080 : 1000, Math.trunc(value)));
    }
    return result;
}

interface Snapshot { name: string; createdAt: number }
/** Keep all snapshots today/yesterday, then one per older day, week and month. */
export function retainedBackupNames(snapshots: Snapshot[], now: Date, policy: Policy): Set<string> {
    const sorted = [...snapshots].sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
    const retained = new Set<string>();
    const yesterday = new Date(now); yesterday.setHours(0, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1);
    const days = new Set<string>(); const weeks = new Set<string>(); const months = new Set<string>();
    for (const snapshot of sorted) {
        const date = new Date(snapshot.createdAt);
        if (date >= yesterday) { retained.add(snapshot.name); continue; }
        const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const monday = new Date(date); monday.setDate(date.getDate() - (date.getDay() + 6) % 7); monday.setHours(0, 0, 0, 0);
        const week = String(monday.getTime()); const month = `${date.getFullYear()}-${date.getMonth()}`;
        for (const [key, buckets, limit] of [[day, days, policy.backupDailyCopies], [week, weeks, policy.backupWeeklyCopies], [month, months, policy.backupMonthlyCopies]] as const) {
            if (!buckets.has(key) && buckets.size < limit) { buckets.add(key); retained.add(snapshot.name); }
        }
    }
    return retained;
}
