# dsh-memory-skills

DSH 的**技能管理器 + 后台自我进化**插件：模型可直接调用的 `skill_write` / `skill_delete` / `skill_list` 工具持久化 **DSH 原生技能文件**（Markdown + YAML frontmatter），同时一个**后台定时反思循环**从已完成的 agent 回合中蒸馏可复用技能——写入即被会话技能目录识别，零核心修改。

## 两个能力

### 1. 技能管理器（模型可调用）

| 工具 | 作用 |
|---|---|
| `skill_write` | 创建/更新技能（kebab-case 名称 + 一句话描述 + 可选 whenToUse + Markdown 正文） |
| `skill_delete` | 删除本插件管理的技能 |
| `skill_list` | 列出可用技能（原生目录 + 本插件管理的，标记 `(managed)`） |

技能文件写入 `skillDir`（默认 `$DSH_HOME/skills`，即 DSH 内置 `dsh-skill-filesystem` 的 **user-dsh 根，rank 400**，目录自带 watcher 自动失效缓存）——所以**写出的技能立刻出现在会话技能目录里**，agent 下一步就能通过原生 `skill` 工具加载。

### 2. 后台自我进化（Hermes 式学习循环）

- 定时（默认 60s）扫描 live 会话，按**每会话水位线**（SQLite `skill_evolve_state`）只处理新回合；
- 启发式门槛 + **冷却期**（默认 60s）+ 窗口（默认最近 12 条事件）控制 LLM 成本；
- 触发时向模型（`ctx.llm.stream`，可用 `evolveProvider`/`evolveModel` 覆盖）发起一次**严格 JSON 契约**的反思："这段回合是否产生了可复用技能？"；
- 命中则原子写入/更新技能文件，全部动作记入 `skill_events` 日志（`engine.log()` 可查）。

设计要点：反思在**请求路径之外**（fire-and-forget 定时器），不打断主循环、不污染会话历史、不动 KV 前缀缓存；技能文件是纯 Markdown，**卸载插件也不丢**。

## 配置

| Key | 默认 | 说明 |
|---|---|---|
| `path` | `$DSH_HOME/memory-skills.db` | 派生库（进化状态 + 事件日志），`:memory:` 支持 |
| `skillDir` | `$DSH_HOME/skills` | 技能文件目录（DSH filesystem provider 的 user-dsh 根） |
| `enabled` | `true` | 总开关（工具 + 进化） |
| `maxSkills` | `50` | 托管技能上限 |
| `evolveEnabled` | `true` | 后台进化开关 |
| `evolveIntervalMs` | `60000` | 轮询间隔 |
| `evolveCooldownMs` | `60000` | 每会话最小进化间隔 |
| `evolveWindowEvents` | `12` | 反思输入窗口（最近 N 条事件） |
| `evolveMinAssistantChars` | `120` | 助手消息短于此长度不触发反思 |
| `evolveProvider` / `evolveModel` | 空 | LLM 覆盖（空=继承会话） |
| `evolveMaxTokens` | `1024` | 反思输出上限 |
| `evolvePrompt` | 内置 | 反思 system prompt（严格 JSON 契约） |

## 安装

```sh
dsh plugin --profile <profile> add packages/dsh-memory-skills
```

或通过 `dsh-memory-bundle` 一键安装（已含本插件）。

## 测试

```sh
node --test test/skills.test.js
```

覆盖：技能文件读写/校验/上限、frontmatter 往返、反思 JSON 解析、后台进化水位线/冷却、工具执行。

## 与生态的关系

- 技能文件格式与 [dsh-skill-filesystem](https://github.com/deepseek-ai/deepseek-harness) 原生兼容（frontmatter：`name` / `description` / `whenToUse`）；
- 与 `dsh-memory-evolve`（205⭐）同赛道但定位互补：evolve 是"五轨记忆 + 技能自进化"大而全的单体；本插件是 dsh-memory-plus 全家桶里**小而聚焦**的技能管理器 + 后台进化，与已有的 CJK 检索 / 去重 / compaction 定位共同构成地基层。
