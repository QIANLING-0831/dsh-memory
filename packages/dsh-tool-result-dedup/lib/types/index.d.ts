export declare const name: string;
export declare const inject: string[];
/** schemastery config schema (enabled / maxCacheBytes / normalize). */
export declare const Config: any;
export declare function normalizeText(text: string, mode: "trim-eol" | "exact"): string;
export declare function dedupNotice(toolName: string, firstCallId?: string): string;
/** Pure `tools/post-execute` handler factory; unit-testable without a Cordis context. */
export declare function createDedupPolicy(config: {
	maxCacheBytes: number;
	normalize: "trim-eol" | "exact";
}): (exec: any, result: any, next: () => Promise<any>) => Promise<any>;
export declare function apply(ctx: any, config: any): void;
