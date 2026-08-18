# dsh-memory

DeepSeek Harness（DSH）记忆优化的社区插件集合（`dsh-plugin`）。设计依据见 [`docs/MEMORY-OPTIMIZATION-PROPOSAL.md`](docs/MEMORY-OPTIMIZATION-PROPOSAL.md)（三层记忆数据库 + 词条索引 + 两级检索）。

**当前阶段：Phase 0 —— 以索引换 Token 的地基。**

## 包含的插件

| 包 | 作用 | 状态 |
|---|---|---|
| [`dsh-session-query-sqlite-cjk`](packages/dsh-session-query-sqlite-cjk) | 中文可用的会话全文检索 provider（FTS5 trigram 双表，查询自动路由） | ✅ Phase 0 |
| [`dsh-tool-result-dedup`](packages/dsh-tool-result-dedup) | 工具结果内容哈希去重（重复结果替换为指针，省输入 Token） | ✅ Phase 0 |
| [`dsh-memory-index`](packages/dsh-memory-index) | 混合记忆检索服务 `ctx.memorySearch`（sqlite-vec 向量臂 + FTS5 词法臂 RRF 融合，file 词条过滤） | ✅ Phase 1 |
| [`dsh-memory-tool`](packages/dsh-memory-tool) | 模型可调用的 `memory_search` 工具（有界召回旧会话细节，支持 file 过滤） | ✅ Phase 1 |
| [`dsh-compaction-locator`](packages/dsh-compaction-locator) | 近无损压缩：每个 `<compacted-summary>` 追加 Exact Sources 定位符（spill 路径/文件/seq 区间） | ✅ Phase 2 |
| [`dsh-memory-core`](packages/dsh-memory-core) | 跨会话核心记忆（workspace 事实库 + 稳定 KV 安全注入 + `memory_remember` 工具） | ✅ Phase 2 |

自动注入因 DSH 扩展点限制改为模型主动调用（见提案第 9 节）；共 46 个单测。

## 安装（npm 发布后）

```sh
# 在你的 profile 下安装（以 web 为例）
dsh plugin --profile web add dsh-session-query-sqlite-cjk
dsh plugin --profile web add dsh-tool-result-dedup
```

本地开发：本仓库是 pnpm workspace，`corepack pnpm install` 后 `corepack pnpm test`。

## 发布

- GitHub 仓库已加 **`dsh-plugin`** topic（官方 CONTRIBUTING 指引）。
- **自动化发布（Trusted Publishing，推荐）**：仓库带 `.github/workflows/publish.yml`，打 tag 即自动发布两个包（无令牌、无验证码，OIDC 签名）：
  1. 在 npm **Account Settings → Trusted Publishers** 添加发布者：仓库 `QIANLING-0831/dsh-memory`，工作流名 `publish`；
  2. 本地发布一个版本：改 `packages/*/package.json` 的 `version` → commit → `git tag v0.1.0 && git push origin v0.1.0`。
- **手动发布**：`npm login` 后 `npm publish`（账号开 2FA 时需 `--otp=<验证码>`）。
- 每个包独立发布到 npm（`publishConfig.access: public`）。
- DSH 官方仓库当前不接受外部 PR，本仓库以"独立插件生态"方式贡献；CJK 分词缺陷可到 [deepseek-ai/deepseek-harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 报告。

## 测试

```sh
corepack pnpm test
```

## License

MIT。`dsh-session-query-sqlite-cjk` 是 [`@deepseek-ai/dsh-session-query-sqlite`](https://github.com/deepseek-ai/deepseek-harness)（MIT）的 fork，改动清单见其 README。
