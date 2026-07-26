/**
 * @interior/ai — the AI layer for the interior-design app (Phase 4, behind
 * FEATURE_AI). Pure TypeScript: no three.js, no React. Designed to be consumed
 * both by a server-side Fastify proxy (running the agentic loop) and by the web
 * app (applying document mutations locally from the streamed events).
 *
 * The load-bearing guarantee: the LLM only ever proposes constraints/intents
 * via typed tools; a deterministic solver turns those into validated, collision-
 * and clearance-checked positions, and the executor returns a new immutable
 * document per call. Raw coordinates from the model are never trusted.
 */

// Tool schemas (zod + derived JSON Schema)
export * from "./tools.js";

// Deterministic layout solver
export * from "./solver.js";

// Full-room layout planner (suggestLayout)
export * from "./layout.js";

// Tool executor
export * from "./executor.js";

// Catalog types + DB-filter helpers
export * from "./catalog.js";

// Provider abstraction + implementations
export * from "./provider.js";
export * from "./providers/mock.js";
export * from "./providers/openai.js";
export * from "./providers/openaiResponses.js";

// Prompt-injection guard
export * from "./prompt.js";

// Agentic loop
export * from "./loop.js";
