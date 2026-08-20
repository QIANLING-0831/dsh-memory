# Kimi Memory Plus roadmap

## Shipped in the MVP

- Platform-neutral `MemoryStore` seam shared by the DSH and Kimi Adapters.
- Workspace-scoped core facts with exact-hash deduplication, similarity merge,
  listing, scoped deletion, and legacy DSH database migration.
- Zero-dependency stdio MCP server exposing bounded memory operations.
- Tolerant Kimi wire-log indexing on heartbeat, session end, and compaction.
- Credential-pattern redaction, explicit workspace arguments, archive opt-out,
  and instructions that treat recalled text as untrusted data.
- Linux and Windows CI on the same Node.js baseline required by Kimi Code.

## Next: retrieval quality and measurement

1. Add a Kimi-native document projector fixture corpus covering current and
   legacy wire protocols, parallel tools, interrupted turns, and subagents.
2. Add the DSH Adapter's real embedding implementation behind an internal
   retrieval seam, keeping lexical-only mode as the zero-download fallback.
3. Benchmark native Kimi versus Kimi Memory Plus on multi-session coding tasks:
   total input tokens, compaction count, recall precision, false-memory rate,
   task success, latency, and database growth.
4. Add retention controls and an inspect/export command before enabling any
   automatic fact extraction.

## Upstream extension proposals

The public Kimi Plugin surface intentionally keeps `PostToolUse`, `PreCompact`,
and `PostCompact` observation-only. Feature parity with the DSH Adapter should
not rely on patching Kimi internals. After the MVP has measurements, propose:

- a bounded, schema-validated tool-result transform hook for dedup pointers;
- a compaction handoff contribution that can attach source locators without
  replacing Kimi's summary algorithm;
- a stable transcript projection interface so third-party indexers do not need
  to interpret internal `wire.jsonl` records.

Each proposal should be discussed before implementation because it changes a
public extension seam and exceeds the repository's direct-PR scope.
