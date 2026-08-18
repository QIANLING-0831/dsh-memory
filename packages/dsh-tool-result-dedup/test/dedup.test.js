import { test } from "node:test";
import assert from "node:assert/strict";
import { createDedupPolicy, dedupNotice, normalizeText } from "../lib/index.js";

const text = (content) => content[0].text;

function acceptDecision(textValue) {
	return { kind: "accept", content: [{ type: "text", text: textValue }] };
}

function exec(name, callId, parent) {
	return { name, callId, parent };
}

async function runHandler(handler, execValue, decision) {
	return handler(execValue, { content: decision.content }, async () => decision);
}

test("normalizeText trims per-line trailing whitespace and edge blank lines", () => {
	assert.equal(normalizeText("a  \nb\t\n\n", "trim-eol"), "a\nb");
	assert.equal(normalizeText("a\nb", "exact"), "a\nb");
	assert.equal(normalizeText("  a  \n", "trim-eol"), "a");
});

test("identical repeated results are replaced with a pointer on the second occurrence", async () => {
	const handler = createDedupPolicy({ maxCacheBytes: 1024, normalize: "trim-eol" });
	const first = await runHandler(handler, exec("git_status", "c1"), acceptDecision(" M src/a.ts\n M src/b.ts\n"));
	assert.equal(first.kind, "accept");
	assert.equal(text(first.content), " M src/a.ts\n M src/b.ts\n");
	const second = await runHandler(handler, exec("git_status", "c2"), acceptDecision(" M src/a.ts\n M src/b.ts\n"));
	assert.equal(second.kind, "accept");
	assert.equal(text(second.content), dedupNotice("git_status", "c1"));
});

test("whitespace-only differences still dedup under trim-eol", async () => {
	const handler = createDedupPolicy({ maxCacheBytes: 1024, normalize: "trim-eol" });
	await runHandler(handler, exec("ls", "c1"), acceptDecision("a.txt  \nb.txt\n"));
	const second = await runHandler(handler, exec("ls", "c2"), acceptDecision("a.txt\nb.txt"));
	assert.ok(text(second.content).startsWith("(Identical"));
});

test("distinct results are never deduped", async () => {
	const handler = createDedupPolicy({ maxCacheBytes: 1024, normalize: "trim-eol" });
	await runHandler(handler, exec("read", "c1"), acceptDecision("version A"));
	const second = await runHandler(handler, exec("read", "c2"), acceptDecision("version B"));
	assert.equal(text(second.content), "version B");
});

test("results over maxCacheBytes are skipped", async () => {
	const handler = createDedupPolicy({ maxCacheBytes: 4, normalize: "trim-eol" });
	const first = await runHandler(handler, exec("cat", "c1"), acceptDecision("long enough text"));
	const second = await runHandler(handler, exec("cat", "c2"), acceptDecision("long enough text"));
	assert.equal(text(first.content), "long enough text");
	assert.equal(text(second.content), "long enough text");
});

test("non-accept and value-replacement decisions pass through", async () => {
	const handler = createDedupPolicy({ maxCacheBytes: 1024, normalize: "trim-eol" });
	const blocked = await handler(exec("write", "c1"), { content: [] }, async () => ({ kind: "block", reason: "nope" }));
	assert.equal(blocked.kind, "block");
	const replaced = await handler(exec("write", "c2"), { content: [] }, async () => ({ kind: "accept", value: { ok: true } }));
	assert.deepEqual(replaced, { kind: "accept", value: { ok: true } });
});

test("nested composite calls are skipped", async () => {
	const handler = createDedupPolicy({ maxCacheBytes: 1024, normalize: "trim-eol" });
	const inner = { parent: { id: "outer" } };
	const decision = acceptDecision("same payload");
	await runHandler(handler, exec("bash", "c1", inner), decision);
	const second = await runHandler(handler, exec("bash", "c2", inner), decision);
	assert.equal(text(second.content), "same payload");
});
