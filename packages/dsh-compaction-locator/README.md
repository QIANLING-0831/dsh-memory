# dsh-compaction-locator

近无损压缩：继承 `BasicCompactionEngine`（官方文档化的 `summarize()` 子类钩子），在每个 `<compacted-summary>` 末尾追加 **Exact Sources 定位符块**：

```markdown
## Exact Sources (locators)
- seq range: 12-58
- spill file: /…/session-…/web_fetch.txt
- file touched: src/a.ts
```

摘要从"有损散文"升级为"**事实 + 定位符**"：路径/区间只有几百字节（shrink 校验由基类按 token 计量保证），模型需要精确内容时用 `read <spill file>` 或 `memory_search` 即可原样取回。

## 安装（替换 compaction-basic）

```yaml
# cordis.patch.yml — 用本插件替代 @deepseek-ai/dsh-compaction-basic（配置完全兼容）
plugins:
  - name: dsh-compaction-locator
    config:
      thresholdRatio: 0.8
      retainRatio: 0.16
```

## 行为细节

- 定位符按 shadowed 区间的**全跨度事件**提取：spill 路径（从 tool/result 文本 `stored at: <path>` 解析）+ 触碰文件（从区间内 tool/call 的 `path`/`file_path` 参数）；
- 纯对话区间（无文件/spill）不产出定位符块，摘要保持原样；
- 除 `summarize()` 外不改任何行为：压力判定、retain 策略、shrink 校验、KV 复用的重放前缀全部继承基类。

## 测试

```sh
node --test test/compaction-locator.test.js
```
