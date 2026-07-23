/**
 * AI provider selection for the server-side chat proxy.
 *
 * Dev-friendly by default: with no env config at all, `FEATURE_AI=true`
 * still works end-to-end against `MockProvider` (deterministic, offline). If
 * `AI_PROVIDER_BASE_URL` + `AI_MODEL` are both set, requests go to that
 * OpenAI-compatible endpoint instead (optionally with `AI_PROVIDER_API_KEY`).
 */

import { MockProvider, OpenAICompatProvider, openAICompatConfigFromEnv, OpenAIResponsesProvider, type ChatProvider } from "@interior/ai";

export function isFeatureAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FEATURE_AI === "true" || env.FEATURE_AI === "1";
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
