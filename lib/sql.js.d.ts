declare module 'sql.js' {
    interface Database {
        run(sql: string, params?: any): void;
        exec(sql: string, params?: any): QueryExecResult[];
        export(): Uint8Array;
        close(): void;
    }

    interface QueryExecResult {
        columns: string[];
        values: any[][];
    }

    interface SqlJsStatic {
        Database: new (data?: ArrayLike<number>) => Database;
    }

    function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
    export default initSqlJs;
    export type { Database, QueryExecResult, SqlJsStatic };
}
