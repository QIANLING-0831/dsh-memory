# DSH 记忆系统 v2 —— 三层记忆数据库 + 词条索引 + 两级检索

> 本版在 v1（`MEMORY-OPTIMIZATION-PROPOSAL.md` 已并入本文件）基础上，采纳"三层分层 + 每层词条库 + 增量驱动 + 词条优先检索 + mem0 式混合检索/增删改/去重"的架构，并将所有参数落到 DSH 的实际扩展点与契约上。

---

## 0. TL;DR

以 **working / archival / core 三层记忆**为骨架，每层在**同一个派生 SQLite 库**（遵守 DSH"单一 owner 派生索引"契约）中维护**带词条标记（tags）的 Entry 表**：

```
working  = 当前 surface 游标（不建库，就是上下文本身）
archival = shadowed/log-only 事件的全文+向量索引（= 现有 FTS5 的扩展，只追加）
core     = 跨会话蒸馏事实（全新，真正的 CRUD）
dedup    = 内容哈希表（写时 + 读时双重去重）
```

**建立/更新由数据增量驱动**（事件为增量单位，批量防抖参数化），与"token 压力驱动的压缩"完全解耦。**查询走两级管线**：先按词条精确过滤（快、零嵌入），再 mem0 式混合检索（FTS5 词法 + 向量语义，RRF 融合），注入前做第三级去重指针化。所有注入遵守 `ctx.tokenMeter` 预算 + 请求尾部追加（KV cache 前缀不变）。

---

## 1. 现状盘点（要点）

- 数据面：JSONL 事件日志 → `dsh-session` surface fold（current/shadowed/log-only）→ 模型上下文；
- 索引面：`dsh-session-query-sqlite` 已有 FTS5（unicode61，**中文不切词**），但 README 明言 *"a model-facing tool are absent"*——索引不接模型上下文；
- 缩减面：compaction 有损摘要（token 压力驱动）、spill 无损移出（召回靠模型手动 read/grep 猜路径）；
- 计量面：`ctx.tokenMeter` 可作注入预算的唯一权威。

**结论**：地基（日志、FTS5、spill、计量）都在，缺的是"把索引变成记忆通道"的增量层。v2 把缺口补成三层库 + 词条 + 两级查询。

---

## 2. 目标架构：三层记忆数据库

```
                    ┌────────────────────────────────────────────┐
                    │  派生记忆库 memory.db（单一 owner，可重建）    │
                    │                                            │
  session/event ──► │  working    surface_cursor（游标，非实体库）  │
      （增量）        │  archival   entries + FTS5(词法) + 向量      │
                    │  core       entries（事实，带 topic/置信度）   │
  tools/post-execute│  dedup      hash → (seq, spillRef)          │
      （哈希）        │                                            │
                    └───────────────┬────────────────────────────┘
                                    │ 两级查询
                    ┌───────────────▼────────────────────────────┐
                    │ Stage1 词条精确过滤（tags 索引，零嵌入）      │
                    │ Stage2 混合检索 FTS5+向量 → RRF 融合 → 重排   │
                    │ Stage3 注入前去重（已在上下文→指针）          │
                    └───────────────┬────────────────────────────┘
                                    │ 预算裁剪（tokenMeter）后追加请求尾部
                                    ▼
                             agent/pre-step 装配
```

### 2.1 词条（Entry）模型 —— 统一 schema

```ts
interface MemoryEntry {
  id: string                 // hash(workspace, layer, 规范化内容) 或 uuid
  layer: 'working' | 'archival' | 'core'
  content: string            // 词条文本（事件文本 / 事实句 / 指针）
  tags: string[]             // 词条标记，见 2.2
  seqs: number[]             // 来源事件 seq（core 层为引用区间）
  hash: string               // 规范化内容哈希（去重键）
  embedding?: Float32Array   // 仅 archival/core 层
  createdAt: number
  updatedAt: number
  confidence?: number        // 仅 core 层
  sourceSession?: string     // core 层跨会话归属
}
```

### 2.2 词条标记（tags）来源 —— 直接用事件日志自带元数据

| 标记 | 来源（DSH 事件元数据） | 用途 |
|---|---|---|
| `tool:<name>` | 事件携带的 toolName（`read`/`write`/`edit`/`grep`/`git_status`…） | 按工具类型精确过滤 |
| `file:<workspace相对路径>` | 工具参数里的路径（写/读/编辑目标） | **实体级定位**（"改过 src/a.ts 的所有内容"） |
| `type:<eventType>` | 事件类型（user/assistant/tool-result/compaction…） | 层内分流 |
| `surface:<current\|shadowed\|log-only>` | surface fold 分类 | 检索范围（只查 shadowed/log-only 更省） |
| `hash:<sha256>` | 内容规范化哈希 | 去重键 |
| `seq:<n>-<m>` | 日志区间 | 指针化、追溯 |

这些标记**零额外 LLM 成本**（事件本来就带），构成 Stage 1 精确过滤的索引键。与 [Mem0 的 metadata 过滤](https://github.com/oligodendrocyte/mem0)（user_id/agent_id/run_id）对应到 DSH 就是 workspace/session/layer/tags。

### 2.3 各层语义（关键：增删改只属于 core 层）

| 层 | 内容 | 写语义 | 存储 |
|---|---|---|---|
| working | 当前 surface tail | 游标滑动 | 内存投影 + `surface_cursor` 行 |
| archival | shadowed/log-only 事件全文 | **只追加**（日志不可变；派生 tag 可更新，内容不可改） | entries + FTS5 + 向量 |
| core | 蒸馏事实（用户偏好/约定/环境事实） | **CRUD**：相似度合并更新/删除 | entries（带 topic/confidence） |
| dedup | 结果哈希索引 | 命中即指针化 | hash → (seq, spillRef) |

> 为什么 archival 必须只追加：DSH 事件日志是事实源，`dsh-session-query` 的 surface fold 对"替换/删除表面节点"有严格校验（引用完整性）。对历史事件的"更新"只允许发生在**派生层**（tag、游标、摘要指针），绝不能改日志本身。

---

## 3. 增量驱动的建立/更新参数（"什么时候建、什么时候更新"）

原则：**索引永远增量新鲜（事件级 delta），压缩只在 token 压力告急时出手**——两个触发完全解耦。

| 参数 | 默认 | 含义 |
|---|---|---|
| `memory.index.batchEvents` | `16` | 累积 16 个新事件批量落库一次（防每事件开销） |
| `memory.index.batchBytes` | `64KB` | 或新事件文本累计 64KB 即触发落库 |
| `memory.index.embedBatch` | `8` | 嵌入批量大小（本地 bge-small-zh 或远端） |
| `memory.index.embedAsync` | `true` | 嵌入异步、脱热路径；落库先行，向量后补 |
| `memory.dedup.normalize` | `trim+EOL` | 哈希前规范化（去行尾空白/时间戳噪声） |
| `memory.core.extractEveryTurns` | `5` | core 层每 N 回合做一次保守提取+合并 |
| `memory.core.similarityMerge` | `0.92` | 新事实与旧条目余弦 > 阈值 → 合并更新而非新增 |
| `memory.recall.injectBudgetRatio` | `0.04` | 注入块预算 = 路由上下文窗口 × 比例（tokenMeter 实测裁剪） |
| `memory.recall.topK` / `maxChars` | `5` / `2000` | 检索返回条数与 snippet 上限 |

**各层时机表**：

| 层 | 建立 | 更新 |
|---|---|---|
| working | 会话创建 | 每步提交事件后滑动游标 |
| archival | 事件增量批（batchEvents/batchBytes 任一达标） | 追加新事件；派生 tag 重算；压缩替换区间时更新指针 |
| core | 每 extractEveryTurns 回合末 / 压缩时顺带 | 相似度合并；用户显式纠正时降权/删除 |
| dedup | 每个工具结果（`tools/post-execute`，同步） | 命中历史哈希 → 替换为指针 |

与现有机制的对应：`dsh-session-query-sqlite` 的调和状态机本来就是"比对快照修订、只检查新增/变更日志"——增量参数只是把它的批次粒度显式化、并把嵌入补进去。projection registry 也是每事件驱动 apply——同一事件流，新增一个观察者即可。

---

## 4. 两级（实际三级）查询管线

```
query = { 最新用户消息, goal/plan 快照, 最近触碰文件, 当前活动文件? }

Stage 1  词条精确过滤（快、确定性、零嵌入）
         WHERE tags 命中 file:最近文件 / tool:最近工具 / hash
         → 候选集 C1（tags 索引 O(log n)）

Stage 2  mem0 式混合检索（召回）
         词法臂：FTS5（先修 CJK 分词，见 Phase 0）
         语义臂：查询向量 × archival/core 向量（sqlite-vec）
         → RRF 融合 → 重排 → topK

Stage 3  合并 C1 ∪ topK → 注入前检查：
         已在当前上下文（按 hash/seq 命中）→ 替换为指针
         "(同 seq <n> / spill 定位符 <loc>)" → 预算裁剪 → 追加请求尾部
```

要点：
- **Stage 1 是过滤器，Stage 2 是排序器**：词条命中决定"范围"，混合检索决定"排序"，两者是 AND 关系而非二选一；
- **去重两端都做**：写入时（dedup 表，防重复入库）+ 读取/注入时（防重复进上下文）；
- **查询嵌入可缓存**：同一回合内用户消息不变，查询向量只算一次（远端嵌入则省一次 API 调用）；
- **KV 纪律不变**：注入块只追加在请求尾部（user 消息之后），前缀字节不变 → provider KV cache 复用不被破坏；
- **预算门控**：Stage 1 命中为空 或 压力安全 → 注入块为空，零成本。

---

## 5. 从 mem0 / Letta 借什么、不引什么

- **不引依赖**：mem0 是 Python 优先生态（虽有 TS SDK），DSH 是 TS/Cordis 插件体系，直接 import 会带来重型依赖并违反"单一 owner 派生库"契约。**借模式**：
  - [Mem0](https://github.com/oligodendrocyte/mem0)：`add/search/get_all/update/delete` API 形状、metadata 过滤（→ tags）、相似度合并阈值、混合检索；
  - [Letta/MemGPT](https://deepwiki.com/letta-ai/letta/3-memory-system)（[Memory is not recall](https://forum.letta.com/t/memory-is-not-recall/70/3)）：core 块小而稳、archival 按需取的分层纪律；
  - [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)：上下文化切块（事件 + 工具名/文件路径语境），DSH 事件自带元数据，成本≈0；
  - [sqlite-vec](https://github.com/asg017/sqlite-vec)：SQLite 内嵌向量，契合单库模式。

---

## 6. 落地路线（每阶段独立交付）

- **Phase 0（地基）**：CJK 分词（trigram/分词 tokenizer，新 provider 覆盖 FTS 方法）+ 哈希去重（`tools/post-execute`）。验证：中文召回测试集 + 重复结果指针化。
- **Phase 1（主收益）**：archival 向量臂 + Stage 1/2/3 查询管线 + `memory/search` 工具（`memory_search(query, scope, limit, max_chars)`，snippet 有界）。验证：开/关 recall 的输入 token 中位数 + 任务完成度不变性。
- **Phase 2（精修）**：core 层事实库（提取/合并/删除 + 头块注入）+ 指针式压缩（compaction `summarize()` 子类钩子输出定位符）+ 实体索引（file 词条子图）。

---

## 7. 成本估算（开发 + 运行时）

> 按 DeepSeek API 2025 年公开价量级：输入约 ¥1–2/百万（缓存命中 ¥0.5 以下）、输出约 ¥8/百万。仅为量级估算，实际随模型档位与测试量浮动 2–3 倍。

**开发成本（一次性的，编码 agent 工作量）**：

| 阶段 | 内容 | 估算 token | 估算费用 |
|---|---|---|---|
| Phase 0 | CJK 分词 + 哈希去重 | 50–100 万 | ¥5–15 |
| Phase 1 | 混合检索 + 注入管线 + memory/search 工具 | 150–300 万 | ¥10–30 |
| Phase 2 | core 事实库 + 指针式压缩 + 实体索引 | 100–200 万 | ¥5–20 |
| **合计** | | **300–600 万** | **¥15–60（$2–8）** |

成本结构：读 DSH 源码/契约 20–30%（输入、多走缓存命中，便宜）；写码+迭代 30–40%（输出占比高，最贵）；真机测试 30–40%（每步重发 system+tools+历史 2–10 万 token，**最大变量**——只写码+单测可省 30–50%）。

**运行时成本/收益（持续性的）**：本地嵌入 0 成本；`memory/search` 每次 ≤0.5–1.5K token（有界）；注入块 ≤4% 窗口。净收益 = 每长会话省 15–30% 输入 token + 压缩 LLM 调用减少。实现一次性 ¥15–60，收益每次会话持续，通常数个长会话即回本；对个人用户更大价值是可用上下文变长、细节不丢。

---

## 8. 附录：涉及包与扩展点

| 包 | 角色 | 用法 |
|---|---|---|
| `dsh-session-persistence-jsonl` | 事件日志 | 增量索引事实源 |
| `dsh-session` | surface fold | current/shadowed/log-only 分类 → 检索范围 |
| `dsh-session-query(-sqlite)` | FTS5 | 词法臂；新 provider 覆盖 FTS 方法（CJK）；派生库模式参照 |
| `dsh-compaction(-basic)` | 压缩 | `agent/pre-step` 触发点（与索引增量解耦）；`summarize()` 钩子做指针化 |
| `dsh-spill(-local/-policy)` | 大结果移出 | dedup 存储背板；memory/search 的精确内容臂 |
| `dsh-token-meter` | 计量 | 注入预算唯一权威 |
| `dsh-agent-loop` | 装配 | `agent/pre-step`（注入）、`tools/post-execute`（去重/索引）、`llm/stream`（KV 友好的嵌入/摘要） |
| `dsh-output-retention` | head/tail 保留 | dedup 替换文案的预览复用 |
