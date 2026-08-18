# 真机集成验证报告（2026-08）

验证环境：`dsh --profile headless`（独立测试 profile，未触碰运行的 web profile），DSH v0.1-rc.7，deepseek-v4-flash。bundle 经 `dsh plugin --profile headless add` 安装，6 个插件包以 link 方式挂载（本地改动即时生效）。

## 验证结论

| 项目 | 结果 |
|---|---|
| 整树启动（6 插件 + 禁用 base 行） | ✅ |
| `memory_remember` 工具（事实写入） | ✅ 返回「已记住 (uuid)」 |
| `memory_search` 工具（混合召回） | ✅ 中文查询命中 3 条真实会话记录 |
| CJK provider（session-query-cjk.db 生效） | ✅ |
| **跨会话持久化**（新会话系统提示注入 Persistent Memory） | ✅ 逐字可见 |
| compaction-locator / dedup（需长会话/重复结果触发） | ⏳ 未专项验证（机制单测已覆盖） |

## 跨会话持久化实测输出（新会话，逐字）

```
## Persistent Memory (workspace: C:\Users\钱铃\Desktop\ai\DSH\plus)
- [preference] 用户偏好中文回复
```

该事实在**上一个会话**由 `memory_remember` 写入，本会话启动后即出现在系统提示顶部——core 记忆跨会话生效，且区块内容稳定（KV 前缀缓存不受影响）。

## 集成过程中发现并修复的 3 个真实问题（单测覆盖不到的）

1. **Service 注册模式**：cordis `Service` 构造器签名是 `(ctx, name)`——把 config 当 name 传会注册成 `[object Object]` 并冲突。正确写法：`super(ctx, "memorySearch")` + `ctx.plugin(EngineClass, config)`（loader 对类插件实例化，apply 是死代码）。
2. **工具注册时机**：类插件的构造器里 `ctx.tools` 尚未解析——工具必须在 `apply()`（函数插件入口）注册。因此 memory-core 改为**无默认导出的函数插件**：apply 里 `ctx.plugin()` 注册服务 + `ctx.tools.register()` 注册工具。
3. **同步渲染要求**：system-prompt section 的 `text` 是**同步**调用——DB 懒打开会导致新进程里区块为空。派生库改为**构造器同步打开**（DatabaseSync 本就是同步的）。

## 复现步骤

```sh
# 1. 装 bundle（pnpm 需在 PATH，或用 corepack）
dsh plugin --profile headless add packages/dsh-memory-bundle
# 2. 若有 link 依赖未装：在 profile 目录 pnpm install

# 3. 写事实
dsh --profile headless "调用 memory_remember 记住：'用户偏好中文回复'，主题 preference"

# 4. 跨会话验证（新进程）
dsh --profile headless "报告你的 ## Persistent Memory 区块内容"
```

## 实测成本

两个 headless 任务共约 **40 万 token**（≈ ¥1-2），另加集成调试轮次。符合"验证成本 ¥15-50"的预估下限（调试比预想顺利，只踩了 3 个确定性坑而非来回摸索）。

## 遗留

- compaction-locator 与 dedup 的真机触发验证（需要长会话 + 重复工具结果）留待真实使用中观察；
- transformers 真嵌入（bge）未验证——当前用 char-overlap 评估嵌入；生产切换需装 `@huggingface/transformers` 并下载模型。
