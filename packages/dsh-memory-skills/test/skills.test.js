import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	MemorySkillsEngine,
	SkillStore,
	assertSkillInput,
	createSkillDeleteTool,
	createSkillListTool,
	createSkillWriteTool,
	eventText,
	parseEvolutionResponse,
	parseSkillFile,
	renderSkillFile
} from "../lib/index.js";

function tempDir() {
	return mkdtempSync(join(tmpdir(), "dsh-skills-"));
}

function stubCtx(options = {}) {
	const sessions = options.sessions ?? [];
	const llm = options.llm;
	const engineRef = {};
	return {
		reflect: { provide() {} },
		sessions: {
			list: () => sessions,
			get: (id) => sessions.find((s) => (s.id ?? s.header?.id) === id)
		},
		skills: {
			list: async () => options.nativeSkills ?? []
		},
		llm: llm ?? {
			async *stream() {
				yield { type: "text-delta", text: "noop" };
			}
		},
		tools: { register() {} },
		effect: () => () => {},
		logger: console,
		get: () => engineRef.engine,
		engineRef
	};
}

// ---------- SkillStore / frontmatter ----------

test("SkillStore write creates a DSH-native skill file", () => {
	const dir = tempDir();
	const store = new SkillStore(dir, 10);
	const { created, path } = store.write({ name: "pnpm-install", description: "Install deps with pnpm", whenToUse: "when running pnpm", content: "Run `pnpm install --no-frozen-lockfile`." });
	assert.equal(created, true);
	assert.ok(existsSync(path));
	const raw = readFileSync(path, "utf8");
	assert.ok(raw.startsWith("---\nname: \"pnpm-install\"\ndescription: \"Install deps with pnpm\"\nwhenToUse: \"when running pnpm\"\n---"));
	assert.ok(raw.includes("`pnpm install --no-frozen-lockfile`"));
	// read round-trip
	const parsed = store.read("pnpm-install");
	assert.equal(parsed.name, "pnpm-install");
	assert.equal(parsed.description, "Install deps with pnpm");
	assert.equal(parsed.whenToUse, "when running pnpm");
	assert.ok(parsed.content.includes("pnpm install"));
	// update returns created:false
	const again = store.write({ name: "pnpm-install", description: "Updated", content: "v2" });
	assert.equal(again.created, false);
	assert.equal(store.read("pnpm-install").description, "Updated");
	rmSync(dir, { recursive: true, force: true });
});

test("SkillStore validation: name grammar, missing fields, cap", () => {
	assert.throws(() => assertSkillInput({ name: "Bad Name", description: "d", content: "c" }), /kebab-case/);
	assert.throws(() => assertSkillInput({ name: "ok", description: "", content: "c" }), /description/);
	assert.throws(() => assertSkillInput({ name: "ok", description: "d", content: "  " }), /content/);
	const dir = tempDir();
	const store = new SkillStore(dir, 2);
	store.write({ name: "a-skill", description: "a", content: "1" });
	store.write({ name: "b-skill", description: "b", content: "2" });
	assert.throws(() => store.write({ name: "c-skill", description: "c", content: "3" }), /cap reached/);
	assert.equal(store.count(), 2);
	assert.equal(store.delete("a-skill"), true);
	assert.equal(store.delete("a-skill"), false);
	rmSync(dir, { recursive: true, force: true });
});

test("renderSkillFile / parseSkillFile round-trip survives quotes and colons", () => {
	const skill = { name: "tricky", description: 'Says "hi": ok', whenToUse: "a:b", content: "body\n---\nnot a fence" };
	const raw = renderSkillFile(skill);
	const parsed = parseSkillFile(raw);
	assert.equal(parsed.name, "tricky");
	assert.equal(parsed.description, 'Says "hi": ok');
	assert.equal(parsed.whenToUse, "a:b");
	assert.ok(parsed.content.startsWith("body"));
	assert.equal(parseSkillFile("no frontmatter"), void 0);
	assert.equal(parseSkillFile("---\nname: only-name\n---\nbody"), void 0);
});

// ---------- event text / response parsing ----------

test("eventText extracts text from user/assistant/tool shapes", () => {
	assert.equal(eventText({ type: "user/message", data: { content: [{ type: "text", text: "你好" }] } }), "你好");
	assert.equal(eventText({ type: "assistant/message", data: { message: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } } }), "a\nb");
	assert.equal(eventText({ type: "tool/result", data: { message: { content: [{ type: "text", text: "out" }] } } }), "out");
	assert.equal(eventText({ type: "assistant/message", data: {} }), "");
});

test("parseEvolutionResponse handles fences and prose", () => {
	const good = parseEvolutionResponse('```json\n{"evolve": true, "name": "x", "description": "d", "content": "c"}\n```');
	assert.equal(good.name, "x");
	assert.equal(good.evolve, true);
	const prose = parseEvolutionResponse("Sure!\n{\"evolve\": false, \"reason\": \"nothing\"}\nThanks");
	assert.equal(prose.evolve, false);
	assert.equal(parseEvolutionResponse("no json here"), void 0);
	assert.equal(parseEvolutionResponse('{"broken": '), void 0);
});

// ---------- Engine: manager + evolution ----------

test("engine writeSkill/deleteSkill/listManaged/log round-trip", async () => {
	const dir = tempDir();
	const ctx = stubCtx();
	const engine = new MemorySkillsEngine(ctx, { path: ":memory:", skillDir: dir, evolveEnabled: false });
	ctx.engineRef.engine = engine;
	const { created } = await engine.writeSkill({ name: "recall", description: "Search old context", content: "Call memory_search when details left context." });
	assert.equal(created, true);
	assert.equal(engine.listManaged().length, 1);
	assert.equal(await engine.deleteSkill("recall"), true);
	assert.equal(await engine.deleteSkill("recall"), false);
	const log = engine.log();
	assert.equal(log.length, 2); // created + deleted
	assert.equal(log[0].kind, "deleted");
	await engine.close();
	rmSync(dir, { recursive: true, force: true });
});

test("background evolution writes a skill from a finished turn and respects watermark/cooldown", async () => {
	const dir = tempDir();
	const NOW = Date.now();
	const assistant = {
		seq: 0,
		type: "assistant/message",
		time: NOW,
		data: { message: { content: [{ type: "text", text: "运行 pnpm install 时遇到 lockfile 不一致，解决方法是 pnpm install --no-frozen-lockfile 然后重新构建，这个流程以后会反复用到。" }] } }
	};
	const sessions = [{ id: "s1", header: { id: "s1", cwd: "C:\\ws" }, events: [assistant] }];
	const payload = JSON.stringify({ evolve: true, name: "pnpm-recovery", description: "Fix lockfile mismatch", whenToUse: "when pnpm install fails", content: "Run pnpm install --no-frozen-lockfile, then rebuild.", reason: "recurring install issue" });
	let streamCalls = 0;
	const ctx = stubCtx({
		sessions,
		llm: {
			async *stream() {
				streamCalls += 1;
				yield { type: "text-delta", text: payload.slice(0, 20) };
				yield { type: "text-delta", text: payload.slice(20) };
			}
		}
	});
	const engine = new MemorySkillsEngine(ctx, { path: ":memory:", skillDir: dir, evolveEnabled: false, evolveMinAssistantChars: 10 });
	ctx.engineRef.engine = engine;
	await engine._evolveTick();
	assert.equal(streamCalls, 1);
	assert.equal(engine.listManaged().length, 1);
	assert.equal(engine.listManaged()[0].name, "pnpm-recovery");
	// watermark advanced: second tick with no new events does nothing
	await engine._evolveTick();
	assert.equal(streamCalls, 1);
	// cooldown: new event within cooldown skips the LLM
	sessions[0].events.push({ seq: 1, type: "assistant/message", time: NOW + 1, data: { message: { content: [{ type: "text", text: "另一个足够长的回合内容，测试冷却期是否会阻止重复反思。" }] } } });
	await engine._evolveTick();
	assert.equal(streamCalls, 1, "cooldown must suppress a second reflection");
	// short assistant message does not trigger reflection
	sessions[0].events.push({ seq: 2, type: "assistant/message", time: NOW + 2, data: { message: { content: [{ type: "text", text: "ok" }] } } });
	await engine._evolveTick();
	assert.equal(streamCalls, 1, "short message must not trigger reflection");
	await engine.close();
	rmSync(dir, { recursive: true, force: true });
});

test("evolution skip path logs skipped and honors maxSkills cap", async () => {
	const dir = tempDir();
	const ctx = stubCtx({
		sessions: [{ id: "s1", header: { id: "s1" }, events: [{ seq: 0, type: "assistant/message", time: Date.now(), data: { message: { content: [{ type: "text", text: "这是一段足够长的助手消息，但没有值得沉淀的技能。" }] } } }] }],
		llm: {
			async *stream() {
				yield { type: "text-delta", text: '{"evolve": false, "reason": "one-off content"}' };
			}
		}
	});
	const engine = new MemorySkillsEngine(ctx, { path: ":memory:", skillDir: dir, evolveEnabled: false, evolveMinAssistantChars: 10 });
	ctx.engineRef.engine = engine;
	await engine._evolveTick();
	assert.equal(engine.listManaged().length, 0);
	assert.ok(engine.log().some((entry) => entry.kind === "skipped"));
	await engine.close();
	rmSync(dir, { recursive: true, force: true });
});

// ---------- Tools ----------

test("skill_write tool creates a file and skill_delete removes it", async () => {
	const dir = tempDir();
	const ctx = stubCtx();
	const engine = new MemorySkillsEngine(ctx, { path: ":memory:", skillDir: dir, evolveEnabled: false });
	ctx.engineRef.engine = engine;
	const writeTool = createSkillWriteTool(ctx);
	const out = await writeTool.execute({ name: "checklist", description: "Deploy checklist", content: "1. build\n2. push" }, { agent: { session: { header: { id: "s1", cwd: "C:\\ws" } } } });
	assert.ok(out.includes("created"));
	assert.ok(existsSync(join(dir, "checklist.md")));
	const deleteTool = createSkillDeleteTool(ctx);
	const del = await deleteTool.execute({ name: "checklist" }, { agent: { session: { header: { id: "s1" } } } });
	assert.ok(del.includes("deleted"));
	assert.equal(existsSync(join(dir, "checklist.md")), false);
	const listTool = createSkillListTool(ctx);
	const listed = await listTool.execute({}, { agent: { session: { header: { cwd: "C:\\ws" } } } });
	assert.ok(listed.includes("No skills available."));
	await engine.close();
	rmSync(dir, { recursive: true, force: true });
});

test("listAvailable merges native catalog and managed skills", async () => {
	const dir = tempDir();
	const ctx = stubCtx({ nativeSkills: [{ name: "native-skill", description: "built-in" }] });
	const engine = new MemorySkillsEngine(ctx, { path: ":memory:", skillDir: dir, evolveEnabled: false });
	ctx.engineRef.engine = engine;
	await engine.writeSkill({ name: "mine", description: "managed one", content: "x" });
	const available = await engine.listAvailable("C:\\ws");
	assert.equal(available.length, 2);
	assert.equal(available.find((s) => s.name === "mine").managed, true);
	assert.equal(available.find((s) => s.name === "native-skill").managed, false);
	await engine.close();
	rmSync(dir, { recursive: true, force: true });
});
