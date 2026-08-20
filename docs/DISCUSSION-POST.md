# 社区插件分享：中文全文检索修复 + 记忆优化（Phase 0/1/2 已真机验证）

> 发布地址：https://github.com/deepseek-ai/deepseek-harness/discussions （点 New discussion，分类选 **Ideas** 或 **General**）
> 标题与正文如下，可直接复制粘贴。

---

## 标题

**社区插件：修复 session-query 中文检索（unicode61 缺陷）+ 记忆优化插件集（Phase 0/1/2，已真机验证）**

## 正文

### 1. 缺陷报告：`unicode61` tokenizer 对中文基本不可用

`dsh-session-query-sqlite` 使用 FTS5 `unicode61` tokenizer，对 CJK 文本**不切词**：连续汉字被索引为单个 token，中文全文检索实际不可用。

实测（node:sqlite + FTS5）：

| 场景 | unicode61（上游） | trigram（本插件） |
|---|---|---|
| 文档 `索引优化减少Token消耗的句子`，查询 `Token消耗` | ❌ 0 命中 | ✅ 命中 |
| 查询 `"索引优化"`（整句短语） | ❌ 0 命中（必须完整复现整句） | ✅ 命中 |

### 2. 插件集介绍（均已开源，`dsh-plugin` 话题，47 个单测）

仓库：**https://github.com/QIANLING-0831/dsh-memory**

| 包 | 作用 | 阶段 |
|---|---|---|
| `dsh-session-query-sqlite-cjk` | 中文可用的会话全文检索 provider：双 tokenizer 双表（保留 unicode61 + 新增 trigram），按查询是否含 CJK 自动路由；fork 自上游（MIT） | Phase 0 |
| `dsh-tool-result-dedup` | 工具结果哈希去重：重复结果（git status / ls / 重复 read）第二次起替换为指针，纯省输入 Token | Phase 0 |
| `dsh-memory-index` | 混合记忆检索服务 `ctx.memorySearch`：sqlite-vec 向量臂 + FTS5 词法臂 → RRF 融合；事件级增量嵌入；file 词条标签 + 过滤 | Phase 1 |
| `dsh-memory-tool` | 模型可调用的 `memory_search` 工具：会话旧内容混合召回，输出严格有界（limit × maxChars） | Phase 1 |
| `dsh-compaction-locator` | 近无损压缩：继承 `BasicCompactionEngine` 的 `summarize()` 钩子，每个 `<compacted-summary>` 追加 Exact Sources 定位符（spill 路径/文件/seq 区间） | Phase 2 |
| `dsh-memory-core` | 跨会话核心记忆：workspace 事实库 + 稳定 system-prompt section 注入（KV 安全）+ `memory_remember` 工具 | Phase 2 |
| `dsh-memory-bundle` | 元 bundle：一键安装全部插件（`dsh.bundle.patch`），自动禁用 base 的 session-query/compaction 行 | 集成 |

设计文档：`docs/MEMORY-OPTIMIZATION-PROPOSAL.md`（三层记忆数据库 + 词条索引 + 增量参数）

### 3. ✅ 真机验证结果（`dsh --profile headless`，独立测试 profile）

- **整树启动**：6 插件 + 禁用 base 冲突行，无启动错误；
- **`memory_remember` 写入**：返回「已记住 (uuid)」；
- **`memory_search` 混合召回**：中文查询命中 3 条真实会话记录（CJK provider + RRF 生效）；
- **跨会话持久化**：新会话系统提示逐字包含：

  ```
  ## Persistent Memory (workspace: C:\Users\钱铃\Desktop\ai\DSH\plus)
  - [preference] 用户偏好中文回复
  ```

完整报告与复现步骤：`docs/VERIFICATION.md`

### 4. 验证中发现并修复的 3 个集成问题（单测覆盖不到，供官方参考）

1. **Service 注册模式**：cordis `Service` 构造器签名是 `(ctx, name)`——把 config 当 name 传会注册成 `[object Object]` 并冲突；正确写法 `super(ctx, "name")` + `ctx.plugin(Class, config)`；
2. **工具注册时机**：类插件的构造器里 `ctx.tools` 尚未解析——需用函数插件入口（apply）注册工具；
3. **同步渲染要求**：system-prompt section 的 `text` 是同步调用——派生库需构造器同步打开，否则新进程区块为空。

### 5. 给官方的反馈：缺少"非持久化 + KV 友好"的请求注入接缝

做自动记忆注入时逐一验证了三条路径，在 v0.1-rc.7 中都不可行：

1. **`agent/pre-step` messages**：会被 `session.append("user/message", {surfaceOp:"append"})` 变成**持久化历史**，每步重发，Token 反膨胀；
2. **`llm/stream`**：请求在 `buildRequest` 被 `deepFreeze`，且 waterfall 默认闭包锁死原对象，无法替换/变更；
3. **system-prompt section**：非持久化内容只能进 system prompt（请求最前），**每次变化会让 KV 前缀缓存整段失效**。

因此 v0.1 采用"模型主动调用 `memory_search` 工具 + 稳定的 core 记忆 section"形态（Letta 式分层）。如果官方后续提供"非持久化、请求尾部追加"的注入接缝，自动 recall 注入会非常有用。

### 6. 想请教社区

- 上游是否有计划为 session-query 增加 CJK 友好 tokenizer（trigram / 分词）？社区方案若可行，是否考虑合入？
- 对上面的注入接缝建议怎么看？是否有我没发现的扩展点？
- **关于贡献**：我们在 Contributors 榜单上看到外部开发者也能合入（如 shigma 的 docs 提交、FSYo 的 refactor 提交）。像 `unicode61` 中文检索修复这类**小而聚焦的修复**（改动 ~30 行 + 测试），是否接受外部 PR？如果目前仍不开放，是否接受"文档类"贡献（例如在上游 README 补充 unicode61 对中文不可用的已知限制说明）？

### 7. 安装（真机验证过的路径）

```sh
# 把 pnpm 放到 PATH（Windows 无管理员权限时可用 corepack shim）
dsh plugin --profile headless add packages/dsh-memory-bundle
# link 依赖未自动装时：cd $env:DSH_HOME/profiles/headless && pnpm install
```

仓库代码含 47 个单测（node --test），欢迎试用、提 issue、PR。
