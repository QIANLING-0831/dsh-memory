import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { MemoryStore, MEMORY_TOPICS, normalizeContent, overlapSimilarity } from "@qianling/memory-engine";

function resolveConfig(config) {
  const resolved = {
    path: config.path,
    enabled: config.enabled ?? true,
    similarityThreshold: config.similarityThreshold ?? 0.9,
    maxFacts: config.maxFacts ?? 50,
    sectionOrder: config.sectionOrder ?? 50,
  };
  if (typeof resolved.path !== "string" || resolved.path.trim().length === 0) {
    throw new Error("dsh-memory-core: path must not be blank");
  }
  if (!Number.isInteger(resolved.maxFacts) || resolved.maxFacts < 1) {
    throw new Error("dsh-memory-core: maxFacts must be a positive integer");
  }
  return resolved;
}

export class MemoryCoreEngine extends Service {
  static inject = ["systemPrompt"];
  static Config = z.object({
    path: z.string().required(),
    enabled: z.boolean().default(true),
    similarityThreshold: z.number().default(0.9),
    maxFacts: z.number().step(1).min(1).default(50),
    sectionOrder: z.number().default(50),
  });

  constructor(ctx, config) {
    super(ctx, "memoryCore");
    this.config = resolveConfig(config);
    this.store = new MemoryStore({ path: this.config.path, similarityThreshold: this.config.similarityThreshold });
    this.blockCache = new Map();
    if (this.config.enabled) {
      ctx.systemPrompt.section({
        name: "memory-core",
        order: this.config.sectionOrder,
        text: (context) => this.renderFor(context),
      });
    }
  }

  async remember(input) {
    const result = this.store.remember(input);
    this.blockCache.clear();
    return result;
  }

  list(workspace, limit = 100) {
    return this.store.list(workspace, limit).map((fact) => ({
      fact_id: fact.factId,
      workspace: fact.workspace,
      topic: fact.topic,
      content: fact.content,
      confidence: fact.confidence,
      created_at: fact.createdAt,
      updated_at: fact.updatedAt,
    }));
  }

  async forget(factId) {
    this.blockCache.clear();
    return this.store.forgetById(factId);
  }

  renderBlock(workspace) {
    const cached = this.blockCache.get(workspace);
    if (cached !== undefined) return cached;
    const facts = this.list(workspace, this.config.maxFacts);
    const block = facts.length === 0
      ? ""
      : `## Persistent Memory (workspace: ${workspace})\n${facts.map((fact) => `- [${fact.topic}] ${fact.content}`).join("\n")}`;
    this.blockCache.set(workspace, block);
    return block;
  }

  renderFor(context) {
    const cwd = context.agent?.session?.header?.cwd;
    return typeof cwd === "string" && cwd.trim().length > 0 ? this.renderBlock(cwd) : "";
  }

  close() {
    this.store.close();
    return Promise.resolve();
  }
}

export function createRememberTool(ctx) {
  return defineTool({
    name: "memory_remember",
    description: "Store a durable workspace-scoped fact. Only remember explicit preferences, project conventions, environment facts, or decisions.",
    parameters: {
      content: { type: "string", required: true, description: "Short durable fact." },
      topic: { type: "string", enum: MEMORY_TOPICS, description: "Fact category." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args, exec) {
      const workspace = exec.agent?.session?.header?.cwd ?? "";
      const core = ctx.get("memoryCore");
      if (!core) return "memory_remember: memory-core service not loaded.";
      try {
        const result = await core.remember({ workspace, content: String(args.content ?? ""), topic: args.topic });
        return result.merged ? `已更新既有记忆 (${result.factId})。` : `已记住 (${result.factId})。`;
      } catch (error) {
        ctx.logger?.warn(`memory_remember failed: ${String(error)}`);
        return "memory_remember: failed to store the fact; try again later.";
      }
    },
  });
}

export { normalizeContent, overlapSimilarity };
export const name = "memory-core";
export const inject = ["systemPrompt", "tools"];
export const Config = MemoryCoreEngine.Config;

export function apply(ctx, config) {
  ctx.plugin(MemoryCoreEngine, config);
  ctx.tools.register(createRememberTool(ctx, config));
}
