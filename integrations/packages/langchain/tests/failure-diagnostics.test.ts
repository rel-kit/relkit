/** Verifies private native provenance survives sanitization while logs and public fields exclude provider payloads. */
import { Effect, Logger } from "effect";
import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineAgent } from "../src/define-agent.js";
import { agentInvocationFailure } from "../src/runtime-effect-error.js";
import { logAgentFailure } from "../src/runtime-failure-diagnostics.js";
import { modelFailure } from "../src/runtime-utils.js";
import { AgentRuntimeError } from "../src/runtime-errors.js";
import { GraphInterruptedError } from "../src/graph-interruption.js";

const options = {
  agent: defineAgent({
    id: "diagnostics.test",
    input: z.string(),
    output: z.string(),
    instructions: "test",
    tools: [],
    limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 5000 },
  }),
  input: "private-input",
  tools: [],
  engine: { invoke: async () => null },
  invocationId: "invocation-test",
  traceId: "trace-test",
  threadId: "thread-test",
};

test("native provenance is private and bounded diagnostics retain identity and status", async () => {
  const original = Object.assign(new Error("private-provider-message bearer-secret"), {
    name: "RateLimitError",
    status: 429,
    body: "private-body",
  });
  const safe = modelFailure(original, new AbortController().signal);
  expect(safe.cause).toBe(original);
  expect(Object.keys(safe)).not.toContain("cause");
  expect(JSON.stringify(safe)).not.toContain("private");
  const logs: string[] = [];
  await Effect.runPromise(
    logAgentFailure(agentInvocationFailure(safe), options).pipe(
      Effect.provideService(
        Logger.CurrentLoggers,
        new Set([
          Logger.make((event) => {
            logs.push(JSON.stringify(event.message));
          }),
        ]),
      ),
    ),
  );
  expect(logs).toHaveLength(1);
  expect(logs[0]).toContain("RELKIT_AGENT_MODEL_ERROR");
  expect(logs[0]).toContain("RateLimitError");
  expect(logs[0]).toContain("429");
  expect(logs[0]).toContain("invocation-test");
  expect(logs[0]).not.toMatch(/private|bearer-secret/);
});

test("waiting and cancellation do not create failure diagnostics", async () => {
  let calls = 0;
  const logger = Logger.make(() => {
    calls++;
  });
  for (const cause of [
    new GraphInterruptedError("thread-test", []),
    new AgentRuntimeError("RELKIT_AGENT_CANCELLED", "cancelled"),
  ]) {
    await Effect.runPromise(
      logAgentFailure(agentInvocationFailure(cause), options).pipe(
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      ),
    );
  }
  expect(calls).toBe(0);
});

test("unrecognized diagnostic fields cannot disclose provider strings", async () => {
  const cause = Object.assign(new Error("private-message"), { name: "private-name", status: 2.5 });
  const failure = new AgentRuntimeError("private-code", "private-message", undefined, { cause });
  const logs: string[] = [];
  await Effect.runPromise(
    logAgentFailure(agentInvocationFailure(failure), options).pipe(
      Effect.provideService(
        Logger.CurrentLoggers,
        new Set([
          Logger.make((event) => {
            logs.push(JSON.stringify(event.message));
          }),
        ]),
      ),
    ),
  );
  expect(logs).toHaveLength(1);
  expect(logs[0]).toContain("RELKIT_AGENT_INVOCATION_FAILED");
  expect(logs[0]).toContain("unclassified");
  expect(logs[0]).not.toMatch(/private|providerStatus/);
});
