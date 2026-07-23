/**
 * AI provider selection for the server-side chat proxy.
 *
 * On by default: with no env config at all, the assistant is enabled and
 * runs end-to-end against `MockProvider` (deterministic, offline heuristic
 * responder — no network calls, no API key). Set `FEATURE_AI=false` (or
 * `0`) to explicitly turn the assistant off (route 404s). If
 * `AI_PROVIDER_BASE_URL` + `AI_MODEL` are both set, requests go to that
 * real OpenAI-compatible endpoint instead (optionally with
 * `AI_PROVIDER_API_KEY`) — a real LLM always requires explicit env config,
 * on-by-default only ever gets you the offline mock.
 */

import { MockProvider, OpenAICompatProvider, openAICompatConfigFromEnv, OpenAIResponsesProvider, type ChatProvider } from "@interior/ai";

/** Defaults to enabled; only an explicit `"false"`/`"0"` turns it off. */
export function isFeatureAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.FEATURE_AI === "false" || env.FEATURE_AI === "0") return false;
  return true;
}

/** `"mock"` when no real provider is configured (the default), else `"llm"`. */
export function aiProviderKind(env: Record<string, string | undefined> = process.env): "mock" | "llm" {
  return isOfficialOpenAiResponsesConfig(env) || (env.AI_PROVIDER_BASE_URL && env.AI_MODEL) ? "llm" : "mock";
}

export function isOfficialOpenAiResponsesConfig(env: Record<string, string | undefined>): boolean {
  if (!env.AI_PROVIDER_BASE_URL || !env.AI_MODEL) return false;
  const url = env.AI_PROVIDER_BASE_URL.replace(/\/$/, "");
  return url === "https://api.openai.com/v1" && (env.AI_MODEL === "gpt-5.6-sol" || env.AI_MODEL === "gpt-5.6");
}

export function buildAiProvider(env: Record<string, string | undefined> = process.env): ChatProvider {
  if (isOfficialOpenAiResponsesConfig(env)) {
    return new OpenAIResponsesProvider({
      model: env.AI_MODEL!,
      baseURL: env.AI_PROVIDER_BASE_URL,
      apiKey: env.AI_PROVIDER_API_KEY
    });
  }
  if (env.AI_PROVIDER_BASE_URL && env.AI_MODEL) {
    return new OpenAICompatProvider(openAICompatConfigFromEnv(env));
  }
  return new MockProvider();
}
