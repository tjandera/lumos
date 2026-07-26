import { describe, expect, it } from "vitest";
import { aiProviderKind, buildAiProvider, isFeatureAiEnabled } from "./provider.js";

describe("isFeatureAiEnabled", () => {
  it("defaults to true with no env at all", () => {
    expect(isFeatureAiEnabled({})).toBe(true);
  });

  it("stays true for unrelated/irrelevant env values", () => {
    expect(isFeatureAiEnabled({ FEATURE_AI: "true" })).toBe(true);
    expect(isFeatureAiEnabled({ FEATURE_AI: "1" })).toBe(true);
    expect(isFeatureAiEnabled({ FOO: "bar" })).toBe(true);
  });

  it("is false only when explicitly disabled", () => {
    expect(isFeatureAiEnabled({ FEATURE_AI: "false" })).toBe(false);
    expect(isFeatureAiEnabled({ FEATURE_AI: "0" })).toBe(false);
  });
});

describe("aiProviderKind", () => {
  it("is 'mock' with no provider config", () => {
    expect(aiProviderKind({})).toBe("mock");
  });

  it("is 'llm' once AI_PROVIDER_BASE_URL + AI_MODEL are configured", () => {
    expect(aiProviderKind({ AI_PROVIDER_BASE_URL: "http://localhost:11434/v1", AI_MODEL: "local-model" })).toBe("llm");
  });

  it("is 'llm' for the official GPT-5.6 Responses config", () => {
    expect(
      aiProviderKind({ AI_PROVIDER_BASE_URL: "https://api.openai.com/v1", AI_MODEL: "gpt-5.6-sol", AI_PROVIDER_API_KEY: "key" })
    ).toBe("llm");
  });
});

describe("buildAiProvider", () => {
  it("routes GPT-5.6 to OpenAIResponsesProvider when official URL is used", () => {
    const provider = buildAiProvider({
      AI_PROVIDER_BASE_URL: "https://api.openai.com/v1",
      AI_MODEL: "gpt-5.6-sol",
      AI_PROVIDER_API_KEY: "key"
    });
    expect(provider.constructor.name).toBe("OpenAIResponsesProvider");
  });
  
  it("routes GPT-5.6 alias to OpenAIResponsesProvider when official URL is used", () => {
    const provider = buildAiProvider({
      AI_PROVIDER_BASE_URL: "https://api.openai.com/v1/",
      AI_MODEL: "gpt-5.6",
      AI_PROVIDER_API_KEY: "key"
    });
    expect(provider.constructor.name).toBe("OpenAIResponsesProvider");
  });

  it("routes to OpenAICompatProvider for other models/URLs", () => {
    const provider = buildAiProvider({
      AI_PROVIDER_BASE_URL: "http://localhost:11434/v1",
      AI_MODEL: "local-model"
    });
    expect(provider.constructor.name).toBe("OpenAICompatProvider");
  });

  it("routes to MockProvider when no config is provided", () => {
    const provider = buildAiProvider({});
    expect(provider.constructor.name).toBe("MockProvider");
  });
});
