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

- 每个包独立发布到 npm（`publishConfig.access: public`）。
- GitHub 仓库请添加 **`dsh-plugin`** topic，便于社区发现（官方 CONTRIBUTING 指引）。
- DSH 官方仓库当前不接受外部 PR，本仓库以"独立插件生态"方式贡献；CJK 分词缺陷可到 [deepseek-ai/deepseek-harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 报告。

## 测试

```sh
corepack pnpm test
```

## License

MIT。`dsh-session-query-sqlite-cjk` 是 [`@deepseek-ai/dsh-session-query-sqlite`](https://github.com/deepseek-ai/deepseek-harness)（MIT）的 fork，改动清单见其 README。
