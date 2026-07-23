import { describe, expect, it } from "vitest";
import { buildAiProvider } from "./provider.js";

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
