/** Exercises native signal effect behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import {
  acquireExecutionSignalEffect,
  createExecutionSignalEffect,
  ExecutionSignalClock,
  withSignalEffect,
} from "../src/signal.js";
import { defineAgent } from "../src/define-agent.js";
import { z } from "@relkit/schema";

const options = {
  agent: defineAgent({
    id: "signal.fixture",
    input: z.string(),
    output: z.string(),
    instructions: "Exercise cancellation.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 500 },
  }),
  input: "fixture",
  tools: [],
  engine: { invoke: () => Promise.reject(new Error("No tool expected")) },
};

test("execution signal Effect uses a replaceable clock and clears its timer once", () => {
  let deadline!: () => void;
  let delay = -1;
  let clears = 0;
  const clock = Layer.succeed(
    ExecutionSignalClock,
    ExecutionSignalClock.of({
      now: () => 100,
      setTimeout: (callback, delayMs) => {
        deadline = callback;
        delay = delayMs;
        return 1;
      },
      clearTimeout: () => {
        clears += 1;
      },
    }),
  );
  const active = Effect.runSync(Effect.provide(createExecutionSignalEffect(options), clock));
  expect(delay).toBe(500);
  deadline();
  expect(active.signal.reason.code).toBe("RELKIT_AGENT_TIMEOUT");
  active.close();
  active.close();
  expect(clears).toBe(1);

  Effect.runSync(Effect.scoped(Effect.provide(acquireExecutionSignalEffect(options), clock)));
  expect(clears).toBe(2);
});

test("execution signal Effect tags invalid deadlines", () => {
  const clock = Layer.succeed(
    ExecutionSignalClock,
    ExecutionSignalClock.of({
      now: () => 100,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    }),
  );
  const failure = Effect.runSync(
    Effect.result(
      Effect.provide(createExecutionSignalEffect({ ...options, timeoutMs: -1 }), clock),
    ),
  );
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure)) expect(failure.failure._tag).toBe("AgentInvocationFailure");
});

test("interrupting withSignalEffect rejects pending work", async () => {
  const controller = new AbortController();
  const pending = new Promise<never>(() => undefined);
  const running = Effect.runPromise(withSignalEffect(pending, controller.signal), {
    signal: controller.signal,
  });
  controller.abort();
  await expect(running).rejects.toBeDefined();
});
