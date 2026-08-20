import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { test } from "node:test";

import { MemoryStore } from "../../memory-engine/lib/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

test("Kimi manifest references paths that stay inside the plugin root", async () => {
  const manifest = JSON.parse(await readFile(join(root, "kimi.plugin.json"), "utf8"));
  assert.equal(manifest.name, "kimi-memory-plus");
  assert.equal(manifest.mcpServers.memory.command, "node");
  assert.ok(manifest.mcpServers.memory.args[0].startsWith("./"));
  assert.ok(manifest.systemPromptPath.startsWith("./"));
});

test("stdio MCP server lists tools and persists a workspace fact", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "kimi-memory-plus-"));
  const child = spawn(process.execPath, [join(root, "packages/kimi-memory-plugin/server/index.js")], {
    cwd: root,
    env: { ...process.env, KIMI_MEMORY_DB: join(directory, "memory.db") },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  let buffer = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  const request = (id, method, params = {}) => new Promise((resolveResponse, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 5000);
    pending.set(id, (message) => { clearTimeout(timer); resolveResponse(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const initialized = await request(1, "initialize", { protocolVersion: "2025-06-18" });
  assert.equal(initialized.result.serverInfo.name, "kimi-memory-plus");
  const listed = await request(2, "tools/list");
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["memory_search", "memory_remember", "memory_list", "memory_forget", "memory_status"]);
  const remembered = await request(3, "tools/call", { name: "memory_remember", arguments: { workspace: directory, content: "Use pnpm", topic: "convention" } });
  assert.match(remembered.result.content[0].text, /Remembered/);
  const facts = await request(4, "tools/call", { name: "memory_list", arguments: { workspace: directory } });
  assert.match(facts.result.content[0].text, /Use pnpm/);
});

test("SessionEnd hook indexes a persisted Kimi wire log", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kimi-memory-hook-"));
  const workspace = join(directory, "workspace");
  const sessionId = "session_fixture";
  const wireDirectory = join(directory, "sessions", "work-key", sessionId, "agents", "main");
  await mkdir(wireDirectory, { recursive: true });
  await writeFile(join(wireDirectory, "wire.jsonl"), `${JSON.stringify({
    type: "context.append_message",
    seq: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "使用蓝绿色部署方案" }] },
  })}\n`);
  const database = join(directory, "memory.db");
  const child = spawn(process.execPath, [join(root, "packages/kimi-memory-plugin/hooks/index-session.mjs")], {
    cwd: root,
    env: { ...process.env, KIMI_CODE_HOME: directory, KIMI_MEMORY_DB: database },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(JSON.stringify({ hook_event_name: "SessionEnd", session_id: sessionId, cwd: workspace }));
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  assert.equal(exitCode, 0);
  const store = new MemoryStore({ path: database });
  const hits = store.search({ workspace, query: "蓝绿色" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].createdAt, Date.parse("2026-01-01T00:00:00.000Z"));
  store.close();
});
