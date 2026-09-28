import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineAgent } from "../src/define-agent.js";
import {
  assertAgentDescriptor,
  assertAgentDescriptorEffect,
  isAgentDescriptorEffect,
  normalizeAgentModelEffect,
} from "../src/define-agent-validation.js";

test("agent descriptor Effects accept valid authoring output", () => {
  const agent = defineAgent({
    id: "validated.agent",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    instructions: "Answer.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1000 },
  });
  expect(Effect.runSync(isAgentDescriptorEffect(agent))).toBe(true);
  expect(Effect.runSync(assertAgentDescriptorEffect(agent))).toBeUndefined();
  expect(Effect.runSync(normalizeAgentModelEffect(undefined))).toBeUndefined();
});

test("descriptor Effect exposes a tagged failure and adapter preserves TypeError", () => {
  const result = Effect.runSync(Effect.result(assertAgentDescriptorEffect({ kind: "agent" })));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentDefinitionFailure");
  expect(() => assertAgentDescriptor({ kind: "agent" })).toThrow(TypeError);
});
