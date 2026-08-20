import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const APPLICATION_ID = 1364021837;
const SCHEMA_VERSION = 1;
const LEGACY_APPLICATION_IDS = new Set([1146308692]);
export const MEMORY_TOPICS = ["preference", "convention", "environment", "decision", "general"];

export function normalizeContent(content) {
  return String(content ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeWorkspace(workspace) {
  const value = String(workspace ?? "").trim();
  if (value.length === 0) throw new Error("memory-engine: workspace must not be blank");
  const absolute = resolve(value);
  let canonical;
  try { canonical = realpathSync.native(absolute); } catch { canonical = absolute; }
  const normalized = canonical.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}

export function overlapSimilarity(a, b) {
  const va = buckets(normalizeContent(a));
  const vb = buckets(normalizeContent(b));
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [ch, count] of va) {
    dot += count * (vb.get(ch) ?? 0);
    na += count * count;
  }
  for (const count of vb.values()) nb += count * count;
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm === 0 ? 0 : Math.min(1, dot / norm);
}

function buckets(text) {
  const result = new Map();
  for (const ch of text) result.set(ch, (result.get(ch) ?? 0) + 1);
  return result;
}

function ensureSchema(db) {
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS core_facts (
      fact_id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_core_fact_hash
      ON core_facts (workspace, content_hash);
    CREATE INDEX IF NOT EXISTS idx_core_fact_workspace
      ON core_facts (workspace, updated_at DESC);

    CREATE TABLE IF NOT EXISTS archive_documents (
      document_id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      file_path TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (session_id, agent_id, seq, kind)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_archive_workspace
      ON archive_documents (workspace, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_archive_file
      ON archive_documents (workspace, file_path);
  `);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export class MemoryStore {
  #db;
  #similarityThreshold;

  constructor(options) {
    if (typeof options?.path !== "string" || options.path.trim().length === 0) {
      throw new Error("memory-engine: path must not be blank");
    }
    this.#similarityThreshold = options.similarityThreshold ?? 0.9;
    if (this.#similarityThreshold < 0 || this.#similarityThreshold > 1) {
      throw new Error("memory-engine: similarityThreshold must be in [0, 1]");
    }
    const actual = options.path === ":memory:" ? options.path : resolve(options.path);
    if (actual !== ":memory:") mkdirSync(dirname(actual), { recursive: true, mode: 0o700 });
    this.#db = new DatabaseSync(actual);
    this.#db.exec("PRAGMA busy_timeout = 5000");
    this.#db.exec("PRAGMA journal_mode = WAL");
    const { application_id: applicationId } = this.#db.prepare("PRAGMA application_id").get();
    const { user_version: version } = this.#db.prepare("PRAGMA user_version").get();
    if (applicationId !== 0 && applicationId !== APPLICATION_ID && !LEGACY_APPLICATION_IDS.has(applicationId)) {
      this.#db.close();
      throw new Error(`memory-engine: database at "${actual}" belongs to another application`);
    }
    if (applicationId === APPLICATION_ID && version !== SCHEMA_VERSION) {
      this.#db.close();
      throw new Error(`memory-engine: unsupported schema version ${version}`);
    }
    ensureSchema(this.#db);
  }

  remember(input) {
    const workspace = normalizeWorkspace(input.workspace);
    const topic = MEMORY_TOPICS.includes(input.topic) ? input.topic : "general";
    const content = normalizeContent(input.content);
    if (content.length === 0) throw new Error("memory-engine: content must not be blank");
    const confidence = Math.max(0, Math.min(1, Number(input.confidence ?? 0.7)));
    const hash = createHash("sha256").update(content, "utf8").digest("hex");
    const now = Date.now();
    const exact = this.#db.prepare(
      "SELECT fact_id FROM core_facts WHERE workspace = ? AND content_hash = ?",
    ).get(workspace, hash);
    if (exact !== undefined) {
      this.#db.prepare(
        "UPDATE core_facts SET confidence = MAX(confidence, ?), updated_at = ? WHERE fact_id = ?",
      ).run(confidence, now, exact.fact_id);
      return { factId: exact.fact_id, merged: true };
    }
    const candidates = this.#db.prepare(
      "SELECT fact_id, content FROM core_facts WHERE workspace = ?",
    ).all(workspace);
    for (const candidate of candidates) {
      if (overlapSimilarity(candidate.content, content) >= this.#similarityThreshold) {
        this.#db.prepare(
          "UPDATE core_facts SET topic = ?, content = ?, content_hash = ?, confidence = ?, updated_at = ? WHERE fact_id = ?",
        ).run(topic, content, hash, confidence, now, candidate.fact_id);
        return { factId: candidate.fact_id, merged: true };
      }
    }
    const factId = randomUUID();
    this.#db.prepare(`
      INSERT INTO core_facts
        (fact_id, workspace, topic, content, content_hash, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(factId, workspace, topic, content, hash, confidence, now, now);
    return { factId, merged: false };
  }

  list(workspace, limit = 100) {
    return this.#db.prepare(`
      SELECT fact_id AS factId, workspace, topic, content, confidence,
             created_at AS createdAt, updated_at AS updatedAt
      FROM core_facts WHERE workspace = ? ORDER BY updated_at DESC LIMIT ?
    `).all(normalizeWorkspace(workspace), Math.max(1, Math.min(500, Number(limit) || 100)));
  }

  forget(workspace, factId) {
    const result = this.#db.prepare(
      "DELETE FROM core_facts WHERE workspace = ? AND fact_id = ?",
    ).run(normalizeWorkspace(workspace), String(factId));
    return result.changes > 0;
  }

  forgetById(factId) {
    const result = this.#db.prepare("DELETE FROM core_facts WHERE fact_id = ?").run(String(factId));
    return result.changes > 0;
  }

  indexDocuments(documents) {
    if (!Array.isArray(documents) || documents.length === 0) return 0;
    const insert = this.#db.prepare(`
      INSERT INTO archive_documents
        (document_id, workspace, session_id, agent_id, seq, kind, content, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (session_id, agent_id, seq, kind) DO UPDATE SET
        content = excluded.content,
        file_path = excluded.file_path,
        created_at = excluded.created_at
    `);
    let indexed = 0;
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      for (const document of documents) {
        const content = normalizeContent(document.content);
        if (content.length === 0) continue;
        const workspace = normalizeWorkspace(document.workspace);
        const identity = [document.sessionId, document.agentId, document.seq, document.kind].join(":" );
        const documentId = createHash("sha256").update(identity).digest("hex");
        insert.run(
          documentId,
          workspace,
          String(document.sessionId),
          String(document.agentId ?? "main"),
          Number(document.seq),
          String(document.kind ?? "message"),
          content,
          document.filePath ? String(document.filePath) : null,
          Number(document.createdAt ?? Date.now()),
        );
        indexed += 1;
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return indexed;
  }

  search(input) {
    const workspace = normalizeWorkspace(input.workspace);
    const query = normalizeContent(input.query).toLocaleLowerCase();
    if (query.length === 0) return [];
    const limit = Math.max(1, Math.min(20, Number(input.limit) || 5));
    const maxChars = Math.max(100, Math.min(4000, Number(input.maxChars) || 800));
    const file = normalizeContent(input.file ?? "").toLocaleLowerCase();
    const terms = query.split(/\s+/u).filter(Boolean);
    const rows = this.#db.prepare(`
      SELECT session_id AS sessionId, agent_id AS agentId, seq, kind, content,
             file_path AS filePath, created_at AS createdAt
      FROM archive_documents WHERE workspace = ?
      ORDER BY created_at DESC LIMIT 5000
    `).all(workspace);
    return rows
      .map((row) => {
        const haystack = row.content.toLocaleLowerCase();
        if (file && !String(row.filePath ?? "").toLocaleLowerCase().includes(file)) return null;
        let score = 0;
        for (const term of terms) {
          const hits = haystack.split(term).length - 1;
          if (hits === 0) return null;
          score += 1 + Math.log1p(hits);
        }
        score += Math.max(0, 1 - (Date.now() - row.createdAt) / (1000 * 60 * 60 * 24 * 365));
        return { ...row, score, snippet: truncateAround(row.content, query, maxChars) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  status(workspace) {
    const normalized = normalizeWorkspace(workspace);
    const facts = this.#db.prepare("SELECT COUNT(*) AS count FROM core_facts WHERE workspace = ?").get(normalized).count;
    const documents = this.#db.prepare("SELECT COUNT(*) AS count FROM archive_documents WHERE workspace = ?").get(normalized).count;
    return { workspace: normalized, facts, documents, schemaVersion: SCHEMA_VERSION };
  }

  close() {
    this.#db?.close();
    this.#db = undefined;
  }
}

function truncateAround(content, query, maxChars) {
  const points = Array.from(content);
  if (points.length <= maxChars) return content;
  const offset = content.toLocaleLowerCase().indexOf(query);
  if (offset < 0) return `${points.slice(0, maxChars).join("")}…`;
  const start = Math.max(0, offset - Math.floor(maxChars / 3));
  return `${start > 0 ? "…" : ""}${Array.from(content.slice(start)).slice(0, maxChars).join("")}…`;
}
