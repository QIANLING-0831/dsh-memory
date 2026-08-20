import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const SECRET_PATTERN = /(?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/giu;

export function redactSensitiveText(text) {
  return String(text).replace(SECRET_PATTERN, (match) => `${match.split(/[:=]/u, 1)[0]}=[REDACTED]`);
}

export function extractDocuments(records, context) {
  const documents = [];
  const toolFiles = new Map();
  records.forEach((record, index) => {
    const seq = Number(record.seq ?? record.sequence ?? index);
    const type = String(record.type ?? "unknown");
    const recordContext = { ...context, createdAt: timestampOf(record) };
    if (type === "context.append_loop_event") {
      extractLoopEvent(record.event, seq, toolFiles, documents, recordContext);
      return;
    }
    if (type === "context.append_message") {
      pushDocument(documents, recordContext, seq, `message.${record.message?.role ?? "unknown"}`, textFromParts(record.message?.content));
      return;
    }
    if (type === "turn.prompt") {
      pushDocument(documents, recordContext, seq, "message.user", record.prompt ?? record.text);
      return;
    }
    if (type === "content.part") {
      pushDocument(documents, recordContext, seq, "message.assistant", textFromParts([record.part]));
      return;
    }
    if (type === "tool.call") {
      rememberToolFile(toolFiles, record.toolCallId ?? record.tool_call_id, record.arguments ?? record.input);
      return;
    }
    if (type === "tool.result") {
      const id = record.toolCallId ?? record.tool_call_id;
      pushDocument(documents, recordContext, seq, "tool.result", textFromOutput(record.output ?? record.result), toolFiles.get(id));
    }
  });
  return documents;
}

function extractLoopEvent(event, seq, toolFiles, documents, context) {
  if (!event || typeof event !== "object") return;
  if (event.type === "content.part") {
    pushDocument(documents, context, seq, "message.assistant", textFromParts([event.part]));
  } else if (event.type === "tool.call") {
    rememberToolFile(toolFiles, event.toolCallId ?? event.tool_call_id ?? event.callId, event.arguments ?? event.input);
  } else if (event.type === "tool.result") {
    const id = event.toolCallId ?? event.tool_call_id ?? event.callId ?? event.result?.toolCallId;
    pushDocument(documents, context, seq, "tool.result", textFromOutput(event.result?.output ?? event.output ?? event.result), toolFiles.get(id));
  }
}

function rememberToolFile(toolFiles, id, input) {
  if (!id) return;
  const parsed = parseObject(input);
  const filePath = parsed?.path ?? parsed?.file_path ?? parsed?.filePath;
  if (typeof filePath === "string" && filePath.length > 0) toolFiles.set(id, filePath);
}

function parseObject(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function textFromParts(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function textFromOutput(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return textFromParts(output);
  if (output && typeof output === "object") {
    if (Array.isArray(output.content)) return textFromParts(output.content);
    if (typeof output.text === "string") return output.text;
  }
  return "";
}

function pushDocument(documents, context, seq, kind, content, filePath) {
  const redacted = redactSensitiveText(content ?? "").trim();
  if (redacted.length === 0) return;
  documents.push({ ...context, seq, kind, content: redacted, filePath, createdAt: context.createdAt ?? Date.now() });
}

function timestampOf(record) {
  const raw = record.createdAt ?? record.created_at ?? record.time ?? record.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

export async function readWireFile(filePath, context) {
  const raw = await readFile(filePath, "utf8");
  const records = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { /* tolerate a torn final record */ }
  }
  const agentId = basename(dirname(filePath));
  return extractDocuments(records, { ...context, agentId });
}

export async function findWireFiles(sessionsRoot, sessionId) {
  const sessionDir = await findDirectory(sessionsRoot, sessionId, 0);
  if (!sessionDir) return [];
  const agentsDir = join(sessionDir, "agents");
  try {
    const agents = await readdir(agentsDir, { withFileTypes: true });
    return agents.filter((entry) => entry.isDirectory()).map((entry) => join(agentsDir, entry.name, "wire.jsonl"));
  } catch {
    return [];
  }
}

async function findDirectory(root, name, depth) {
  if (depth > 4) return undefined;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return undefined; }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === name) return join(root, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findDirectory(join(root, entry.name), name, depth + 1);
    if (found) return found;
  }
  return undefined;
}
