import { z } from "@relkit/schema";
import { MemorySaver } from "@langchain/langgraph";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { defineAgent } from "../src/define-agent.js";
import { defineCheckpointerDb } from "../src/define-persistence.js";
import { runAgentLoopEffect } from "../src/runtime-loop.js";
import { createTestModel } from "./test-model.js";

const agent = defineAgent({
  id: "loop",
  input: z.object({ prompt: z.string() }),
  output: z.object({ answer: z.string() }),
  model: "default",
  instructions: "Answer briefly.",
  tools: [],
  limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 1000 },
});
const options = { agent, tools: [], engine: {} } as never;
const input = { prompt: "hello" };

test("native loop Effect tags an invalid resume request", async () => {
  const model = createTestModel([{ type: "final", output: { answer: "ok" } }]).model;
  const failure = await Effect.runPromise(
    Effect.result(
      runAgentLoopEffect(
        { ...options, resume: true },
        model,
        "default",
        new AbortController().signal,
        input,
        1024,
        1024,
        "invoke",
        "trace",
        {} as never,
      ),
    ),
  );
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("AgentInvocationFailure");
});

test("interrupting the exported loop Effect rolls back persistence acquisition", async () => {
  const controller = new AbortController();
  let markStarted!: () => void;
  let finishFactory!: (value: MemorySaver) => void;
  let markDisposed!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const factory = new Promise<MemorySaver>((resolve) => {
    finishFactory = resolve;
  });
  const disposed = new Promise<void>((resolve) => {
    markDisposed = resolve;
  });
  const checkpointer = defineCheckpointerDb({
    id: "loop.persistence",
    client: () => {
      markStarted();
      return factory;
    },
    dispose: () => {
      markDisposed();
    },
  });
  const model = createTestModel([{ type: "final", output: { answer: "unused" } }]).model;
  const running = Effect.runPromise(
    runAgentLoopEffect(
      { ...options, agent: { ...agent, checkpointer } },
      model,
      "test",
      controller.signal,
      input,
      1024,
      1024,
      "invoke",
      "trace",
      {} as never,
    ),
    { signal: controller.signal },
  );
  await started;
  controller.abort(new Error("stopped"));
  finishFactory(new MemorySaver());
  await expect(running).rejects.toBeDefined();
  await disposed;
});
