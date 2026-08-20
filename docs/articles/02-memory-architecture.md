# 给 DeepSeek Harness 装上记忆：三层记忆架构 + 混合检索(RRF) + 工具去重

> 摘要：DeepSeek Harness（DSH）的记忆链路当前"只出不进"——旧上下文被 compaction/spill 挪走后，召回靠模型自己 `read`/`grep` 猜路径。本文分享一套开源插件集的架构：`working / archival / core` 三层记忆 + FTS5×sqlite-vec 混合检索（RRF 融合）+ 工具结果去重 + KV-safe 稳定注入。不依赖任何 LLM 做元数据，全部来自事件自带信息。

---

## 1. 背景：DSH 记忆链路是"只出不进"

DSH 的会话流程里，旧内容通过两条路离开上下文：

- **compaction**：有损摘要，旧细节在摘要后丢失（除非当时被 spill）；
- **spill**：大结果移出上下文，但召回靠模型自己 `read`/`grep` 猜路径；
- **索引**（FTS5）只服务调用方主动搜索，**从未接回模型上下文**。

核心洞察：把"索引变成记忆 → 上下文的通道"。旧内容可精确找回，上下文尾部就能留短、压缩频率下降、相同内容不重复发送。

## 2. 三层记忆 + 两个横切

| 层 | 内容 | 写语义 | 存储 |
|---|---|---|---|
| **working** | 当前上下文（surface 游标） | 每步滑动 | 不建库，就是上下文本身 |
| **archival** | 旧事件全文（shadowed / log-only） | **只追加**（日志不可变，派生 tag 可更新） | 派生 SQLite：chunks + sqlite-vec 向量 + FTS5 |
| **core** | 跨会话蒸馏事实（偏好/约定/环境/决策） | **CRUD**：哈希去重 + 相似度合并 | 派生 SQLite：`core_facts` |
| **dedup** | 工具结果哈希表（横切） | 命中即指针化 | 进程级内存 |
| **skills** | 可复用技能文件（横切） | CRUD + 后台进化 | DSH 原生 Markdown |

> 为什么 archival 只追加：DSH 事件日志是事实源，surface fold 对替换/删除有引用完整性校验；对历史事件的"更新"只允许发生在派生层。

## 3. 混合检索：FTS5 词法 + sqlite-vec 语义 → RRF 融合

单靠词法或单靠向量都有短板：词法漏同义、向量漏精确字符串。做法是**两臂独立检索后 RRF（Reciprocal Rank Fusion）融合**：

```
Stage 1  词条精确过滤（file:/tool:/hash: 零嵌入）→ 候选集
Stage 2  混合检索：FTS5 词法 + 向量语义 → RRF 融合 → 重排
Stage 3  合并候选 → 已在上下文的替换为指针 → 预算裁剪
```

### 3.1 词法臂：`ctx.sessionQuery`

复用官方 `sessionQuery`，配合 CJK 修复后的 provider（`dsh-session-query-sqlite-cjk`），中文查询也能命中：

```js
const page = await this.ctx.sessionQuery.searchEvents({ sessionId, query, limit }, exec);
```

### 3.2 向量臂：sqlite-vec

SQLite 内嵌向量检索（`vec0` 表 + `MATCH`），契合"单 owner 派生库"的设计——不额外起服务：

```js
db.prepare(`
  SELECT rowid, distance FROM chunk_vec
  WHERE embedding MATCH ? AND k = ?
  ORDER BY distance
`).all(vectorToText(queryVec), k);
```

### 3.3 RRF 融合

两臂各返回排序列表，按 `1/(rank+k)` 累加分值重排，`k` 取 60。不同召回源互补，中文 + 代码 + 自然语言都能覆盖。

## 4. 增量驱动：事件级增量嵌入

不整库重算，只对新事件分批嵌入（`batchEvents=16`、`embedBatch=8`），异步、脱热路径：

- 每批事件增量落库，记录每会话 `last_seq` 水位线；
- 默认 `char-overlap` 评估嵌入（零依赖、离线），生产可换 `transformers` 真嵌入。

## 5. 词条（Entry）标记：零额外 LLM 成本

实体级定位全靠事件自带元数据，不让模型出钱：

| 标记 | 来源 | 用途 |
|---|---|---|
| `tool:<name>` | 事件 toolName | 按工具类型过滤 |
| `file:<path>` | tool/call 的 `path`/`file_path` | **实体级定位**（"改过 src/a.ts 的所有内容"） |
| `type:<eventType>` | 事件类型 | 层内分流 |
| `surface:<...>` | surface fold 分类 | 检索范围 |
| `hash:<sha256>` | 内容规范化哈希 | 去重键 |
| `seq:<n-m>` | 日志区间 | 指针化、追溯 |

## 6. core 层：KV-safe 的稳定注入

`dsh-memory-core` 把 workspace 事实（偏好/约定/环境/决策）注入**每个请求的 system-prompt section**。关键是"稳定"：

- 区块只在事实变更时（罕见）变化，**字节不变 → 前缀 KV 缓存复用**；
- 写入显式（模型调 `memory_remember`），哈希去重 + 相似度合并（Mem0 式 ADD）。

> 为什么不做"每步自动注入易变内容"？我在源码级验证过三条路径在 v0.1-rc.7 都不可行：`agent/pre-step` 会变持久化历史（Token 反膨胀）、`llm/stream` 被 `deepFreeze` 锁死、system-prompt 注入易变内容会让 KV 前缀缓存整段失效。所以 recall 走"**模型主动调工具**"，core 走"**稳定 section**"。

## 7. 工具结果去重：纯省输入 Token

`dsh-tool-result-dedup` 对重复结果（`git status` / `ls` / 重复 `read`）做哈希，第二次起替换为指针，纯省输入 Token，与记忆检索正交。

## 8. 组合起来

模型侧得到：

- `memory_search(query, limit, max_chars, file?)`：archival 混合召回，输出有界；
- `memory_remember(content, topic?)`：写 core 事实；
- `skill_write / skill_delete / skill_list`：沉淀可复用技能（见姊妹篇《Agent 技能自我进化》）。

压缩时 `<compacted-summary>` 自带 `Exact Sources` 定位符，模型可 `read <spill file>` 或 `memory_search` 恢复精确内容。

## 9. 验证

- 整树启动（8 插件，headless profile）✅；
- `memory_remember` 写入 ✅；`memory_search` 中文混合召回命中真实会话 ✅；跨会话持久化逐字注入 ✅；
- 65 单测全绿。

仓库：https://github.com/QIANLING-0831/dsh-memory-plus （MIT）

欢迎试用、提 issue。
