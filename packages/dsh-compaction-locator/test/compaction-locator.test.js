import { test } from "node:test";
import assert from "node:assert/strict";
import LocatorCompactionEngine, { attachLocators, buildLocatorBlock, regionSeqs, spillLocators, touchedFiles } from "../lib/index.js";

const NOW = 1_700_000_000_000;

// Minimal deriveEventMessage matching the dsh-session surface projection
// contract used by compaction-basic's buildSummarizationInput. Only the three
// surface-eligible types produce messages; tool/call is log-only.
function deriveEventMessage(event) {
	switch (event.type) {
		case "user/message": return event.data;
		case "assistant/message":
			if (event.data.message.content.length === 0) return null;
			return event.data.message;
		case "tool/result": return event.data.message;
		default: return null;
	}
}

// Realistic log shape: tool/call (log-only) sits between surface nodes.
const events = [
	{
		seq: 0,
		time: NOW,
		type: "user/message",
		surfaceOp: "append",
		data: { content: [{ type: "text", text: "帮我抓取一个页面" }] }
	},
	{
		seq: 1,
		time: NOW + 1000,
		type: "assistant/message",
		surfaceOp: "append",
		data: { message: { content: [{ type: "text", text: "好的，先读取文件" }] } }
	},
	{
		seq: 2,
		time: NOW + 2000,
		type: "tool/call",
		data: { name: "read", arguments: { path: "src/a.ts" } }
	},
	{
		seq: 3,
		time: NOW + 3000,
		type: "tool/result",
		surfaceOp: "append",
		data: {
			message: {
				content: [{ type: "text", text: "(Omitted 2048 bytes. Full formatted result stored at: /tmp/session-1/web_fetch.txt. Use read with offset/limit.)" }]
			}
		}
	},
	{
		seq: 4,
		time: NOW + 4000,
		type: "assistant/message",
		surfaceOp: "append",
		data: { message: { content: [{ type: "text", text: "页面抓取完成" }] } }
	},
	{
		seq: 5,
		time: NOW + 5000,
		type: "tool/call",
		data: { name: "grep", arguments: { pattern: "TODO", path: "src/b.ts" } }
	},
	{
		seq: 6,
		time: NOW + 6000,
		type: "tool/result",
		surfaceOp: "append",
		data: { message: { content: [{ type: "text", text: "TODO: fix timeout" }] } }
	}
];

const session = {
	header: { version: 1, id: "locator-test", createdAt: NOW },
	events,
	deriveEventMessage
};

test("regionSeqs maps derived messages back to event seqs", () => {
	const regionMessages = [deriveEventMessage(events[3]), deriveEventMessage(events[4])];
	assert.deepEqual(regionSeqs(session, regionMessages), [3, 4]);
});

test("spillLocators extracts spill paths from tool results", () => {
	assert.deepEqual(spillLocators([events[3]]), ["/tmp/session-1/web_fetch.txt"]);
	assert.deepEqual(spillLocators([events[0]]), []);
});

test("touchedFiles extracts paths from read/write/grep tool calls", () => {
	assert.deepEqual(touchedFiles([events[2], events[5]]), ["src/a.ts", "src/b.ts"]);
	assert.deepEqual(touchedFiles([events[4]]), []);
});

test("buildLocatorBlock scans the span and renders seq range, spill files, touched files", () => {
	const block = buildLocatorBlock(session, [deriveEventMessage(events[1]), deriveEventMessage(events[3]), deriveEventMessage(events[4])]);
	assert.ok(block.includes("seq range: 1-4"), block);
	assert.ok(block.includes("spill file: /tmp/session-1/web_fetch.txt"), block);
	assert.ok(block.includes("file touched: src/a.ts"), block);
	assert.ok(block.includes("memory_search"), block);
});

test("buildLocatorBlock returns empty when nothing to locate", () => {
	assert.equal(buildLocatorBlock(session, [deriveEventMessage(events[0])]), "");
});

test("attachLocators appends block and preserves the base result fields", () => {
	const base = { summary: "checkpoint text", provider: "deepseek-official", model: "deepseek-v4-flash", usage: { in: 1, out: 2 } };
	const out = attachLocators(base, session, [deriveEventMessage(events[3])]);
	assert.ok(out.summary.startsWith("checkpoint text"));
	assert.ok(out.summary.includes("## Exact Sources"));
	assert.ok(out.summary.includes("web_fetch.txt"));
	assert.equal(out.provider, "deepseek-official");
	assert.equal(out.usage.in, 1);
});

test("attachLocators returns unchanged with no locators or no session", () => {
	const base = { summary: "plain" };
	assert.equal(attachLocators(base, session, [deriveEventMessage(events[0])]).summary, "plain");
	assert.equal(attachLocators(base, void 0, []).summary, "plain");
});

test("LocatorCompactionEngine constructs with inherited Config and auto:false", () => {
	const ctx = { reflect: { provide() {} } };
	const engine = new LocatorCompactionEngine(ctx, { auto: false });
	assert.ok(engine instanceof LocatorCompactionEngine);
	assert.equal(typeof engine.summarize, "function");
	assert.ok(engine.config.auto === false);
});
