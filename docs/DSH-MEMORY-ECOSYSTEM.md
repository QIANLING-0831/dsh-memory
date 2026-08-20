# DSH 记忆插件生态快照（2026-08 实测盘点）

> 数据来源：GitHub API（stars/license 为查询当日值）+ npm 检索。供 `dsh-memory-plus` 定位、借鉴与 license 合规自查使用。

## 1. 全景对照表（按 Stars 排序）

| # | 项目 | Stars | License | 形态 | 定位 / 核心能力 | 与 dsh-memory-plus 重叠 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | [csyangwen/dsh-memory-evolve](https://github.com/csyangwen/dsh-memory-evolve) | 205 | MIT | GitHub | 跨会话长期记忆 + **后台自我进化**：五轨记忆 · git 分支感知 · 回合内自我审查 · **技能自我进化 + 技能管理器** · 四轨待办 · COI 调度 · 会话广播/搜索 · 提示词管理器 | core + recall + 自进化 | **Hermes 思路最完整对标**；零核心修改、零运行时依赖，活跃维护 |
| 2 | [omdsh-dev/dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) | 136 | MIT | GitHub + npm | 三层记忆控制平面：persistent runtime context、可搜索项目文档、可插拔长期记忆、智能路由、监督式 agent 工作流、WebUI + headless tools | core + 项目记忆 + recall | 记忆类目前星数第二，工程化程度高 |
| 3 | [ZSeven-W/dsh-noema](https://github.com/ZSeven-W/dsh-noema) | 116 | MIT | GitHub | durable、可检视的 agent 长期记忆 + recall 工具 + 设置页 | recall + 可审计 | 强调 inspectable（可检视性） |
| 4 | [Phant0Meow/dsh-meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) | 27 | MIT | GitHub + npm(`meow-memory`) | 七层 SQLite 跨会话记忆（有 B 站教程） | 分层记忆 + recall | 中文社区传播较好 |
| 5 | [FuRongJun-1999/dsh-memory](https://github.com/FuRongJun-1999/dsh-memory) | 23 | MIT | GitHub | AGI 长期记忆基础设施：跨会话记忆 · **持续学习** · 可审计信任 | core + 学习 | 概念化程度高 |
| 6 | [Aik358/dsh-auto-memory](https://github.com/Aik358/dsh-auto-memory) | 21 | BSD-3-Clause | GitHub | 三层**自动记忆**，proactive（主动型） | 自动蒸馏 + 注入 | 许可与主流 MIT 不同，注意 |
| 7 | [Qinling-Melon-Farmers/dsh-memoir](https://github.com/Qinling-Melon-Farmers/dsh-memoir) | 17 | Apache-2.0 | GitHub | 会话归纳 + 经验教训沉淀 → 写 `PROJECT_MEMORY.md` + 全局索引 | 项目级记忆 | Apache-2.0，借鉴需兼容自查 |
| 8 | [seriousz158/dsh-memory](https://github.com/seriousz158/dsh-memory) | 11 | MIT | GitHub | 记忆插件（跨会话） | core + recall | — |
| 9 | [detongz/dsh-client-ui-obsidian-memory](https://github.com/detongz/dsh-client-ui-obsidian-memory) | 9 | MIT | GitHub | Obsidian 记忆（DSH 记忆与 Obsidian 双向） | 外部存储桥接 | 形态不同 |
| 10 | [zhujunpeng12/dsh-memory-system](https://github.com/zhujunpeng12/dsh-memory-system) | 8 | MIT | GitHub | 本地优先持久记忆基础设施（hot/cold 分层） | 分层记忆 | — |
| 11 | [Classicoke/cleverer-dsh](https://github.com/Classicoke/cleverer-dsh) | 7 | MIT | GitHub | **11 插件 + 6 skills** 执行纪律套件（验证循环），零依赖、426 测试 | 非记忆为主 | 工程质量标杆 |
| 12 | [ccch713/deepddw](https://github.com/ccch713/deepddw) | 6 | MIT | GitHub | DSH for Teams：记忆 + 知识库 + 局域网部署 | 团队记忆 | 形态不同 |
| 13 | [Scorp1o117/dsh-tdai-memory](https://github.com/Scorp1o117/dsh-tdai-memory) | 6 | MIT | GitHub + npm(`dsh-tdai-memory`) | 记忆插件 | core + recall | — |
| 14 | [nanpaidashi/dsh-honcho-sync](https://github.com/nanpaidashi/dsh-honcho-sync) | 6 | MIT | GitHub + npm(`@nanpaidashi/dsh-honcho-sync`) | 会话自动同步到 **Honcho** 记忆服务 | 存储层换后端 | 你点名系统的 DSH 对接件 |
| 15 | [Culeot/dsh-agent-memory](https://github.com/Culeot/dsh-agent-memory) | 5 | MIT | GitHub | 跨会话长期记忆 | core + recall | — |
| 16 | [wangyihao0001-oss/dsh-task-memory](https://github.com/wangyihao0001-oss/dsh-task-memory) | 5 | MIT | GitHub | **任务隔离**记忆（remember/recall/search 限定任务边界） | 分层边界 | 与你的 core 分层思路互补 |
| 17 | [lesliechowsh/dsh-memo](https://github.com/lesliechowsh/dsh-memo) | 5 | MIT | GitHub | `memo_search/remember/stats`，**基于官方 sessionQuery** | 你的 memory-tool 直接同类 | **依赖 sessionQuery = 受 unicode61 缺陷影响** |
| 18 | [Zephyr-vibe/dsh-personalize](https://github.com/Zephyr-vibe/dsh-personalize) | 5 | MIT | GitHub | per-host 个性化：自定义指令 + 本地长期记忆 | 用户画像记忆 | — |
| 19 | [Quophic/dsh-persona-memory](https://github.com/Quophic/dsh-persona-memory) | 4 | **NOASSERTION** | GitHub | 人设记忆 | 用户画像记忆 | ⚠️ **许可不明，借代码需谨慎** |
| 20 | [JunNanLYS/dsh-layered-memory](https://github.com/JunNanLYS/dsh-layered-memory) | 3 | MIT | GitHub | 对话**自动蒸馏**为事实/场景/画像三层 + **每步自动召回注入** | 自动蒸馏 + 注入 | 每步注入易变内容——**踩了 KV 前缀缓存失效的坑**（见 REPLY-3668） |
| 21 | [chenhw7/dsh-memory](https://github.com/chenhw7/dsh-memory) | 1 | MIT | GitHub + npm(`@chenhw7/dsh-memory`) | 记忆插件 | core + recall | — |
| 22 | [diqierjia/StrataGate-AgentMemory](https://github.com/diqierjia/StrataGate-AgentMemory) | 1 | MIT | GitHub | Event/Element 卡片 + **证据门控召回** + 来源追踪 | 与你的 compaction locator 思路接近 | — |
| 23 | [says693/dsh-log-memory](https://github.com/says693/dsh-log-memory) | 4 | MIT | GitHub | 定时提醒保存聊天记录（作者自述娱乐向） | 非记忆检索 | — |
| — | **QIANLING-0831/dsh-memory-plus**（本项目） | 2 | **根目录无 LICENSE** ⚠️ | GitHub | 全家桶：CJK 检索修复 + tool 去重 + 混合检索(RRF) + compaction 定位 + core 稳定注入 | — | **CJK 检索（生态唯一）、tool-result-dedup、KV-safe 注入** 为差异化 |

### npm-only（GitHub 仓库未定位，许可/来源待自查）

`dsh-anchor`、`dsh-engram`（心理学/神经科学"条件记忆"学习插件）、`agentmemory-dsh`、`dsh-memory-pyramid`、`@kiwifruit/dsh-memory`、`@jhp830901/dsh-memoria` —— 均可在 npm 搜索到；本次盘点环境无法访问 npm registry，**license 需到各自发布页核实**后再决定是否借鉴。

### 商业 / 托管

- **TencentDB Agent Memory**（腾讯云托管服务，[已有 DSH 接入帖](https://www.cnblogs.com/utest2025/p/22551002)）——云端对标，非开源。

## 2. Hermes 四层记忆思路迁移到 DSH：已有对标盘点

| Hermes Agent 记忆层 | DSH 生态现状 | 结论 |
|---|---|---|
| 短期上下文 | DSH 原生 context 管理 | 无需插件 |
| 长期向量记忆（历史混合检索） | meow-memory（七层）、dsh-mnemon、dsh-noema、dsh-memo、dsh-memory-plus(memory-index) 等 10+ 家 | 🔴 红海 |
| 用户记忆**自动蒸馏**（facts/preferences） | dsh-layered-memory（事实/场景/画像）、dsh-auto-memory、FuRongJun、dsh-engram | 🔴 已有对标 |
| **Skills 自进化 / 学习循环**（记忆→自写技能） | **dsh-memory-evolve（205⭐）**：技能自我进化 + 技能管理器 + 回合内自我审查 + COI 调度；FuRongJun（持续学习）、dsh-engram（条件记忆） | 🔴 **已有直接对标**（此前判断"蓝海"已过时，以本文档为准） |

**结论修正**：Hermes 式"自进化 Skills"迁到 DSH **不是空白**——`dsh-memory-evolve` 已实现得相当完整。`dsh-memory-plus` 的差异化不在自进化，而在**地基层**：

1. **CJK 检索修复**——20+ 记忆插件几乎都依赖官方 `sessionQuery`，而 unicode61 的中文缺陷拖累**整个生态**的中文召回；修好地基（trigram + LIKE 回退）是所有记忆插件的共同增益，目前只有本仓库在做；
2. **tool-result-dedup**——纯省 Token 的方向少人做；
3. **KV-safe 稳定注入**——基于源码级验证（deepFreeze / KV 前缀缓存 / 持久化路径）的注入纪律，是多数"每步自动注入"插件会踩的坑（dsh-layered-memory 即一例）；
4. **compaction 定位符**——近无损压缩 + 来源追踪，与 StrataGate 思路接近但实现独立。

## 3. License 合规自查项

1. **本项目**：包内 `package.json` 声明 MIT，但**仓库根目录缺 LICENSE 文件**（GitHub API `license: null`）——建议补 `LICENSE`（MIT，版权 QIANLING-0831），否则他人引用时许可声明不完整；
2. **Quophic/dsh-persona-memory**：`NOASSERTION`——许可不明，禁止直接抄代码；
3. **npm-only 六包**（dsh-anchor / dsh-engram / agentmemory-dsh / dsh-memory-pyramid / @kiwifruit/dsh-memory / @jhp830901/dsh-memoria）：未核实，发布页自查；
4. 其余全部 MIT（个别 BSD-3-Clause / Apache-2.0）——与本项目 MIT 均兼容；**引用代码须保留原作者版权声明**（MIT 义务）；
5. 上游 `@deepseek-ai/dsh-session-query-sqlite`（MIT）fork 关系见 `packages/dsh-session-query-sqlite-cjk/README.md`。

## 4. 一句话定位

> dsh-memory-plus 不是"又一个记忆插件"，而是**唯一在修记忆地基（CJK 检索）+ 唯一做 Token 去重 + 唯一有 KV-safe 注入论证**的全家桶；自进化 Skills 的生态位已被 dsh-memory-evolve（205⭐）占据，不必正面竞争。
