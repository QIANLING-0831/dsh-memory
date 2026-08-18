import { createHash } from "node:crypto";
import z from "@deepseek-ai/schemastery";
//#region lib/types/index.js
/**
* The tool-result dedup PLUGIN: a `tools/post-execute` result transformer that
* keeps repeated byte-identical plain-text tool results out of the model's
* context. The first occurrence of a result is indexed by its normalized
* SHA-256; every later byte-identical result is replaced with a short pointer,
* saving input tokens on long sessions (repeated `git status`, `ls`, `read` of
* an unchanged file, repeated config dumps, ...).
*
* It registers NO service and owns NO storage: the dedup table is an in-memory
* `Map` scoped to the process (a Phase-0 MVP — durable spill-backed dedup is
* Phase 1 of the memory plan). It only decides WHEN to replace and composes the
* pointer notice.
*
* ## Deliberately narrow (mirrors the spill-policy discipline)
*
* - `enabled: false` ⇒ the plugin registers nothing (a true no-op).
* - Plain-text results only: a result carrying any non-text block is left
*   untouched (the policy knows only the final formatted text).
* - Results larger than `maxCacheBytes` are skipped — huge outputs belong to
*   the spill policy; dedup targets the small/medium repeats that actually
*   appear repeatedly in a context window.
* - Nested composite calls (`exec.parent`) skip the model-facing arm.
* - Accepted value replacements pass through for registry revalidation and
*   rendering (same mutually-exclusive decision as spill-policy).
* - `block` decisions pass through (corrective feedback must stay visible).
* - Best-effort: any failure (hash cost, unexpected shape) logs nothing and
*   returns the original decision. Dedup must NEVER turn a successful tool
*   call into an `isError` or hide content the model asked for.
* - A deduped result's FULL text remains recoverable: re-run the tool. The
*   pointer says so explicitly (mirror of spill's retrieval guidance).
*
* ## Ordering with spill-policy
* Register this plugin BEFORE `@deepseek-ai/dsh-spill-policy` so a repeated
* medium result is pointered here and never spills; both hook
* `tools/post-execute` with `{ prepend: true }` and the waterfall runs them in
* registration order.
*
* @module dsh-tool-result-dedup
*/
/** Cordis plugin name used by loader diagnostics. */
const name = "tool-result-dedup";
/** Require the tool registry (its `tools/post-execute` waterfall is the extension point we transform). */
const inject = ["tools"];
const Config = z.object({
	/** Set `false` to disable the plugin entirely. */
	enabled: z.boolean().default(true),
	/** Skip results larger than this many UTF-8 bytes (huge outputs belong to spill). */
	maxCacheBytes: z.number().step(1).min(0).default(64 * 1024),
	/** `trim-eol` normalizes per-line trailing whitespace and leading/trailing blank lines; `exact` hashes the verbatim text. */
	normalize: z.union([
		"trim-eol",
		"exact"
	]).default("trim-eol")
});
/** All-text content flattened to one UTF-8 string, or `undefined` if any block is non-text. */
function flattenPlainText(content) {
	let text = "";
	for (const block of content) {
		if (block.type !== "text") return void 0;
		text += block.text;
	}
	return text;
}
/** Normalize `text` per the configured mode for hash stability across whitespace noise. */
function normalizeText(text, mode) {
	if (mode === "exact") return text;
	return text.replace(/[ \t]+\r?\n/g, "\n").replace(/(^\s+)|(\s+$)/g, "");
}
/** The pointer replacement for a repeated result. */
function dedupNotice(toolName, firstCallId) {
	return `(Identical to the earlier ${toolName} result${firstCallId === void 0 ? "" : ` (call ${firstCallId})`} — omitted to save tokens. Re-run the tool if you need the full text again.)`;
}
/**
* Build the pure `tools/post-execute` handler for a dedup policy. Exported for
* unit testing without a Cordis context; the plugin's `apply()` registers it.
* @param config - resolved policy options.
* @returns an async handler `(exec, result, next) => decision`.
*/
function createDedupPolicy(config) {
	const table = /* @__PURE__ */ new Map();
	return async (exec, result, next) => {
		const decision = await next();
		if (decision.kind !== "accept" || Object.hasOwn(decision, "value") || exec.parent !== void 0) return decision;
		const text = flattenPlainText(decision.content ?? result.content);
		if (text === void 0) return decision;
		const totalBytes = Buffer.byteLength(text, "utf8");
		if (totalBytes === 0 || totalBytes > config.maxCacheBytes) return decision;
		const normalized = normalizeText(text, config.normalize);
		const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
		const seen = table.get(hash);
		if (seen === void 0) {
			table.set(hash, {
				toolName: exec.name,
				callId: exec.callId,
				count: 1,
				firstSeen: Date.now()
			});
			return decision;
		}
		seen.count += 1;
		return {
			kind: "accept",
			content: [{
				type: "text",
				text: dedupNotice(seen.toolName, seen.callId)
			}],
			...decision.additionalContexts ? { additionalContexts: decision.additionalContexts } : {}
		};
	};
}
function apply(ctx, config) {
	if (config.enabled === false) return;
	if (!Number.isInteger(config.maxCacheBytes) || config.maxCacheBytes < 0) throw new Error(`tool-result-dedup: maxCacheBytes must be a non-negative integer (got ${config.maxCacheBytes})`);
	const handler = createDedupPolicy(config);
	ctx.on("tools/post-execute", handler, { prepend: true });
}
//#endregion
export { Config, apply, createDedupPolicy, dedupNotice, inject, name, normalizeText };
