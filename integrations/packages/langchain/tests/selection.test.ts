/**
 * Proves that generic descriptors still execute natively and ordinary execution
 * avoids the optional DeepAgents loader. Installed-module failures retain identity.
 */
import { defineAgent } from "@relkit/agents";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import { invokeAgent } from "../src/runtime.js";
import { createNativeAgentEffect } from "../src/runtime-native-agent.js";
import { NativeToolIdentityLive } from "../src/runtime-native-tools-identity.js";
import { DeepAgentsLoader, loadDeepAgentsEffect } from "../src/runtime-native-support.js";
import { createTestModel } from "./test-model.js";

const agent = defineAgent({
  id: "selection",
  input: z.object({ prompt: z.string() }),
  output: z.object({ answer: z.string() }),
  model: "test:model",
  instructions: "Answer briefly.",
  tools: [],
  limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 1000 },
});

test("generic authored agent retains native execution and validation", async () => {
  const { model } = createTestModel([{ type: "final", output: { answer: "selected" } }]);
  const output = await invokeAgent({
    agent,
    input: { prompt: "hello" },
    tools: [],
    engine: { invoke: () => Promise.reject(new Error("No tool was requested")) },
    modelRegistry: { resolveModel: () => ({ id: "test:model", model }) },
  });
  expect(output).toEqual({ answer: "selected" });
});

test("ordinary_agent_without_deepagents", async () => {
  let loads = 0;
  const loader = Layer.succeed(DeepAgentsLoader, {
    load: () => {
      loads += 1;
      return Promise.reject(new Error("Unused peer must not load"));
    },
  });
  const { model } = createTestModel([{ type: "final", output: { answer: "native" } }]);
  const native = await Effect.runPromise(
    createNativeAgentEffect({
      runtime: {
        agent,
        input: { prompt: "hello" },
        tools: [],
        engine: { invoke: () => Promise.reject(new Error("Unused tool")) },
      },
      model,
      signal: new AbortController().signal,
      maxOutputBytes: 1024,
      invocationId: "selection",
      traceId: "selection",
    }).pipe(Effect.provide(Layer.merge(loader, NativeToolIdentityLive))),
  );
  expect(native.agent).toBeDefined();
  expect(loads).toBe(0);
});

test("nested_sdk_failure preserves the installed module cause", async () => {
  const cause = new Error("Installed DeepAgents initialization failed", {
    cause: new Error("Nested dependency failed"),
  });
  const result = await Effect.runPromise(
    loadDeepAgentsEffect().pipe(
      Effect.provideService(DeepAgentsLoader, { load: () => Promise.reject(cause) }),
      Effect.result,
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.cause).toBe(cause);
});
