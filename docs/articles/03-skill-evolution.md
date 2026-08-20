# Agent 技能自我进化：Hermes 式学习循环在 DeepSeek Harness 上的落地

<!-- ===== CSDN 发布信息 ===== -->
> 🖼️ **封面图**（建议 1200×600）：主标题「Agent 学会新技能」+ 副标题「后台反思蒸馏：回合 → 技能」，齿轮/进化/循环主题 + 深色底。CSDN「上传封面」处设置；如需正文内嵌，替换下方占位：
> `![封面占位](上传封面后替换此路径)`
> 🏷️ **标签**：#Agent自进化 #技能管理 #Hermes #学习循环 #DeepSeek-Harness
> 🔍 **关键词**：Agent 技能自我进化, Hermes 学习循环, skill_write, 后台反思蒸馏, DeepSeek Harness
<!-- ============================ -->

> 摘要：让 Agent 从自己完成的回合里"学会新技能"，是 Nous Research Hermes Agent 等自进化框架的标志能力。本文拆解它落到 DeepSeek Harness（DSH）要过哪几道坎：DSH 原生 skill 系统的文件格式与注入方式、模型可调的技能管理器工具、以及一个**后台定时反思蒸馏**循环（水位线 + 冷却 + 启发式门槛 + 严格 JSON 契约 + 原子写），并给出一套可运行的实现 `dsh-memory-skills`（MIT）。

---

## 1. 背景：DSH 原生 skill 系统是什么

DSH 自带技能系统（`@deepseek-ai/dsh-skill` + `dsh-skill-filesystem` + `dsh-tool-skill`）：

- 技能是 **Markdown 文件 + YAML frontmatter**，两种布局：目录包 `<name>/SKILL.md` 或平铺 `<name>.md`；
- frontmatter 至少含 `name`（kebab-case）与 `description`，可选 `whenToUse`、`disable-model-invocation`、`user-invocable`；
- `dsh-skill-filesystem` 从若干"根"扫描技能并注入会话技能目录，根有优先级（项目 `.dsh/skills` 100 > 用户 `$DSH_HOME/skills` 400 > bundled 600）；
- 模型通过原生 `skill` 工具按名加载技能正文。

```markdown
---
name: "pnpm-recovery"
description: "Fix lockfile mismatch"
whenToUse: "当 pnpm install 失败时"
---
Run `pnpm install --no-frozen-lockfile`, then rebuild.
```

关键点：**技能文件是纯文本、无插件状态**——所以"自己写技能"本质上就是"写这些 Markdown 文件"。

## 2. 技能管理器：让模型能增删查

模型通过三个工具操作技能（`dsh-memory-skills` 提供）：

| 工具 | 作用 |
|---|---|
| `skill_write(name, description, whenToUse?, content)` | 创建/更新技能，写 DSH 原生文件 |
| `skill_delete(name)` | 删除托管技能 |
| `skill_list()` | 列出可用技能（原生目录 + 托管的，标记 `(managed)`） |

核心是**原子写**（写临时文件再 rename），失败不残留半成品：

```js
write({ name, description, whenToUse, content }) {
	assertSkillInput(input);                       // kebab-case + 必填校验 + 上限
	const file = this.pathFor(input.name);
	const tmp = `${file}.${randomUUID()}.tmp`;
	writeFileSync(tmp, renderSkillFile(input), "utf8");
	renameSync(tmp, file);                          // 原子替换
	return { created, path: file };
}
```

写入目标默认 `$DSH_HOME/skills`（正是 `dsh-skill-filesystem` 的 user-dsh 根，rank 400，目录自带 watcher 自动失效缓存）——**写完立刻进会话技能目录**，下一步就能被原生 `skill` 工具加载，无需重启。

## 3. 后台自我进化：反思 → 蒸馏 → 写技能

"后台"意味着不在请求路径上（fire-and-forget），不能打断主循环、不能污染会话历史、不能动 KV 前缀缓存。

### 3.1 触发：定时 + 水位线

```js
// 每 evolveIntervalMs（默认 60s）跑一次
setInterval(() => this._evolveTick().catch(...), this.config.evolveIntervalMs);

async _evolveTick() {
	for (const session of this.ctx.sessions.list()) {
		const state = db.prepare("SELECT last_seq FROM skill_evolve_state WHERE session_id=?").get(session.id);
		const fresh = session.events.filter(e => e.seq > (state?.last_seq ?? -1));
		// 启发式门槛：近期有足够长的 assistant 消息
		// 冷却期：每会话 evolveCooldownMs 内不重复
		// 到达则 _evolveSession(...)，最后回写水位线
	}
}
```

水位线保证每段事件只被反思一次；冷却期 + 窗口（最近 N 条）+ 门槛把 LLM 成本压平。

### 3.2 反思：一次严格 JSON 契约的 LLM 调用

向 `ctx.llm.stream` 发一条固定的 system prompt（"背景技能策展人"），要求只返回 JSON：

```json
{"evolve": true, "name": "kebab-case 技能名", "description": "一句话",
 "whenToUse": "何时用", "content": "Markdown 正文", "reason": "为何值得留存"}
{"evolve": false, "reason": "一次性内容，不构成技能"}
```

解析时剥掉 ```json 围栏、用括号配平提取首个 JSON，容错降级为"跳过"：

```js
const parsed = parseEvolutionResponse(text);
if (!parsed?.evolve) return { kind: "skipped" };
if (!isSkillName(parsed.name) || !parsed.description || !parsed.content)
	return { kind: "invalid" };
this.writeSkill({ name: parsed.name, description: parsed.description, content: parsed.content }, { sessionId });
```

### 3.3 记录与容量

- 每次动作写入派生库 `skill_events` 日志（created / updated / skipped / invalid / cap / error），可查；
- 托管技能有上限（默认 50），达上限时跳过并记 `cap`，避免白烧 LLM；
- 技能文件是纯 Markdown，**卸载插件也不丢**。

## 4. 与 dsh-memory-evolve（205★）的取舍

社区已有大而全的 `dsh-memory-evolve`（五轨记忆 + 技能自进化 + COI 调度 + WebUI）。`dsh-memory-skills` 刻意**小而聚焦**：

- 只做"技能管理器 + 后台反思蒸馏"这一件事，~700 行，零运行时依赖；
- 直接写 DSH 原生技能文件，复用官方 skill 系统，不另起炉灶；
- 与全家桶其他包（CJK 检索 / 混合检索 / 去重）组成完整记忆地基。

要不要上 WebUI、多人协同、git 分支感知，属于后续扩展项。

## 5. 真机验证与一个真实踩坑

在真实 harness（headless profile）用一次性任务跑通了完整闭环：

```
skill_write  → 生成 $DSH_HOME/skills/verify-tool.md，frontmatter 正确，实时进会话目录
skill_list   → - verify-tool (managed): verification skill for testing
skill_delete → 文件删除，目录实时清空
skill_events → 记录 created / deleted（含会话 ID / 时间戳）
```

踩坑记录（值得写进你的实现）：**cordis 插件加载器读命名导出**——如果你的插件同时 `export default apply`，加载器会把裸函数当入口，`inject` 列表失效，启动报 `cannot get property "tools" without inject`。其他官方插件都没有默认导出，照做即可。

## 6. 小结

- 技能 = DSH 原生 Markdown 文件 → 用 `skill_write` 增删、用 `ctx.skills` 目录暴露；
- 自进化 = 定时水位线扫描 + 一次严格 JSON 反思 + 原子写 + 日志，全部在请求路径之外；
- 真机验证证明：写入即对会话可见，增删查闭环，日志可审计。

仓库：https://github.com/QIANLING-0831/dsh-memory-plus （`packages/dsh-memory-skills`，MIT）

欢迎试用、提 issue。
