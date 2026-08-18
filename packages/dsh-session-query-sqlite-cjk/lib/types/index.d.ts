import SessionQueryEngine from "@deepseek-ai/dsh-session-query";
export declare const CJK_QUERY_SQLITE_APPLICATION_ID: number;
export declare const CJK_QUERY_SQLITE_DEFAULT_LIMIT: number;
export declare const CJK_QUERY_SQLITE_MAX_LIMIT: number;
export declare const CJK_QUERY_SQLITE_PATH_KEY: string;
export declare const CJK_QUERY_SQLITE_SCHEMA_VERSION: number;
export declare const CJK_QUERY_SQLITE_SNIPPET_CHARS: number;
/** CJK-aware SQLite FTS5 `ctx.sessionQuery` backend (dual-tokenizer: unicode61 + trigram). */
export declare class CjkSessionQueryEngine extends SessionQueryEngine {}
export default CjkSessionQueryEngine;
