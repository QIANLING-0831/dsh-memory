# DeepSeek Harness 中文检索为什么搜不到「消耗」两个字？—— unicode61 缺陷 + trigram + LIKE 回退的完整修复

> 摘要：DeepSeek Harness 的会话全文检索（`sessionQuery`）用 SQLite FTS5 的 `unicode61` tokenizer，**对连续汉字不切词**——整段中文被当成一个 token，且查询被整体包成单短语。结果是 `"Token消耗"`、`"索引优化"` 这类中文子串查询**必然 0 命中**。本文从源码机制讲清楚为什么，给出可复现的 node:sqlite 验证，并分享一套 `trigram 双表 + 1–2 字 LIKE 回退` 的完整修复（含通配符转义与 snippet 处理）。

---

## 1. 现象：中文子串搜索全部落空

在 DSH 里搜一句旧会话里的中文，比如文档 `索引优化减少Token消耗的句子`：

- 查询 `Token消耗` → **0 命中**
- 查询 `"索引优化"` → **0 命中**
- 只有把**完整整句**原样打出来才命中

英文/代码没问题，中文一塌糊涂。这不是 DSH 特有的 bug，而是 FTS5 `unicode61` tokenizer 对 CJK 的固有行为 + 查询方式叠加的结果。

## 2. 机制：为什么必然 0 命中

`unicode61` 按 Unicode 类别把字母/数字当作"词内字符"，对中文汉字同样如此。于是**连续汉字在分词后是一个 token**——`索引优化减少Token消耗的句子` 整个是一坨，被索引成一个 token：

```
索引优化减少token消耗的句子   ← 单个 token（unicode61 视角）
```

而 `session-query` 的查询侧（`quoteFtsData`）把用户输入整体包成**一个短语**：

```js
function quoteFtsData(query) {
	return `"${query.replaceAll("\"", "\"\"")}"`;
}
```

短语查询要求"短语的 token 序列 == 文档的 token 序列"，所以 `"索引优化"` 要等于整段 token 才命中——永远不相等，于是 **0 命中**。

## 3. 可复现（node:sqlite，无需 DSH）

```js
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE VIRTUAL TABLE u USING fts5(text, tokenize='unicode61')`);
db.exec(`CREATE VIRTUAL TABLE t USING fts5(text, tokenize='trigram')`);
db.exec(`INSERT INTO u(text) VALUES ('索引优化减少Token消耗的句子')`);
db.exec(`INSERT INTO t(text) VALUES ('索引优化减少Token消耗的句子')`);
const n = (sql, ...a) => db.prepare(sql).get(...a).c;
console.log("unicode61  Token消耗 :", n(`SELECT count(*) c FROM u WHERE u MATCH ?`, '"Token消耗"'));
console.log("unicode61  索引优化  :", n(`SELECT count(*) c FROM u WHERE u MATCH ?`, '"索引优化"'));
console.log("trigram    Token消耗 :", n(`SELECT count(*) c FROM t WHERE t MATCH ?`, '"Token消耗"'));
console.log("trigram    索引优化  :", n(`SELECT count(*) c FROM t WHERE t MATCH ?`, '"索引优化"'));
console.log("trigram    消耗(2字) :", n(`SELECT count(*) c FROM t WHERE t MATCH ?`, '"消耗"'));
console.log("trigram    优(1字)   :", n(`SELECT count(*) c FROM t WHERE t MATCH ?`, '"优"'));
console.log("LIKE       消耗      :", n(`SELECT count(*) c FROM t WHERE text LIKE ? ESCAPE '\\'`, '%消耗%'));
```

结果（与 DSH 同一 SQLite 引擎）：

| 查询 | unicode61（上游） | trigram | LIKE 回退 |
|---|---|---|---|
| `Token消耗`（中英混合） | 0 | ✅ 命中 | — |
| `索引优化` | 0 | ✅ 命中 | — |
| 完整整句 | ✅（唯一方式） | ✅ | — |
| `消耗` / `索引`（2 字） | 0 | **0** | ✅ 命中 |
| `优`（1 字） | 0 | **0** | ✅ 命中 |

关键点来了：**trigram 也不完美**——它只索引 ≥3 字符的连续子串，所以 `消耗`、`索引`、`优` 这类 1–2 字中文查询在 trigram 表上照样 0 命中。1–2 字中文恰是高频查询形态，必须回退。

## 4. 完整修复：三级路由 + LIKE 回退

我做在开源插件 [`dsh-session-query-sqlite-cjk`](https://github.com/QIANLING-0831/dsh-memory-plus/tree/main/packages/dsh-session-query-sqlite-cjk) 里，思路是**双表双 tokenizer + 按查询内容路由**：

```js
// 路由规则
function queryMatchMode(query) {
	if (!containsCjk(query)) return "unicode61";          // 纯 ASCII → 原表，行为与上游一致
	return Array.from(query).length < 3 ? "like" : "trigram"; // CJK：<3 字走 LIKE，否则 trigram
}
```

- **含 CJK 且总长 ≥ 3** → trigram 表（`Token消耗` 的 CJK 部分只有 2 字，但整体 ≥3 字符，`ke消` 是合法 trigram，直接命中）；
- **含 CJK 且总长 < 3** → `LIKE '%词%'` 回退（`ESCAPE '\'` 转义 `%`/`_`/`\`）；
- **纯 ASCII** → 原 unicode61 表，英文/代码检索行为与上游完全一致，零回归。

### 4.1 LIKE 回退的三个细节

1. **通配符转义**：`LIKE '%词%'` 里 `%`/`_` 是通配符，查询里若含这些字符必须转义，否则 `"完%"` 会误中 `"完成"`：

```js
const pattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
// SQL: WHERE text LIKE ? ESCAPE '\'
```

2. **snippet 定位**：trigram 表走 FTS5 `highlight()` 自动标记命中；LIKE 表没有高亮，需用 `instr`/`substr` 手工把首个命中位置包上标记字符（DSH 用 `\u{FDD0}`/`\u{FDD1}` 作标记），这样 snippet 仍能居中定位：

```sql
CASE WHEN instr(text, ?) > 0 THEN
  substr(text, 1, instr(text, ?) - 1) || ? ||
  substr(text, instr(text, ?), length(?)) || ? ||
  substr(text, instr(text, ?) + length(?))
ELSE text END AS marked_text
```

3. **match_count（排序用）**：`highlight` 计数靠标记字符；LIKE 表改按字节差统计**全部**出现次数：

```sql
(length(CAST(text AS BLOB)) - length(CAST(replace(text, ?, '') AS BLOB))) / ?
```

### 4.2 别忘了 FTS5 的坑：LIKE 不能用裸表名

`WHERE 表名 LIKE ?` 不生效（FTS5 的裸表名语法只配 `MATCH` 用），必须写**列名**：

```sql
-- 错：WHERE live_docs_cjk LIKE ?      → 0 命中
-- 对：WHERE ld.text LIKE ? ESCAPE '\' → 命中
```

## 5. 若想合入上游（三处集成点）

1. **`DERIVED_USER_TABLES` 白名单**：新增 FTS5 表名（`persisted_docs_cjk` 等）必须同步进白名单，否则已有库下次打开会被 `assertDerivedUserTables` 判为 unrecognized 拒开；
2. **`SCHEMA_VERSION` 递增**：加表/换 tokenizer 是不兼容变更，老库靠版本不一致就地 reset 重建；
3. **查询分支**：复用现有 persisted + live 的 `UNION ALL`，第三个分支按查询路由替换 MATCH 表达式即可。

另注：trigram 的 `case_sensitive` 默认关闭，与 unicode61 的大小写折叠一致，保持默认即不回归英文/代码检索。

## 6. 测试

- 12 个单测：trigram 命中、中英混合命中、ASCII 回退、1 字/2 字 LIKE 回退、通配符转义、短查询无命中、会话级检索、持久化会话双分支检索、无命中场景；
- 依赖包 `dsh-memory-index` 8 单测回归通过。

仓库：https://github.com/QIANLING-0831/dsh-memory-plus （`packages/dsh-session-query-sqlite-cjk`，MIT）

欢迎试用、提 issue。
