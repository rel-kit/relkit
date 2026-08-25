import { describe, expect, test } from "bun:test";
import { z } from "@zsys/schema";
import { defineAgent, invokeAgent } from "./src/index.ts";
import { parseModelProviderConfiguration, resolveModelSelector } from "./src/model-selection.ts";
import { createTestModel } from "./test-model.ts";

const configuration = parseModelProviderConfiguration({
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  openai: {},
  anthropic: { defaultModel: "claude-sonnet-4-5" },
});

describe("offline AI SDK v7 model matrix", () => {
  for (const entry of [
    { name: "OpenAI global default", selector: undefined, id: "openai:gpt-5-mini" },
    {
      name: "Anthropic provider default",
      selector: "anthropic",
      id: "anthropic:claude-sonnet-4-5",
    },
    {
      name: "Exact Anthropic model",
      selector: "anthropic:claude-haiku",
      id: "anthropic:claude-haiku",
    },
  ] as const) {
    test(entry.name, async () => {
      const [provider, modelId] = entry.id.split(":");
      const model = createTestModel([{ type: "final", output: { answer: entry.id } }], {
        provider,
        modelId,
      });
      const selected: unknown[] = [];
      const agent = defineAgent({
        id: `matrix.${entry.name.toLowerCase().replaceAll(" ", ".")}`,
        input: z.object({ question: z.string() }),
        output: z.object({ answer: z.string() }),
        ...(entry.selector === undefined ? {} : { model: entry.selector }),
        instructions: "Return the selected model ID.",
        tools: [],
        limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
      });

      await expect(
        invokeAgent({
          agent,
          tools: [],
          engine: { invoke: async () => undefined },
          modelRegistry: {
            resolveModel: (selector?: string) => {
              selected.push(selector);
              const resolved = resolveModelSelector(selector, configuration);
              if (resolved.id !== entry.id) throw new Error("wrong offline model selected");
              return { provider: resolved.provider, id: resolved.id, model: model.model };
            },
          },
          input: { question: "offline" },
        }),
      ).resolves.toEqual({ answer: entry.id });
      expect(selected).toEqual([entry.selector]);
      expect(model.calls).toHaveLength(1);
    });
  }
});
