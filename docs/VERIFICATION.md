# 真机验证报告：dsh-memory-skills（技能管理器 + 后台自我进化）

> 环境：Windows + DSH（headless profile）。旧插件（CJK 检索 / 混合检索 / core 记忆）的真机结果见根 README §6 与讨论帖 #3671。
> 本报告针对 Phase 3 新增的 `dsh-memory-skills`，按步骤执行并记录结果。

## 0. 前置

- 仓库已更新到含 `dsh-memory-skills` 的版本（`git pull`）；
- 重新安装 bundle（新增了依赖，必须重装 + `pnpm install`）：

```sh
dsh plugin --profile headless add packages/dsh-memory-bundle
cd $env:DSH_HOME/profiles/headless && pnpm install
```

- 确认插件已加载（启动日志无 `memory-skills` 相关报错）。

## 1. 技能管理器（模型工具）验证

新建/继续一个会话，向模型提出：

> 请用 skill_write 创建一个技能 `pnpm-recovery`：内容为「遇到 lockfile 不一致时运行 `pnpm install --no-frozen-lockfile` 后重新构建」，描述一句话，whenToUse 写「当 pnpm install 失败时」。

**预期**：
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

**记录**：✅ / ❌（截图或贴输出）

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
| 1 | skill_write / skill_list / skill_delete 工具 | ☐ |
| 2 | 技能文件格式（frontmatter）正确 | ☐ |
| 3 | 写入即进会话技能目录（新会话可加载） | ☐ |
| 4 | 后台进化自动蒸馏技能 | ☐ |
| 5 | skill_events 日志可查 | ☐ |
| 6 | 主循环无干扰 / 无 error 堆积 | ☐ |
| 7 | 卸载后技能文件保留 | ☐ |

发现问题请附输出，反馈到仓库 issue 或讨论帖。
