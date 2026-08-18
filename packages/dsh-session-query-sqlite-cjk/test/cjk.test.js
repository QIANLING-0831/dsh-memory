import { test } from "node:test";
import assert from "node:assert/strict";
import CjkSessionQueryEngine from "../lib/index.js";

const SESSION_ID = "test-session";
const NOW = 1_700_000_000_000;

// A minimal valid surface log: zero-based contiguous seqs, surface-eligible
// events carrying their required surfaceOp marker (see dsh-session surface fold).
const events = [
	{
		seq: 0,
		time: NOW,
		type: "user/message",
		surfaceOp: "append",
		data: { content: [{ type: "text", text: "帮我优化记忆系统，重点看中文检索" }] }
	},
	{
		seq: 1,
		time: NOW + 1000,
		type: "assistant/message",
		surfaceOp: "append",
		data: { message: { content: [{ type: "text", text: "我建议用 FTS5 trigram tokenizer 修复中文分词问题" }] } }
	},
	{
		seq: 2,
		time: NOW + 2000,
		type: "tool/result",
		surfaceOp: "append",
		data: { message: { content: [{ type: "text", text: "SELECT * FROM persisted_docs WHERE 索引优化 MATCH ?" }] } }
	}
];

const header = { version: 1, id: SESSION_ID, createdAt: NOW };

function stubCtx() {
	const sessions = {
		list: () => [{ header, events }],
		get: (id) => (id === SESSION_ID ? { header, events } : void 0)
	};
	return {
		reflect: { provide() {} },
		sessions,
		inject: () => ({ dispose() {} }),
		effect: () => () => {},
		logger: console
	};
}

async function withEngine(fn) {
	const engine = new CjkSessionQueryEngine(stubCtx(), { path: ":memory:", openAt: "startup" });
	try {
		return await fn(engine);
	} finally {
		await engine.close();
	}
}

test("CJK query hits via the trigram table (upstream unicode61 cannot match this)", async () => {
	await withEngine(async (engine) => {
		const page = await engine.searchEvents({ sessionId: SESSION_ID, query: "中文分词", limit: 10 });
		assert.ok(page.items.length > 0, "expected at least one CJK hit");
		assert.ok(page.items[0].snippet.includes("中文分词"), `snippet should contain the query: ${page.items[0].snippet}`);
	});
});

test("ASCII query still hits via the unicode61 table (fallback preserved)", async () => {
	await withEngine(async (engine) => {
		const page = await engine.searchEvents({ sessionId: SESSION_ID, query: "trigram", limit: 10 });
		assert.ok(page.items.length > 0, "expected at least one ASCII hit");
		assert.ok(page.items[0].snippet.includes("trigram"));
	});
});

test("CJK session-level search returns the session with its best match", async () => {
	await withEngine(async (engine) => {
		const page = await engine.searchSessions({ query: "索引优化", limit: 10 });
		assert.ok(page.items.length > 0, "expected at least one session hit");
		assert.equal(page.items[0].header.id, SESSION_ID);
		assert.ok(page.items[0].bestMatch.snippet.includes("索引优化"));
	});
});

test("a CJK query absent from the log returns no hits", async () => {
	await withEngine(async (engine) => {
		const page = await engine.searchEvents({ sessionId: SESSION_ID, query: "量子计算", limit: 10 });
		assert.equal(page.items.length, 0);
	});
});
