import { createHash } from "node:crypto";
/**
* Embedder seam: `embed(texts)` returns one normalized Float32Array per input.
*
* - `createTestEmbedder()` — deterministic character-overlap embedder for unit
*   tests: two texts sharing characters get similar vectors, so vector recall
*   is meaningful without downloading a model.
* - `createTransformersEmbedder(config)` — real local embeddings via
*   `@huggingface/transformers` (bge-family ONNX). Lazily imported so the
*   package stays light until an embedder is actually configured. In China,
*   set `remoteHost: "https://hf-mirror.com"` for model downloads.
*/
/** Deterministic test embedder: dim = 512 buckets, value = character overlap. */
export function createTestEmbedder(dims = 512) {
	const vector = new Float32Array(dims);
	return async (texts) => {
		return texts.map((text) => {
			const vec = new Float32Array(dims);
			for (const ch of text) {
				const code = ch.codePointAt(0);
				vec[code % dims] += 1;
				vec[(code * 31) % dims] += 0.5;
			}
			normalize(vec);
			return vec;
		});
	};
}
/**
* Real local embedder via transformers.js. Requires the optional dependency
* `@huggingface/transformers`; throws a clear error when it is absent.
* @param config - `{ model, dims, remoteHost?, cacheDir?, quantized? }`.
*/
export async function createTransformersEmbedder(config) {
	let transformers;
	try {
		transformers = await import("@huggingface/transformers");
	} catch (error) {
		throw new Error(`dsh-memory-index: @huggingface/transformers is not installed; run "npm i @huggingface/transformers" to enable local embeddings (${error instanceof Error ? error.message : String(error)})`);
	}
	const { env, pipeline } = transformers;
	if (config.remoteHost) env.remoteHost = config.remoteHost;
	if (config.cacheDir) env.cacheDir = config.cacheDir;
	const extractor = await pipeline("feature-extraction", config.model, {
		dtype: config.quantized === false ? "fp32" : "q8",
		cache_dir: config.cacheDir
	});
	return async (texts) => {
		const output = await extractor(texts, {
			pooling: "mean",
			normalize: true
		});
		const list = output.tolist();
		return list.map((row) => {
			const vec = new Float32Array(row);
			normalize(vec);
			return vec;
		});
	};
}
/** In-place L2 normalization of a vector. */
export function normalize(vec) {
	let sum = 0;
	for (let i = 0; i < vec.length; i += 1) sum += vec[i] * vec[i];
	const norm = Math.sqrt(sum);
	if (norm > 0) for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
	return vec;
}
/** Stable string fingerprint used for incremental indexing. */
export function fingerprintOf(parts) {
	return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("base64url");
}
