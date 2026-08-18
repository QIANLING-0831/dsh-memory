# 社区插件分享：中文全文检索修复 + 记忆优化（Phase 0/1）

> 发布地址：https://github.com/deepseek-ai/deepseek-harness/discussions （点 New discussion，分类选 **Ideas** 或 **General**）
> 标题与正文如下，可直接复制粘贴。

---

## 标题

**社区插件：修复 session-query 中文检索（unicode61 缺陷）+ 记忆优化插件集（dsh-plugin）**

## 正文

### 1. 缺陷报告：`unicode61` tokenizer 对中文基本不可用

`dsh-session-query-sqlite` 使用 FTS5 `unicode61` tokenizer，对 CJK 文本**不切词**：连续汉字被索引为单个 token，中文全文检索实际不可用。

实测（node:sqlite + FTS5）：

| 场景 | unicode61（上游） | trigram（本插件） |
|---|---|---|
| 文档 `索引优化减少Token消耗的句子`，查询 `Token消耗` | ❌ 0 命中 | ✅ 命中 |
| 查询 `"索引优化"`（整句短语） | ❌ 0 命中（必须完整复现整句） | ✅ 命中 |

### 2. 插件集介绍（均已开源，`dsh-plugin` 话题）

仓库：**https://github.com/QIANLING-0831/dsh-memory**

| 包 | 作用 | 阶段 |
|---|---|---|
| `dsh-session-query-sqlite-cjk` | 中文可用的会话全文检索 provider：双 tokenizer 双表（保留 unicode61 行为 + 新增 trigram 表），查询按是否含 CJK 自动路由；fork 自上游（MIT），仅改 schema/路由/标识符 | Phase 0 |
| `dsh-tool-result-dedup` | 工具结果哈希去重：重复结果（git status / ls / 重复 read）第二次起替换为指针，纯省输入 Token | Phase 0 |
| `dsh-memory-index` | 混合记忆检索服务 `ctx.memorySearch`：sqlite-vec 向量臂 + FTS5 词法臂 → RRF 融合；事件级增量嵌入索引；本地 bge 嵌入（transformers.js） | Phase 1 |
| `dsh-memory-tool` | 模型可调用的 `memory_search` 工具：对会话旧内容做混合召回，输出严格有界（limit × maxChars） | Phase 1 |

设计文档（三层记忆数据库 + 词条索引 + 增量参数）：`docs/MEMORY-OPTIMIZATION-PROPOSAL.md`

### 3. 给官方的反馈：缺少"非持久化 + KV 友好"的请求注入接缝

做自动记忆注入时逐一验证了三条路径，在 v0.1-rc.7 中都不可行，希望官方评估：

1. **`agent/pre-step` messages**：循环 `session.append("user/message", {surfaceOp:"append"})` 会把注入内容变成**持久化历史**，每步重发，Token 反而膨胀；
2. **`llm/stream`**：请求在 `buildRequest` 被 `deepFreeze`，且 waterfall 默认闭包 `() => adapterStream(options, prepared)` 锁死原对象，无法替换/变更；
3. **system-prompt section / `system-prompt/assemble`**：非持久化内容只能进 system prompt（请求最前），每次变化会让 **KV 前缀缓存整段失效**，长会话成本更高。

因此 v0.1 采用"模型主动调用 `memory_search` 工具"形态（Letta 式 recall）。如果官方后续提供"非持久化、请求尾部追加"的注入接缝，自动记忆注入会非常有用。

### 4. 想请教社区

- 上游是否有计划为 session-query 增加 CJK 友好 tokenizer（trigram / 分词）？社区方案若可行，是否考虑合入？
- 对上面的注入接缝建议怎么看？是否有我没发现的扩展点？

### 5. 安装

```sh
# 在 profile 下安装（npm 发布前的 GitHub 方式）
dsh plugin --profile web add "github:QIANLING-0831/dsh-memory#path=packages/dsh-session-query-sqlite-cjk"
dsh plugin --profile web add "github:QIANLING-0831/dsh-memory#path=packages/dsh-tool-result-dedup"
dsh plugin --profile web add "github:QIANLING-0831/dsh-memory#path=packages/dsh-memory-index"
dsh plugin --profile web add "github:QIANLING-0831/dsh-memory#path=packages/dsh-memory-tool"
```

仓库代码含 25 个单测（node --test），欢迎试用、提 issue、PR。
