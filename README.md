# dsh-memory

DeepSeek Harness（DSH）记忆优化的社区插件集（`dsh-plugin`）：中文可用的会话全文检索、工具结果去重、混合记忆检索、跨会话核心记忆、近无损压缩。Phase 0–2 已完成，并在真实 harness（headless profile）中集成验证。

- 设计文档：[`docs/MEMORY-OPTIMIZATION-PROPOSAL.md`](docs/MEMORY-OPTIMIZATION-PROPOSAL.md)（三层记忆数据库 + 词条索引 + 增量参数）
- 真机验证报告：[`docs/VERIFICATION.md`](docs/VERIFICATION.md)
- 47 个单测（`corepack pnpm test`）

## 插件一览

| 包 | 作用 | 阶段 |
|---|---|---|
| [`dsh-session-query-sqlite-cjk`](packages/dsh-session-query-sqlite-cjk) | 中文可用的会话全文检索 provider：FTS5 双 tokenizer 双表（unicode61 + trigram），按查询是否含 CJK 自动路由 | Phase 0 |
| [`dsh-tool-result-dedup`](packages/dsh-tool-result-dedup) | 工具结果哈希去重：重复结果（git status / ls / 重复 read）替换为指针，节省输入 Token | Phase 0 |
| [`dsh-memory-index`](packages/dsh-memory-index) | 混合记忆检索服务 `ctx.memorySearch`：sqlite-vec 向量臂 + FTS5 词法臂 → RRF 融合；事件级增量嵌入；file 词条过滤 | Phase 1 |
| [`dsh-memory-tool`](packages/dsh-memory-tool) | 模型可调用的 `memory_search` 工具：会话旧内容混合召回，输出有界（limit × maxChars） | Phase 1 |
| [`dsh-compaction-locator`](packages/dsh-compaction-locator) | 近无损压缩：每个 `<compacted-summary>` 追加 Exact Sources 定位符（spill 路径 / 文件路径 / seq 区间） | Phase 2 |
| [`dsh-memory-core`](packages/dsh-memory-core) | 跨会话核心记忆：workspace 事实库 + 稳定 system-prompt section 注入（KV 安全）+ `memory_remember` 工具 | Phase 2 |
| [`dsh-memory-bundle`](packages/dsh-memory-bundle) | 元 bundle：一键安装以上全部插件，自动禁用 base 的 session-query / compaction 行 | 集成 |

## 安装

> 当前尚未发布到 npm，请从本仓库安装（需要 pnpm 在 PATH；Windows 无管理员权限时可用 `corepack` 提供的 shim）。

```sh
# 克隆后，将 bundle 装入目标 profile（示例：headless）
dsh plugin --profile headless add packages/dsh-memory-bundle

# 若 bundle 的 link 依赖未自动安装：
cd $env:DSH_HOME/profiles/headless && pnpm install
```

`dsh-memory-bundle` 会启用全部 6 个插件；各插件的默认配置见 [`packages/dsh-memory-bundle/cordis.patch.yml`](packages/dsh-memory-bundle/cordis.patch.yml)（派生库路径为相对路径，生产部署建议改为绝对路径）。

## 使用

模型获得两个记忆工具：

- `memory_search(query, limit, max_chars, file?)`：对本会话旧内容做混合（词法 + 语义）召回，snippet 严格有界；
- `memory_remember(content, topic?)`：写入跨会话持久事实，自动出现在该 workspace 后续请求的系统提示顶部（`## Persistent Memory` 区块）。

`<compacted-summary>` 压缩块自带定位符，模型可用 `read <spill file>` 或 `memory_search` 恢复精确内容。

## 测试

```sh
corepack pnpm install
corepack pnpm test
```

## 发布状态

- **尚未发布到 npm**。仓库内的 `.github/workflows/publish.yml`（tag 触发 + OIDC Trusted Publishing，无长期令牌）已就绪，但需先在 npm 侧为各包配置 Trusted Publisher 后才能生效；在此之前请以 Git 方式安装。
- deepseek-ai/deepseek-harness 官方仓库暂不接受外部 PR，本仓库以独立插件生态方式贡献；上游 `unicode61` tokenizer 的中文检索缺陷可在官方 Discussions 反馈。

## License

MIT。`dsh-session-query-sqlite-cjk` 为 `@deepseek-ai/dsh-session-query-sqlite`（MIT）的 fork。
