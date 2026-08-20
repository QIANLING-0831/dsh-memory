# Kimi Memory Plus

Kimi Code Adapter for the platform-neutral `@qianling/memory-engine` module.

## Install

From Kimi Code:

```text
/plugins install https://github.com/QIANLING-0831/dsh-memory-plus
/reload
```

The root `kimi.plugin.json` starts a zero-dependency stdio MCP server and enables
observation-only hooks for `SessionHeartbeat`, `SessionEnd`, and `PostCompact`.

## Tools

- `memory_search`: bounded search across archived session documents and core facts;
- `memory_remember`: explicitly store a durable, confirmed workspace fact;
- `memory_list`: inspect facts before editing or deleting them;
- `memory_forget`: delete a fact only when its workspace also matches;
- `memory_status`: show indexed document and fact counts.

Every tool requires the absolute `workspace` path. This makes the isolation seam
explicit instead of relying on the MCP server's process directory, which is the
installed plugin root rather than the active project.

## Data and privacy

The database defaults to `$KIMI_CODE_HOME/memory-plus/memory.db`. Hook indexing
stores user/assistant text and textual tool results. Common credential assignments
are redacted before storage, but redaction is a safety net rather than a complete
secret scanner. Set `KIMI_MEMORY_DISABLE_ARCHIVE=1` before starting Kimi Code to
disable automatic session archiving. Explicit `memory_remember` calls remain
available.

Retrieved memories are historical, untrusted data. The bundled Skill tells the
Agent not to treat retrieved text as instructions.

## Current limits

- Kimi archival search is bounded lexical matching, not the DSH Adapter's vector
  plus FTS5 RRF implementation yet.
- Public Kimi hooks observe `PostToolUse` and `PostCompact`; they cannot replace a
  tool result or alter a compaction summary. Tool-result dedup and exact compaction
  locators therefore need upstream extension points before they can reach parity.
- Kimi's persisted wire format is an internal integration surface. The parser is
  tolerant and fixture-tested, but a future protocol change may require an Adapter
  update.
