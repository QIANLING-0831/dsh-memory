# dsh-tool-result-dedup

工具结果去重策略插件：`tools/post-execute` 结果转换器，把**字节相同**的重复纯文本工具结果（重复 `git status`、`ls`、未变文件的 `read`、重复配置 dump……）替换成一行指针，减少长会话的输入 Token。

## 行为

1. 结果通过 `next()` 后，若为 `accept` 纯文本决策且非嵌套调用（`exec.parent` 为空）且不是 value 替换，进入判重；
2. 按 `normalize` 模式规范化文本（默认 `trim-eol`：去每行行尾空白 + 整段首尾空白，容忍 `git status` 的空白噪声）→ SHA-256；
3. 首次出现：记录 `{ toolName, callId, count }`，原文照常；
4. 再次出现（哈希命中）：替换为

   ```text
   (Identical to the earlier <tool> result (call <callId>) — omitted to save tokens. Re-run the tool if you need the full text again.)
   ```

**安全保证**：任何失败（非文本、超尺寸、异常）都原样返回决策，绝不把成功的工具调用变成 `isError` 或隐藏模型明确要的内容；`block` 决策和 value 替换原样透传。原文永远可恢复（重跑工具即可）。

## 配置

| Key | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | `false` 时插件完全空转 |
| `maxCacheBytes` | `65536` | 超过该字节数的结果跳过（大结果归 spill 管） |
| `normalize` | `trim-eol` | `trim-eol`（容忍空白噪声）/ `exact`（逐字节判重） |

```yaml
# cordis.patch.yml
plugins:
  - name: dsh-tool-result-dedup
    config:
      maxCacheBytes: 131072
      normalize: trim-eol
```

## 与 spill-policy 的配合

**在 `dsh-spill-policy` 之前注册本插件**：重复的中小结果在这里被指针化，不会再触发 spill；两个插件都以 `{ prepend: true }` 挂 `tools/post-execute`，按注册顺序执行。建议顺序：`tool-result-dedup` → `spill-policy` → `compaction-tool-result-pruner`。

## 当前范围（Phase 0 MVP）

去重表是**进程级内存 Map**（重启即失）：零依赖、零持久化、无单 owner 派生库负担。Phase 1 计划将其落到 spill-backed 持久化存储（见根目录提案文档），届时跨会话去重与"按 seq 指针化"即可实现。

## 测试

```sh
node --test test/dedup.test.js
```

核心逻辑以纯函数 `createDedupPolicy(config)` 导出，测试无需 Cordis 上下文。
