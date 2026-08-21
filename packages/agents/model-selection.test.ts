import { describe, expect, test } from "bun:test";
import { defineAgent, isAgentDescriptor } from "./src/index.ts";
import { parseModelProviderConfiguration, resolveModelSelector } from "./src/model-selection.ts";
import { z } from "@zsys/schema";

const configuration = parseModelProviderConfiguration({
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  openai: {},
  anthropic: { defaultModel: "claude-sonnet-4-5" },
});

describe("serializable agent model selection", () => {
  test("resolves omitted, provider-default, and exact selectors", () => {
    expect(resolveModelSelector(undefined, configuration)).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
      id: "openai:gpt-5-mini",
    });
    expect(resolveModelSelector("anthropic", configuration)).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      id: "anthropic:claude-sonnet-4-5",
    });
    expect(resolveModelSelector("openai:gpt-4.1", configuration)).toEqual({
      provider: "openai",
      model: "gpt-4.1",
      id: "openai:gpt-4.1",
    });
  });

  test("keeps descriptors value-free and model optional", () => {
    const omitted = defineAgent({
      id: "support.omitted",
      input: z.string(),
      output: z.string(),
      instructions: "Answer safely.",
      tools: [],
      limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    });
    const selected = defineAgent({
      id: "support.selected",
      input: z.string(),
      output: z.string(),
      model: "openai:gpt-4.1",
      instructions: "Answer safely.",
      tools: [],
      limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    });
    expect(Object.hasOwn(omitted, "model")).toBe(false);
    expect(selected.model).toBe("openai:gpt-4.1");
    expect(isAgentDescriptor(omitted)).toBe(true);
    expect(() =>
      defineAgent({
        id: "support.live",
        input: z.string(),
        output: z.string(),
        model: { modelId: "live" } as never,
        instructions: "Answer safely.",
        tools: [],
        limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
      }),
    ).toThrow("serializable text");
  });

  test("fails safely for unknown and incomplete provider defaults", () => {
    expect(() => resolveModelSelector("missing", configuration)).toThrow("is not configured");
    const incomplete = parseModelProviderConfiguration({
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      openai: {},
    });
    expect(() => resolveModelSelector("openai", incomplete)).toThrow("no default model");
  });
});
