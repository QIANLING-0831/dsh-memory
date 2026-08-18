# dsh-session-query-sqlite-cjk

CJK 可用的 `ctx.sessionQuery` 后端：继承 `@deepseek-ai/dsh-session-query` 服务定义的 SQLite FTS5 provider，**双 tokenizer 双表**索引——上游 `unicode61` 表（英文/代码原样）+ 新增 `trigram` 表（中文子串召回），查询**按是否含 CJK 字符自动路由**。

## 为什么需要它

上游 `dsh-session-query-sqlite` 用 FTS5 `unicode61` tokenizer，**不切中文**：连续汉字被当成一个 token，连"索引优化"这种整句都搜不到（必须完整复现整句）。实测：

```sql
-- unicode61（上游）：'Token消耗'、'"索引优化"' 均 0 命中（CJK 整段=单 token）
-- trigram（本包）：  'Token消耗' 子串直接命中
```

本包为中文用户修复这一缺陷，且**英文/代码检索行为与上游完全一致**（无 CJK 字符时仍走 unicode61 表）。

## 与上游的关系（fork 声明）

本包是 [`@deepseek-ai/dsh-session-query-sqlite`](https://github.com/deepseek-ai/deepseek-harness)（MIT，v0.1.0-rc.7）的 fork-copy，完整保留了上游的调和状态机、generation、TEMP shadow、游标、分页等全部契约。改动仅：

1. 派生库标识：`application_id = 1146308690`（与上游 1146308689 区分，防止混用），`user_version = 1`；
2. 新增两张 trigram FTS5 表：`persisted_docs_cjk` / `temp.live_docs_cjk`（双写索引，删除同步）；
3. 查询路由：`containsCjk(query)` 命中 CJK 字符 → 走 `*_cjk` trigram 表，否则走原表；
4. 类名 `CjkSessionQueryEngine`，导出常量加 `CJK_` 前缀。

其余代码与上游一致。上游更新时可 diff 同步。

## 配置

与上游 `dsh-session-query-sqlite` 相同：

| Key | 默认 | 说明 |
|---|---|---|
| `path` | 必填 | 专用派生索引 SQLite 路径（`:memory:` 支持） |
| `openAt` | `startup` | `startup` / `first-search` / `never` |
| `journalMode` | `wal` | `wal` / `delete` / `truncate` / `persist` |
| `defaultLimit` / `maxLimit` | `20` / `100` | 分页 |
| `snippetChars` | `240` | snippet 上限（Unicode 码点） |
| `readWindowMax` / `persistedInspectConcurrency` | `50` / `4` | 继承自服务定义 |

## 已知限制

- **trigram 表体积约为原文 2–3 倍**：双写双表，磁盘占用高于上游；派生库可丢弃、可重建（schema version 机制保证）。
- **查询少于 3 个字符不匹配 trigram**（FTS5 trigram 固有限制）：单字/两字中文查询会空手而归——路由只在查询含 CJK 时切 trigram，短英文查询仍走 unicode61 不受影响；若需单字匹配，可在上层用 `filterEvents({ text })` 字面扫描兜底。
- 混排文本（中文 + 代码）以"查询是否含 CJK"为路由依据，查询为纯 ASCII 时只搜 unicode61 表。

## 测试

```sh
node --test test/cjk.test.js
```

覆盖：中文子串命中（trigram）、ASCII 命中（unicode61 回退）、会话级检索、无命中场景。
