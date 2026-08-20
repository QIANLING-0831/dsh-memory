import assert from "node:assert/strict";
import { test } from "node:test";

import { extractDocuments, redactSensitiveText } from "../lib/kimi-wire.js";

test("extracts v2 messages and paired tool file metadata", () => {
  const documents = extractDocuments([
    { type: "context.append_message", message: { role: "user", content: [{ type: "text", text: "记住数据库决定" }] } },
    { type: "context.append_loop_event", event: { type: "tool.call", toolCallId: "c1", input: { path: "src/db.ts" } } },
    { type: "context.append_loop_event", event: { type: "tool.result", toolCallId: "c1", result: { output: [{ type: "text", text: "API_KEY=abc123 operation complete" }] } } },
  ], { workspace: "C:/project", sessionId: "s1", agentId: "main" });
  assert.equal(documents.length, 2);
  assert.equal(documents[1].filePath, "src/db.ts");
  assert.ok(documents[1].content.includes("[REDACTED]"));
  assert.ok(!documents[1].content.includes("abc123"));
});

test("redacts common credential assignments", () => {
  assert.equal(redactSensitiveText("password: hunter2"), "password=[REDACTED]");
});
