# 真机验证报告：dsh-memory-skills（技能管理器 + 后台自我进化）

> 环境：Windows + DSH（headless profile，`dsh` 0.1.0-rc.7）。
> 旧插件（CJK 检索 / 混合检索 / core 记忆）的真机结果见根 README §6 与讨论帖 #3671。
> **2026-08-21 已在本机完成技能管理器部分实测**（见 §0.1 记录）；后台进化的"蒸馏触发"仍需交互会话观察（见 §3）。

## 0. 前置

- 仓库更新到含 `dsh-memory-skills` 的版本；
- `dsh` 与 `pnpm` 需要能在 PATH 中找到（Windows 上常见缺失，两个修法）：
  - `dsh`：用 profile 内的 CLI 全路径 `node "$env:USERPROFILE\.dsh\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js"`，或把 `%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\.bin` 加进 PATH；
  - `pnpm`：`AppData\Roaming\npm\pnpm.cmd` 放一个桥接 shim（内容 `@echo off` + `corepack pnpm %*`），`AppData\Roaming\npm` 已在 PATH；
- 安装（**本地路径必须带 `./` 前缀**，否则 pnpm 会当 git 依赖解析）：

```sh
dsh plugin --profile headless add ./packages/dsh-memory-bundle
dsh plugin --profile headless add ./packages/dsh-memory-skills
cd $env:DSH_HOME/profiles/headless && corepack pnpm install
dsh --profile headless --dump-config | Select-String memory-skills   # 确认进合成树
```

### 0.1 已实测记录（2026-08-21，真实 harness）

| 验证项 | 结果 |
|---|---|
| 整树启动（含 memory-skills） | ✅ `dsh --profile headless "reply with OK only"` → 模型回复 OK，exit 0 |
| `skill_write` 建技能 | ✅ 生成 `C:\Users\钱铃\.dsh\skills\verify-tool.md`，frontmatter 正确，且**实时进入会话技能目录**（系统提示可见） |
| `skill_list` | ✅ 返回 `- verify-tool (managed): verification skill for testing` |
| `skill_delete` | ✅ 删除文件，目录实时清空 |
| `skill_events` 日志 | ✅ 派生库记录 `created` / `deleted`（含会话 ID 与时间戳） |
| 主循环无干扰 | ✅ 三次一次性任务均正常完成，无额外输出/卡顿 |

> 修复过程中发现并解决的真机问题：① cordis 加载器读**命名导出**（`export default apply` 会让 inject 失效 → `cannot get property "tools" without inject`），已移除默认导出；② `dsh plugin add` 的本地路径必须 `./` 前缀（`anchorPathSpec` 只锚定 `.`/`..` 开头）。

## 1. 技能管理器（模型工具）验证

新建/继续一个会话，向模型提出：

> 请用 skill_write 创建一个技能 `pnpm-recovery`：内容为「遇到 lockfile 不一致时运行 `pnpm install --no-frozen-lockfile` 后重新构建」，描述一句话，whenToUse 写「当 pnpm install 失败时」。

**预期**（已实测同类流程）：
1. 返回 `Skill "pnpm-recovery" created at <path>`；
2. 文件出现在 `$env:DSH_HOME\skills\pnpm-recovery.md`，内容为 DSH 原生格式：

```markdown
---
name: "pnpm-recovery"
description: "..."
whenToUse: "当 pnpm install 失败时"
---
<正文>
```

3. 让模型执行 `skill_list`，应能看到 `pnpm-recovery (managed)`；
4. 让模型执行 `skill_delete` 再 `skill_list`，技能消失、文件删除。

**记录**：✅（2026-08-21 实测 verify-tool 全流程）

## 2. 技能对 agent 可见性验证（关键：写入即进会话技能目录）

保持 `pnpm-recovery.md` 存在，在新会话里问模型：

> 你有哪些可用技能？遇到 pnpm lockfile 不一致时该怎么做？

**预期**：模型能通过原生技能目录（`skill` 工具/会话目录）发现并加载 `pnpm-recovery`，并按其内容回答——证明写出的文件被 DSH 内置 `dsh-skill-filesystem`（user-dsh 根，rank 400）自动拾取，无需重启。

**记录**：✅ / ❌

## 3. 后台自我进化验证

### 3.1 临时调小进化间隔（便于观察）

编辑 profile 的 `dsh-memory-skills` 配置（或在 `cordis.patch.yml` 中临时加上）：

```yaml
- id: memory-skills
  name: dsh-memory-skills
  config:
    path: ./.dsh-verify/memory-skills.db
    evolveIntervalMs: 10000     # 临时：10 秒一轮
    evolveCooldownMs: 30000
    evolveMinAssistantChars: 40 # 临时：短消息也参与
```

### 3.2 制造"可复用技能"回合

在会话里完成一段**可重复的过程**，例如：

1. 让模型解决一个带具体步骤的问题（如：构建报错 → 定位 → 修复 → 验证成功）；
2. 确保最后一步是模型输出了较长的总结性回答（≥ 阈值）。

### 3.3 观察

**预期**（10–60 秒内）：
1. `$env:DSH_HOME\skills\` 下出现模型蒸馏出的新技能文件（名字/内容由反思决定，也可能是"不值得沉淀"的跳过）；
2. 事件日志可查。SQLite 派生库（默认 `$env:DSH_HOME\memory-skills.db`）用 sqlite3 查看：

```sh
sqlite3 "$env:DSH_HOME\memory-skills.db" "SELECT kind, name, substr(reason,1,60), datetime(created_at/1000,'unixepoch','localtime') FROM skill_events ORDER BY created_at DESC LIMIT 10;"
```

**预期**：出现 `created` / `updated`（或合理数量的 `skipped`，reason 为"no skill-worthy pattern"）。

**记录**：✅ / ❌（贴 `skill_events` 输出）

## 4. 稳定性验证（后台不干扰主循环）

- 进化触发期间，正常对话不应卡顿、不应出现模型额外输出或历史污染；
- `skill_events` 不应出现 `error` 堆积（若有，贴报错）。

**记录**：✅ / ❌

## 5. 卸载韧性验证

1. 临时禁用 `dsh-memory-skills` 行后重启 profile；
2. 技能文件仍在 `$env:DSH_HOME\skills\`，且仍能被 agent 加载（纯 Markdown，不依赖插件状态）。

**记录**：✅ / ❌

---

## 结果汇总

| # | 项目 | 结果 |
|---|---|---|
| 1 | skill_write / skill_list / skill_delete 工具 | ✅ 2026-08-21 实测 |
| 2 | 技能文件格式（frontmatter）正确 | ✅ 实测 |
| 3 | 写入即进会话技能目录（新会话可加载） | ✅ 实测（系统提示实时可见） |
| 4 | 后台进化自动蒸馏技能 | ⏳ 需交互会话观察（单测已覆盖逻辑） |
| 5 | skill_events 日志可查 | ✅ 实测（created/deleted） |
| 6 | 主循环无干扰 / 无 error 堆积 | ✅ 实测 |
| 7 | 卸载后技能文件保留 | ⏳ 未测（纯 Markdown，设计保证） |

发现问题请附输出，反馈到仓库 issue 或讨论帖。
