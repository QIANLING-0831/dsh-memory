# dsh-memory

DeepSeek Harness（DSH）记忆优化的社区插件集合（`dsh-plugin`）。设计依据见 [`docs/MEMORY-OPTIMIZATION-PROPOSAL.md`](docs/MEMORY-OPTIMIZATION-PROPOSAL.md)（三层记忆数据库 + 词条索引 + 两级检索）。

**当前阶段：Phase 0 —— 以索引换 Token 的地基。**

## 包含的插件

| 包 | 作用 | 状态 |
|---|---|---|
| [`dsh-session-query-sqlite-cjk`](packages/dsh-session-query-sqlite-cjk) | 中文可用的会话全文检索 provider（FTS5 trigram 双表，查询自动路由） | ✅ Phase 0 |
| [`dsh-tool-result-dedup`](packages/dsh-tool-result-dedup) | 工具结果内容哈希去重（重复结果替换为指针，省输入 Token） | ✅ Phase 0 |

后续 Phase 1（混合检索 + 按需注入 + `memory/search` 工具）、Phase 2（core 事实库 + 指针式压缩）规划见提案文档。

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
