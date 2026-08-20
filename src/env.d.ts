/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// sql.js 沒有內建型別，這裡宣告一個最小型別
declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[]
    values: any[][]
  }
  export interface Statement {
    bind(params?: any): boolean
    step(): boolean
    getAsObject(): Record<string, any>
    free(): boolean
    reset(): void
  }
  export interface Database {
    run(sql: string, params?: any): Database
    exec(sql: string, params?: any): QueryExecResult[]
    prepare(sql: string, params?: any): Statement
    export(): Uint8Array
    close(): void
  }
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }
  export interface InitConfig {
    locateFile?: (file: string) => string
  }
  export default function initSqlJs(config?: InitConfig): Promise<SqlJsStatic>
}
