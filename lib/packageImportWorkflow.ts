import { createBackupNow, type BackupDeps } from './backup';
import { importApkg } from './importApkg';
import type { ApkgImportOptions, ApkgImportResult } from './apkgFormat';

interface PackageImportDeps {
    /** Storage for the pre-import safety backup; tests inject an in-memory store. */
    backupDeps?: BackupDeps;
}

/**
 * The import screen's package path: a durable safety backup, then the import.
 *
 * Every package import is snapshotted first, because a package can update existing notes as well
 * as add new ones. A `.colpkg` replaces the whole collection and is not a way out of a damaged
 * one, so its snapshot must be restorable: a collection with a damaged row stops here with
 * `BackupNotRestorableError` before the package is read. A merge import may keep a recovery copy.
 */
export async function importPackageWithBackup(
    bytes: Uint8Array,
    options: ApkgImportOptions,
    deps: PackageImportDeps = {},
): Promise<ApkgImportResult> {
    await createBackupNow(deps.backupDeps, { requireRestorable: options.replaceCollection === true });
    return importApkg(bytes, options);
}
