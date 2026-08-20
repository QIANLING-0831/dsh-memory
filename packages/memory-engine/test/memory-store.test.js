import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { MemoryStore, normalizeContent, normalizeWorkspace, overlapSimilarity } from "../lib/index.js";

test("normalization and overlap remain platform neutral", () => {
  assert.equal(normalizeContent("  用户  偏好\n中文 "), "用户 偏好 中文");
  assert.equal(overlapSimilarity("abc", "abc"), 1);
});

test("core facts are workspace scoped and deletable", () => {
  const store = new MemoryStore({ path: ":memory:" });
  const first = store.remember({ workspace: "C:/one", content: "使用 pnpm", topic: "convention" });
  const duplicate = store.remember({ workspace: "C:/one", content: "使用  pnpm" });
  assert.equal(first.factId, duplicate.factId);
  assert.equal(store.list("C:/one").length, 1);
  assert.equal(store.list("C:/two").length, 0);
  assert.equal(store.forget("C:/two", first.factId), false);
  assert.equal(store.forget("C:/one", first.factId), true);
  store.close();
});

test("archive search supports CJK substrings, file filters and bounded snippets", () => {
  const store = new MemoryStore({ path: ":memory:" });
  store.indexDocuments([
    {
      workspace: "C:/one",
      sessionId: "s1",
      agentId: "main",
      seq: 1,
      kind: "tool.result",
      content: `索引优化可以减少 Token 消耗 ${"x".repeat(500)}`,
      filePath: "src/memory.ts",
      createdAt: 1,
    },
  ]);
  const hits = store.search({ workspace: "C:/one", query: "Token 消耗", file: "memory.ts", maxChars: 120 });
  assert.equal(hits.length, 1);
  assert.ok(Array.from(hits[0].snippet).length <= 122);
  assert.equal(store.search({ workspace: "C:/two", query: "Token" }).length, 0);
  store.close();
});

test("opens and migrates an existing dsh-memory-core database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memory-engine-legacy-"));
  const path = join(directory, "memory.db");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    PRAGMA application_id = 1146308692;
    PRAGMA user_version = 1;
    CREATE TABLE core_facts (
      fact_id TEXT PRIMARY KEY, workspace TEXT NOT NULL, topic TEXT NOT NULL,
      content TEXT NOT NULL, content_hash TEXT NOT NULL, confidence REAL NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;
  `);
  const workspace = normalizeWorkspace(join(directory, "project"));
  legacy.prepare("INSERT INTO core_facts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("legacy", workspace, "general", "legacy fact", "hash", 0.7, 1, 1);
  legacy.close();
  const store = new MemoryStore({ path });
  assert.equal(store.list(join(directory, "project"))[0].content, "legacy fact");
  store.close();
});
