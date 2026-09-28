import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import { defineAgent } from "../src/define-agent.js";
import { createNativeAgentEffect } from "../src/runtime-native-agent.js";
import { NativeToolIdentity } from "../src/runtime-native-tools.js";
import { DeepAgentsLoader } from "../src/runtime-native-support.js";
import { createTestModel } from "./test-model.js";

const services = Layer.merge(
  Layer.succeed(NativeToolIdentity, NativeToolIdentity.of({ randomUUID: () => "call-fixed" })),
  Layer.succeed(DeepAgentsLoader, DeepAgentsLoader.of({ load: () => Promise.reject(new Error("not used")) })),
);
const agent = defineAgent({
  id: "native", input: z.object({ prompt: z.string() }), output: z.object({ answer: z.string() }),
  model: "default", instructions: "Answer briefly.", tools: [],
  limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 1000 },
});

test("native agent Effect builds a runnable with injected services", async () => {
  const model = createTestModel([{ type: "final", output: { answer: "ok" } }]).model;
  const created = await Effect.runPromise(Effect.provide(createNativeAgentEffect({
    runtime: { agent, tools: [], engine: {} as never },
    model, signal: new AbortController().signal,
    maxOutputBytes: 1024, invocationId: "invoke", traceId: "trace",
  }), services));
  expect(created.agent).toBeDefined();
  expect(created.tools.values).toHaveLength(0);
});

test("native agent Effect tags an unregistered authored tool", async () => {
  const invalid = { ...agent, tools: [{ ref: { kind: "tool", id: "missing" } }] } as never;
  const result = await Effect.runPromise(Effect.result(Effect.provide(createNativeAgentEffect({
    runtime: { agent: invalid, tools: [], engine: {} as never },
    model: "default", signal: new AbortController().signal,
    maxOutputBytes: 1024, invocationId: "invoke", traceId: "trace",
  }), services)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentInvocationFailure");
});
