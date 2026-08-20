# DSH 记忆插件生态盘点（2026）：20+ 项目、license 自查与差异化打法

<!-- ===== CSDN 发布信息 ===== -->
> 🖼️ **封面图**（建议 1200×600）：主标题「DSH 记忆生态 20+」+ 副标题「别做第 16 个记忆插件」，地图/星球/散点布局 + 高对比色。CSDN「上传封面」处设置；如需正文内嵌，替换下方占位：
> `![封面占位](上传封面后替换此路径)`
> 🏷️ **标签**：#开源生态 #DeepSeek-Harness #记忆插件 #License #Agent
> 🔍 **关键词**：DSH 记忆插件生态, 开源 Agent memory, license 自查, 差异化定位, DeepSeek Harness
<!-- ============================ -->

> 摘要：DeepSeek Harness（DSH）记忆插件的开源生态半年内爆发到 20+，已出现三个 100+ 星项目（dsh-memory-evolve 205★ / dsh-mnemon 136★ / dsh-noema 116★）。本文基于 GitHub API 实测数据做一张生态全景表（含 license 自查），拆解"为什么不要做第 16 个记忆插件"，并给出差异化定位与 Hermes 四层记忆的生态映射。

---

## 1. 先给结论：这个赛道"多但不拥挤"

- **多**：20+ 个记忆插件，功能高度重叠（都是"存旧内容 + 检索 + 注入"）；
- **不拥挤**：绝大多数是**单点功能插件**，且几乎都建立在官方 `sessionQuery` 之上——而官方 unicode61 的中文缺陷意味着**整个生态的中文召回被同一个地基 bug 拖累**。修好地基 = 所有插件共同受益。

## 2. 生态全景表（GitHub API 实测，stars/license 为查询当日值）

| 项目 | Stars | License | 一句话 |
|---|---|---|---|
| [csyangwen/dsh-memory-evolve](https://github.com/csyangwen/dsh-memory-evolve) | 205 | MIT | Hermes 式自进化：技能自我进化 + 五轨记忆 + COI 调度 |
| [omdsh-dev/dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) | 136 | MIT | 三层记忆控制平面 + WebUI（工程化标杆） |
| [ZSeven-W/dsh-noema](https://github.com/ZSeven-W/dsh-noema) | 116 | MIT | durable 可检视记忆 + recall 工具 |
| [Phant0Meow/dsh-meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) | 27 | MIT | 七层 SQLite 跨会话记忆（有 B 站教程） |
| [FuRongJun-1999/dsh-memory](https://github.com/FuRongJun-1999/dsh-memory) | 23 | MIT | 持续学习 + 可审计信任 |
| [Aik358/dsh-auto-memory](https://github.com/Aik358/dsh-auto-memory) | 21 | BSD-3-Clause | 三层自动记忆，proactive |
| [Qinling-Melon-Farmers/dsh-memoir](https://github.com/Qinling-Melon-Farmers/dsh-memoir) | 17 | Apache-2.0 | 会话归纳 → `PROJECT_MEMORY.md` |
| [Classicoke/cleverer-dsh](https://github.com/Classicoke/cleverer-dsh) | 7 | MIT | 11 插件 + 6 skills 执行纪律 |
| [nanpaidashi/dsh-honcho-sync](https://github.com/nanpaidashi/dsh-honcho-sync) | 6 | MIT | 会话同步到 **Honcho** |
| [lesliechowsh/dsh-memo](https://github.com/lesliechowsh/dsh-memo) | 5 | MIT | sessionQuery 上的 memo_search |
| [wangyihao0001-oss/dsh-task-memory](https://github.com/wangyihao0001-oss/dsh-task-memory) | 5 | MIT | 任务隔离记忆 |
| [JunNanLYS/dsh-layered-memory](https://github.com/JunNanLYS/dsh-layered-memory) | 3 | MIT | 对话自动蒸馏事实/场景/画像 + 每步注入 |
| [diqierjia/StrataGate-AgentMemory](https://github.com/diqierjia/StrataGate-AgentMemory) | 1 | MIT | Event/Element 卡片 + 证据门控召回 |
| [Quophic/dsh-persona-memory](https://github.com/Quophic/dsh-persona-memory) | 4 | **NOASSERTION** | 人设记忆（⚠️ 许可不明） |
| … | … | … | npm-only 若干（dsh-anchor / dsh-engram / agentmemory-dsh 等） |

> 另有商业/托管对标：腾讯云 **TencentDB Agent Memory** 已接入 DSH。

## 3. Hermes 四层记忆 → DSH 生态映射

| Hermes Agent 记忆层 | DSH 生态现状 |
|---|---|
| 短期上下文 | DSH 原生，无需插件 |
| 长期向量记忆（历史混合检索） | 🔴 红海（10+ 家） |
| 用户记忆自动蒸馏（facts/preferences） | 🔴 layered-memory / auto-memory / FuRongJun / engram |
| **Skills 自进化 / 学习循环** | 🔴 evolve（205★）已完整实现；小体积替代见 dsh-memory-skills |

结论：Hermes 式"自进化 Skills"迁移到 DSH **不是空白**。想在这个方向做出差异，别做重复的自进化大而全，去修别人没修的**地基**。

## 4. License 自查项（写插件/抄代码前必看）

1. **自己仓库**：根目录必须有 `LICENSE`（很多插件包内声明 MIT 但根缺失，GitHub 会标 `license: null`）；
2. **Quophic/dsh-persona-memory**：`NOASSERTION`——许可不明，禁止直接抄代码；
3. **npm-only 包**（dsh-anchor / dsh-engram / agentmemory-dsh / dsh-memory-pyramid / @kiwifruit/dsh-memory / @jhp830901/dsh-memoria）：发布页自查；
4. 其余多为 MIT（个别 BSD-3 / Apache-2.0）——与 MIT 兼容，但**引用代码须保留原作者版权声明**。

## 5. 差异化打法：做"地基"不做"第 16 个"

与其再做一个"跨会话记忆 + 混合检索"的重复品，不如做别人都依赖但没人修的一层。以 [`dsh-memory-plus`](https://github.com/QIANLING-0831/dsh-memory-plus) 为例，五个"别人没有"：

1. **CJK 检索修复（生态唯一）**：trigram 双表 + 1–2 字 LIKE 回退，修的是所有记忆插件共享的 sessionQuery 地基（见姊妹篇《中文检索为什么 0 命中》）；
2. **技能自我进化**：`dsh-memory-skills`，后台反思蒸馏 + 原生 skill 文件；
3. **Token 去重**：工具结果哈希去重，纯省输入 Token；
4. **KV-safe 稳定注入**：基于源码级验证（deepFreeze / KV 前缀缓存 / 持久化路径）的注入纪律；
5. **compaction 来源定位**：近无损压缩 + 摘要可溯源。

## 6. 给新入场者的三条建议

1. **先搜再写**：`gh api search/repositories?q=dsh-memory` + npm 搜 `dsh memory`，别重造轮子；
2. **license 先行**：根 LICENSE + 注明借鉴来源；
3. **英文 README + 分发**：多数竞品有 `README.en.md`，全球检索才找得到你；`dsh plugin add` 本地路径记得带 `./` 前缀（否则被当 git 依赖）。

---

仓库：https://github.com/QIANLING-0831/dsh-memory-plus （生态盘点的完整 20+ 表格含 license 自查见 `docs/DSH-MEMORY-ECOSYSTEM.md`，MIT）

欢迎交流、指正。
