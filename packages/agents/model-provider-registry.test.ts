import { describe, expect, test } from "bun:test";
import {
  createModelProviderRegistry,
  ModelProviderRegistryError,
} from "./src/model-provider-registry.ts";

const configuration = {
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  openai: { apiKey: { kind: "env-ref", name: "OPENAI_API_KEY" } },
  anthropic: {
    defaultModel: "claude-sonnet-4-5",
    apiKey: { kind: "env-ref", name: "ANTHROPIC_API_KEY" },
  },
};

describe("model provider registry", () => {
  test("stays absent when no model provider recipe is configured", async () => {
    expect(await createModelProviderRegistry({ configuration: undefined })).toBeUndefined();
  });

  test("resolves environment references before creating AI SDK providers", async () => {
    const registry = await createModelProviderRegistry({
      configuration,
      values: { OPENAI_API_KEY: "openai-key", ANTHROPIC_API_KEY: "anthropic-key" },
    });

    expect(registry?.languageModel("openai:gpt-5-mini")).toBeDefined();
    expect(registry?.languageModel("anthropic:claude-sonnet-4-5")).toBeDefined();
    expect(registry?.resolveModel()).toMatchObject({ id: "openai:gpt-5-mini" });
    expect(registry?.resolveModel("anthropic")).toMatchObject({
      id: "anthropic:claude-sonnet-4-5",
    });
    expect(registry?.resolveModel("openai:gpt-4.1")).toMatchObject({
      id: "openai:gpt-4.1",
    });
  });

  test("does not read process environment or accept unresolved secrets", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "process-secret";
    try {
      await expect(createModelProviderRegistry({ configuration })).rejects.toBeInstanceOf(
        ModelProviderRegistryError,
      );
      await expect(createModelProviderRegistry({ configuration })).rejects.toThrow(
        "environment reference is unresolved",
      );
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  test("rejects unknown providers and invalid defaults", async () => {
    await expect(
      createModelProviderRegistry({
        configuration: { ...configuration, defaultProvider: "missing" },
        values: { OPENAI_API_KEY: "openai-key", ANTHROPIC_API_KEY: "anthropic-key" },
      }),
    ).rejects.toThrow('defaultProvider "missing" is not configured');
    await expect(
      createModelProviderRegistry({
        configuration: {
          defaultProvider: "mistral",
          defaultModel: "mistral-small",
          mistral: { apiKey: { kind: "env-ref", name: "MISTRAL_API_KEY" } },
        },
        values: { MISTRAL_API_KEY: "mistral-key" },
      }),
    ).rejects.toThrow('Model provider "mistral" is unsupported');
  });
});
