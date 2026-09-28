import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { defineAgent, isAgentDescriptor } from "../src/index.ts";
import {
  normalizeModelSelectorEffect,
  parseModelProviderConfiguration,
  parseModelProviderConfigurationEffect,
  resolveModelSelector,
  resolveModelSelectorEffect,
} from "../src/model-selection.ts";
import { z } from "@relkit/schema";

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

  test("keeps model selection optional and accepts native models", () => {
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
    const native = { invoke: async () => ({ content: "ok" }) };
    const direct = defineAgent({
      id: "support.live",
      input: z.string(),
      output: z.string(),
      model: native,
      instructions: "Answer safely.",
      tools: [],
      limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    });
    expect(direct.model).toBe(native);
    expect(Object.isFrozen(native)).toBe(false);
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

  test("exposes tagged Effect failures while preserving the synchronous errors", () => {
    expect(Effect.runSync(normalizeModelSelectorEffect("openai:gpt"))).toBe("openai:gpt");
    expect(Effect.runSync(parseModelProviderConfigurationEffect({
      defaultProvider: "openai",
      defaultModel: "gpt",
      openai: {},
    }))).toEqual({ defaultProvider: "openai", defaultModel: "gpt", providers: { openai: {} } });
    const failure = Effect.runSync(Effect.flip(resolveModelSelectorEffect("missing", configuration)));
    expect(failure).toMatchObject({
      _tag: "ModelSelectionEffectError",
      code: "RELKIT_MODEL_PROVIDER_UNKNOWN",
    });
    expect(
      Effect.runSync(
        resolveModelSelectorEffect("missing", configuration).pipe(
          Effect.catchTag("ModelSelectionEffectError", (error) => Effect.succeed(error.code)),
        ),
      ),
    ).toBe("RELKIT_MODEL_PROVIDER_UNKNOWN");
  });
});
