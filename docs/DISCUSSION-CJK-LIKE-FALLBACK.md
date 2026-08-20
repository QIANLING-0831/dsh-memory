# 评论区说「1-2 字中文 trigram 必 0 命中」——我验证了，然后修好了（附完整对照表）

> 发布地址：https://github.com/deepseek-ai/deepseek-harness/discussions （点 New discussion，分类选 **Ideas** 或 **General**）
> 标题与正文如下，可直接复制粘贴。

---

## 标题

**评论区说「1-2 字中文 trigram 必 0 命中」——我验证了，然后修好了（附完整对照表）**

## 正文

### 0. TL;DR

上帖（#3671）报告了 `dsh-session-query-sqlite` 的 `unicode61` tokenizer 不切中文、查询整体包成单短语，导致中文子串召回必然失败；我们 fork 出 `dsh-session-query-sqlite-cjk`，用「unicode61 + trigram 双表 + CJK 路由」修复。

社区反馈（#3671 评论区）精准指出 trigram 方案的**最后一块缺口**：trigram 只索引 ≥3 字符的连续子串，**1–2 字中文查询（中文查询的最常见形态）在 trigram 表上必然 0 命中**。本迭代已按建议落地 **LIKE 回退**：短 CJK 查询走 `LIKE '%词%'`，实测全绿（本包 12 单测 + 依赖包 8 单测，无回归）。

### 1. 社区反馈逐条源码验证（结论：全部成立）

1. **机制确认**：`unicode61` 对连续汉字不切词——整段汉字 = 一个 token，短语查询只能命中与文档 token 完全一致的汉字串；`"Token消耗"`、`"索引优化"` 在机制上必然 0 命中。
2. **实测数据**（node:sqlite，FTS5，与 DSH 同一引擎，文档「索引优化减少Token消耗的句子」）：trigram 命中 `"Token消耗"` / `"索引优化"` / 完整整句；`"消耗"`、`"索引"`、`"优"` 均 0 命中；`LIKE '%消耗%'` 命中。
3. **1–2 字坑**：trigram 不索引 <3 字符子串，二字/单字中文查询直接 0 命中——需要回退。
4. **集成细节**：新表需进 `DERIVED_USER_TABLES` 白名单、schema version 需随不兼容变更递增、查询分支复用现有 persisted+live 的 UNION ALL；`trigram` 的 `case_sensitive` 默认关闭，与 unicode61 一致，保持默认不回归英文检索。

### 2. 本迭代实现（`dsh-session-query-sqlite-cjk` v0.2.0，纯查询层改动 ~120 行）

- **三级路由**（替代原来的二值路由）：
  - 含 CJK 且**总长 < 3**（无法构成任何 trigram）→ **LIKE 回退**（`pd.text LIKE ? ESCAPE '\'`）；
  - 含 CJK 且总长 ≥ 3 → **trigram 表**（中英混合如 `Token消耗` 的 CJK 部分只有 2 字，但整体 ≥3 字符是合法 trigram，直接命中，无需回退）；
  - 纯 ASCII → **unicode61 原表**（行为与上游完全一致）。
- **LIKE 通配符转义**：查询中的 `%` / `_` / `\` 按字面匹配（`ESCAPE '\'`），不会变成通配符。
- **snippet / 排序契约不变**：LIKE 命中后手工标记首个命中位置（`match_count` 按字节差统计**全部**出现次数），走原有 snippet 路径，无额外改动。
- **schema 纪律补强**：fork 自有 `application_id` 的派生库此前不做白名单/版本校验，现与上游库同等对待——新增表名在白名单内、版本不一致就地 reset 重建、外来 application_id 拒开。

实测对照表（文档「索引优化减少Token消耗的句子」）：

| 查询 | unicode61（上游） | trigram | LIKE 回退（本迭代） |
|---|---|---|---|
| `Token消耗`（9 字，中英混合） | 0 | ✅ 命中 | — |
| `索引优化`（4 字） | 0 | ✅ 命中 | — |
| 完整整句 | ✅ 命中（唯一方式） | ✅ 命中 | — |
| `消耗` / `索引`（2 字） | 0 | 0 | ✅ 命中 |
| `优`（1 字） | 0 | 0 | ✅ 命中 |

### 3. 测试与回归

- `dsh-session-query-sqlite-cjk`：**12 单测**全过——trigram 命中、中英混合命中、ASCII 回退、1 字/2 字 LIKE 回退、通配符转义（`完%` 不误中 `完成`）、短查询无命中、会话级检索、**持久化会话**双分支检索、无命中场景；
- 依赖包 `dsh-memory-index`：**8 单测**全过，无回归。

### 4. 上游合并：三处集成点已就绪

如果这个方向适合合入上游（改动收敛在 ~50 行 + 测试），需要同时处理：

1. **`DERIVED_USER_TABLES` 白名单**（`schema.ts`）：新增 trigram 表名必须同步进白名单，否则已有库下次打开会被 `assertDerivedUserTables` 判为 unrecognized 拒开；
2. **`SCHEMA_VERSION` 递增**：加表/换 tokenizer 是不兼容变更，老库靠版本不一致就地 reset 重建（本 fork 已把该机制同样套到自有 `application_id` 的库上）；
3. **查询分支**：复用现有 persisted+live 的 UNION ALL，第三个分支（或按查询路由替换 MATCH 表达式）加 trigram 表即可；`highlight()` / snippet / `match_count` 路径对 trigram 表同样工作。

另注：trigram 的 `case_sensitive` 默认关闭（与 unicode61 的大小写折叠一致），保持默认即可不回归英文/代码检索。

### 5. 生态快照：记忆是 DSH 的验证刚需，而整个生态的地基检索是坏的

- 官方讨论区已有 [「求一个 memory 能力」（#14）](https://github.com/deepseek-ai/deepseek-harness/discussions/14)，社区半年内涌现 **20+ 记忆插件**（含 3 个 100+ 星项目：dsh-memory-evolve 205⭐ / dsh-mnemon 136⭐ / dsh-noema 116⭐）——记忆是 DSH 被反复验证的刚需。
- **关键观察**：多数记忆插件（dsh-memo、dsh-meow-memory、dsh-mnemon 等）都建立在官方 `sessionQuery` 之上——unicode61 的中文缺陷意味着**整个记忆生态的中文召回被同一个地基缺陷拖累**。本 fork 修复的不只是我们自己的插件，而是所有依赖 sessionQuery 的记忆插件共同的地基。
- 自进化方向已有完整先例（[dsh-memory-evolve](https://github.com/csyangwen/dsh-memory-evolve) 的"技能自我进化 + 技能管理器"基本对应 Hermes Agent 的记忆思路）。**本迭代顺势补齐了同一能力**：新增 `dsh-memory-skills`（Phase 3）——模型可调用的 `skill_write/delete/list` 写 DSH 原生技能文件（写入即进会话技能目录），外加**后台反思蒸馏**（定时、水位线 + 冷却 + 启发式门槛，请求路径零开销，fire-and-forget，全部动作记入 `skill_events` 日志；技能文件是纯 Markdown，卸载插件不丢）。
- 至此本仓库的差异化 = **CJK 检索（生态唯一）+ 技能自我进化 + tool-result 去重 + KV-safe 稳定注入 + compaction 来源定位**——自进化不再是别人的专利，但我们的形态小而聚焦（`dsh-memory-skills` ~700 行），与 evolve 的五轨大而全单体互补。
- 完整 20+ 项目对照表（含 **license 自查项**）见仓库 [docs/DSH-MEMORY-ECOSYSTEM.md](https://github.com/QIANLING-0831/dsh-memory-plus/blob/main/docs/DSH-MEMORY-ECOSYSTEM.md)。
- 给官方的推论：**记忆基础设施（检索质量 + 注入接缝）值得官方投入**——生态都在上面；而"非持久化 + KV 友好"注入接缝的缺失，让每个"自动注入"型插件都在翻同一道墙（dsh-layered-memory 的"每步自动注入"即一例）。

### 6. 想请教社区

- 1–2 字中文查询的 LIKE 回退是**线性扫描**（FTS5 的 LIKE 优化要求模式含 ≥3 个非通配字符，短查询用不上），大语料下是性能取舍——社区怎么看这个 v1 形态？
- v2 方向：对 2 字词做 **bigram 索引**（更复杂，但能把短查询也拉回索引路径），是否值得做？
- 上帖问过的小而聚焦 PR（~50 行 + 测试）接受度，希望听到官方或贡献者的明确意见；若 PR 暂不开放，"文档类"贡献（README 补充 unicode61 对中文不可用的已知限制）是否可行？

### 7. 仓库与安装

- 代码：**https://github.com/QIANLING-0831/dsh-memory-plus**（`packages/dsh-session-query-sqlite-cjk` + 新增 `packages/dsh-memory-skills`）
- 上帖 #3671 全文含插件集介绍、真机验证报告与安装路径；本迭代的 README（含对照表）见包内 `README.md`；
- DSH 记忆生态盘点（20+ 项目 + license 自查）见 [`docs/DSH-MEMORY-ECOSYSTEM.md`](https://github.com/QIANLING-0831/dsh-memory-plus/blob/main/docs/DSH-MEMORY-ECOSYSTEM.md)；
- 技能管理器 / 后台自我进化的真机验证步骤见 [`docs/VERIFICATION.md`](https://github.com/QIANLING-0831/dsh-memory-plus/blob/main/docs/VERIFICATION.md)（欢迎按步骤反馈结果）。

欢迎试用、提 issue、评论指正。
