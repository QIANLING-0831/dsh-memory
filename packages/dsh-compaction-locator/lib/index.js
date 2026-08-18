import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
//#region lib/types/index.js
/**
* `LocatorCompactionEngine` — a `BasicCompactionEngine` subclass whose only
* change is the documented `summarize()` hook: after the base summarizer
* returns, it appends an **Exact Sources** locator block to the checkpoint:
*
* ```markdown
* ## Exact Sources (locators)
* - seq range: 12-58
* - spill files: /…/session-…/web_fetch.txt, /…/git_status.txt
* - files touched: src/a.ts, src/b.ts
* ```
*
* The block turns a lossy summary into a near-lossless one: paths and ranges
* are terse (a few hundred bytes) so the framed checkpoint still shrinks its
* source (the compaction-basic shrink validation keeps pricing on the token
* meter). The model can recover exact text via `read <spill path>` or
* `memory_search` (dsh-memory-tool).
*
* Pressure, retention, cited source events, shrink validation, and
* shadowed-token accounting remain on the base engine unchanged.
*
* @module dsh-compaction-locator
*/
/** Spill-notice path capture: "(Omitted N bytes. Full formatted result stored at: <path>. …)" */
const SPILL_PATH_RE = /stored at:\s*([^\s)\]]+)/g;
/** Tools whose `path` argument names a workspace file worth remembering. */
const PATH_TOOL_RE = /(?:^|[-_])?(?:read|write|edit|str_replace_editor|grep|glob|view)(?:$|[-_])/i;
/** Tools whose argument object carries a `path`/`file_path` value. */
function argumentPath(args) {
	if (typeof args !== "object" || args === null) return void 0;
	if (typeof args.path === "string" && args.path.length > 0) return args.path;
	if (typeof args.file_path === "string" && args.file_path.length > 0) return args.file_path;
	return void 0;
}
/**
* Locate the surface-node seqs whose derived messages match `regionMessages`
* (the shadowed region the summarizer replayed). Matches by message identity
* first, then by deep JSON equality as a fallback.
* @param session - the compaction target session.
* @param regionMessages - derived messages of the shadowed region.
* @returns matching event seqs in ascending order.
*/
export function regionSeqs(session, regionMessages) {
	const seqs = [];
	for (const event of session.events) {
		const message = session.deriveEventMessage(event);
		if (message === null) continue;
		if (regionMessages.includes(message)) {
			seqs.push(event.seq);
			continue;
		}
		if (regionMessages.some((regionMessage) => jsonEquals(regionMessage, message))) seqs.push(event.seq);
	}
	return seqs.sort((a, b) => a - b);
}
function jsonEquals(a, b) {
	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch {
		return false;
	}
}
/** Flatten an event's model-visible text (tool results, user text). */
function eventText(event) {
	if (event.type === "tool/result") {
		const content = event.data?.message?.content;
		if (!Array.isArray(content)) return "";
		return content.map((block) => block.type === "text" ? block.text : "").join("\n");
	}
	if (event.type === "user/message") {
		const content = event.data?.content;
		if (!Array.isArray(content)) return "";
		return content.map((block) => block.type === "text" ? block.text : "").join("\n");
	}
	return "";
}
/** Collect spill-file locators from a set of events. */
export function spillLocators(events) {
	const paths = [];
	for (const event of events) {
		const text = eventText(event);
		SPILL_PATH_RE.lastIndex = 0;
		let match;
		while ((match = SPILL_PATH_RE.exec(text)) !== null) {
			// Strip trailing sentence punctuation ("…web_fetch.txt." → "…web_fetch.txt").
			paths.push(match[1].replace(/[.,;:)]+$/g, ""));
		}
	}
	return [...new Set(paths)];
}
/** Collect touched file paths from tool/call events (path arguments). */
export function touchedFiles(events) {
	const files = [];
	for (const event of events) {
		if (event.type !== "tool/call") continue;
		const name = typeof event.data?.name === "string" ? event.data.name : "";
		if (!PATH_TOOL_RE.test(name)) continue;
		const path = argumentPath(event.data?.arguments);
		if (path !== void 0) files.push(path);
	}
	return [...new Set(files)];
}
/**
* Build the terse locator block for a shadowed region.
* @param session - compaction target session.
* @param regionMessages - the shadowed region's derived messages.
* @returns the Markdown block, or `""` when nothing to locate.
*/
export function buildLocatorBlock(session, regionMessages) {
	const seqs = regionSeqs(session, regionMessages);
	if (seqs.length === 0) return "";
	// Locators scan the whole span between the first and last shadowed surface
	// node — log-only tool/call events (paths) sit between them in seq order.
	const spanStart = seqs[0];
	const spanEnd = seqs[seqs.length - 1];
	const spanEvents = session.events.slice(spanStart, spanEnd + 1);
	const spill = spillLocators(spanEvents);
	const files = touchedFiles(spanEvents);
	// A bare seq range locates nothing substantive; only emit the block when
	// there is at least one spill file or touched path to point at.
	if (spill.length === 0 && files.length === 0) return "";
	const lines = [`- seq range: ${spanStart}-${spanEnd}`];
	for (const path of spill) lines.push(`- spill file: ${path}`);
	for (const path of files) lines.push(`- file touched: ${path}`);
	return `## Exact Sources (locators)\n${lines.join("\n")}\n\n(Use \`read <spill file>\` or \`memory_search\` with these paths to restore exact text.)`;
}
/**
* Attach the locator block to a summarize() result. Exported for unit tests.
* @param result - the base engine's summarize result.
* @param session - the target session (may be undefined).
* @param regionMessages - the shadowed region's derived messages.
* @returns the result with the block appended to `summary` when locators exist.
*/
export function attachLocators(result, session, regionMessages) {
	if (session === void 0 || typeof result.summary !== "string") return result;
	const block = buildLocatorBlock(session, regionMessages);
	if (block.length === 0) return result;
	return {
		...result,
		summary: `${result.summary}\n\n${block}`
	};
}
/**
* `BasicCompactionEngine` subclass appending Exact Sources locators to every
* checkpoint. Drop-in replacement: register this plugin INSTEAD of
* `@deepseek-ai/dsh-compaction-basic` (same Config, same inject).
* @extends BasicCompactionEngine
*/
export class LocatorCompactionEngine extends BasicCompactionEngine {
	/** The sole subclass hook — append locators after the base summary. */
	async summarize(input, agent, signal) {
		const result = await super.summarize(input, agent, signal);
		return attachLocators(result, agent?.session, input.messages);
	}
}
const name = "compaction-locator";
/** Same service requirements as the basic engine. */
const inject = ["llm", "tokenMeter", "sessions"];
/** Same configuration schema as the basic engine. */
const Config = BasicCompactionEngine.Config;
/** Register the locator compaction engine (replaces compaction-basic). */
function apply(ctx, config) {
	ctx.plugin(LocatorCompactionEngine, config);
}
//#endregion
export { Config, apply, inject, name };
export default LocatorCompactionEngine;
