# dsh-memory-core

DSH 跨会话核心记忆（`ctx.memoryCore`）：**workspace 级持久事实**（用户偏好 / 项目约定 / 环境事实 / 决策），通过**稳定的 system-prompt section** 注入每次请求——内容只在事实变化时改变，**KV 前缀缓存不受影响**（这是 Phase 1 接缝分析后唯一 KV 安全的注入形态）。

## 能力

- **`memory_remember` 工具**：模型显式写入事实（Mem0 式 ADD），内容哈希去重 + 字符重叠相似度合并（相似事实更新而非重复）；
- **稳定注入**：`## Persistent Memory (workspace: <cwd>)` 块随 agent 的 session cwd 自动归属 workspace，每次请求都可见（头块，约 0.5–1.5K token）；
- **跨会话**：同一 workspace 的新会话冷启动即有记忆；
- **有界**：`maxFacts` 上限（默认 50），按更新时间倒序。

## 安装

```sh
dsh plugin --profile web add dsh-memory-core
```

```yaml
plugins:
  - name: dsh-memory-core
    config:
      path: ~/.dsh/memory-core.db   # 专用派生库
      similarityThreshold: 0.9      # 相似合并阈值
      maxFacts: 50                  # 注入块事实上限
      sectionOrder: 50              # system prompt 内位置
```

## 模型视角

```
memory_remember(content: "用户偏好中文回复", topic: "preference")
→ "已记住 (uuid)。"

## Persistent Memory (workspace: C:\proj)
- [preference] 用户偏好中文回复
- [convention] 使用 pnpm 管理依赖
```

## 范围说明

- 自动从对话提取事实**刻意延后**（LLM 成本 + 噪声风险）：v0.1 只做显式写入；
- 与 `dsh-memory-tool`（会话内召回）互补：**core = 常驻稳定事实，memory_search = 按需精确召回**（Letta 的 core/recall 分层）。

## 测试

```sh
node --test test/memory-core.test.js
```
