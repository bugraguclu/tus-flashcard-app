import { flushDatabaseWrites, readOnlyTabMessage } from './db';

/** A visible success/next card must mean the collection has reached durable storage. */
export async function commitCollectionWrite<T>(
    write: () => T | Promise<T>,
    rollback?: (result: T) => void | Promise<void>,
): Promise<T> {
    const readOnly = readOnlyTabMessage();
    if (readOnly) throw new Error(readOnly);
    const result = await write();
    try {
        await flushDatabaseWrites();
    } catch (error) {
        if (rollback) await rollback(result);
        throw error;
    }
    return result;
}
