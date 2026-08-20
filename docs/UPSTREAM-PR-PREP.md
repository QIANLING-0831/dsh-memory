# 上游（deepseek-harness）待提 PR 预案

> 目的：官方一旦开放外部 PR（或接受小贡献），本预案让提交能在最短时间内完成。
> 依据：官方 Contributors 榜单存在外部提交先例（shigma 的 docs、FSYo 的 refactor）。
> 对应实现：`packages/dsh-session-query-sqlite-cjk`（本仓库）。

---

## A. 文档类贡献（最可能先被接受，shigma 先例）

**目标文件**：上游 `packages/session-query/session-query-sqlite/README.md`（Known Limitations and Deferred Work 一节）

**拟新增条目**：

```markdown
- **CJK text is not searchable with the default `unicode61` tokenizer** —
  consecutive Han characters are indexed as a single token, so Chinese
  full-text queries fail even on exact phrases (verified: querying
  `"索引优化"` against `索引优化减少Token消耗的句子` returns zero hits;
  the same text matches under a `trigram` tokenizer). A dual-tokenizer
  provider (`dsh-session-query-sqlite-cjk`) demonstrates the fix; see
  https://github.com/QIANLING-0831/dsh-memory.
```

**提交信息建议**：
```
docs(session-query-sqlite): document unicode61 CJK search limitation
```

---

## B. 代码修复 PR（CJK 修复，官方开放后提交）

**目标包**：`@deepseek-ai/dsh-session-query-sqlite`（上游）
**改动清单**（即本仓库 fork 的差异，已在真机验证）：

| # | 文件/位置 | 改动 |
|---|---|---|
| 1 | `lib/index.js` — `ensurePersistentSchema` | 新增 `persisted_docs_cjk` FTS5 trigram 表（保留原 `persisted_docs` unicode61 表） |
| 2 | `lib/index.js` — `ensureTemporarySchema` | 新增 `temp.live_docs_cjk` trigram 表 |
| 3 | `lib/index.js` — `containsCjk()` | 新增 CJK 字符检测（`/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/`） |
| 4 | `lib/index.js` — `selectedDocumentsSql(useCjk)` | 查询按是否含 CJK 路由到 trigram 表（highlight/FROM/MATCH 均需非限定表名——FTS5 auxiliary 不接受 schema 限定名） |
| 5 | `lib/index.js` — `_replacePersistedSession` / `_replaceLiveSession` / `_deleteSession` | 双写 / 双删 trigram 表 |
| 6 | `lib/index.js` — 常量 | 派生库 `application_id` 变更 + `user_version` 提升（不兼容 schema 原地重建，既有 guard 逻辑已支持） |
| 7 | 测试 | 中文子串命中（trigram）、ASCII 回退（unicode61）、无命中场景（见本仓库 `test/cjk.test.js`，4 用例） |

**关键实现细节（踩坑记录，PR 时附注）**：

1. `highlight()` 等 FTS5 auxiliary 函数的表名参数**不接受 schema 限定名**——`highlight(temp.live_docs, ...)` 会把 `temp.live_docs` 当列名报错，必须用非限定 `live_docs`；
2. node:sqlite 绑定 JS number 为 REAL，vec0 类扩展的 INTEGER 主键需 `CAST(? AS INTEGER)`（本修复不涉及，但同族坑）；
3. trigram 对 <3 字符查询不匹配——路由策略：**查询含 CJK 才走 trigram**，纯 ASCII 走 unicode61，两侧行为都正确。

**兼容性**：新表为增量（IF NOT EXISTS + 双写），旧库通过 user_version 提升触发原地重建；行为对纯 ASCII 查询完全不变。

---

## C. 提交流程（官方开放后）

1. fork `deepseek-ai/deepseek-harness`；
2. 按 A 先提交文档条目（最易过审）；
3. 代码修复按 B 的清单提交，PR 描述附上"踩坑记录"和真机验证结果（本仓库 `docs/VERIFICATION.md` 第 6.2 节）；
4. 与官方约定 contributor 关联：PR 作者即上榜者，无需额外操作。

---

## D. 若官方仍不开放

- 维持"独立插件生态"路径：`dsh-plugin` 话题 + Discussions 帖子持续曝光；
- 官方 README 若添加"社区插件"收录列表，主动申请收录本仓库。
