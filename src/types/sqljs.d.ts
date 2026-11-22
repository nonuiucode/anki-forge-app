declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: Array<Array<number | string | Uint8Array | null>>;
  }

  export interface Statement {
    run(values?: Array<number | string | Uint8Array | null>): void;
    free(): void;
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: Array<number | string | Uint8Array | null>): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface SqlJsConfig {
    locateFile?: (filename: string, scriptDirectory: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
