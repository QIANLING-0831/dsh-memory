import { join } from "node:path";

import { MemoryStore } from "../../memory-engine/lib/index.js";
import { findWireFiles, readWireFile } from "../lib/kimi-wire.js";
import { kimiHome, memoryDatabasePath } from "../lib/paths.js";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

if (process.env.KIMI_MEMORY_DISABLE_ARCHIVE === "1") process.exit(0);

try {
  const payload = JSON.parse(raw || "{}");
  const sessionId = String(payload.session_id ?? "");
  const workspace = String(payload.cwd ?? "");
  if (!sessionId || !workspace) process.exit(0);
  const files = await findWireFiles(join(kimiHome(), "sessions"), sessionId);
  const batches = await Promise.all(files.map((file) => readWireFile(file, { workspace, sessionId })));
  const store = new MemoryStore({ path: memoryDatabasePath() });
  store.indexDocuments(batches.flat());
  store.close();
} catch (error) {
  process.stderr.write(`kimi-memory-plus index skipped: ${error instanceof Error ? error.message : String(error)}\n`);
}
