import { z } from "@relkit/schema";
import { Effect, Metric, Tracer } from "effect";
import { expect, test } from "vitest";
import { copyAgentClientPolicy, copyAgentClientPolicyEffect } from "../src/agent-client.ts";

test("copies public and guarded client policies through Effect and sync adapters", () => {
  const allowed = new Set(["answer"]);
  expect(Effect.runSync(copyAgentClientPolicyEffect(undefined, allowed))).toBeUndefined();
  const result = Effect.runSync(
    copyAgentClientPolicyEffect(
      {
        public: true,
        state: ["answer"],
        events: { completed: z.string() },
      },
      allowed,
    ),
  );
  expect(result).toMatchObject({ public: true, state: ["answer"] });
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result?.state)).toBe(true);
  expect(Object.isFrozen(result?.events)).toBe(true);
  const authorize = () => true;
  expect(copyAgentClientPolicy({ authorize }, allowed)).toMatchObject({ authorize });
});

test("reports malformed client policy cases by tag with original TypeError messages", () => {
  const allowed = new Set(["answer"]);
  const cases = [
    [null, "Agent client policy must be an object"],
    [{}, "Agent client policy requires exactly one of public or authorize"],
    [
      { public: true, authorize: () => true },
      "Agent client policy requires exactly one of public or authorize",
    ],
    [
      { public: true, state: "answer" },
      "Agent client state must be an array of middleware state keys",
    ],
    [{ public: true, state: ["answer", "answer"] }, "Agent client state must be unique"],
    [{ public: true, state: ["other"] }, 'Agent client state key "other" is not declared'],
    [{ public: true, events: [] }, "Agent client events must be an object"],
    [
      { public: true, events: { "": z.string() } },
      'Agent client event "" must be a Standard Schema v1 validator',
    ],
    [
      { public: true, events: { bad: {} } },
      'Agent client event "bad" must be a Standard Schema v1 validator',
    ],
  ] as const;
  const result = Effect.runSync(
    Effect.gen(function* () {
      const before = yield* Metric.snapshot;
      const errors = [];
      for (const [value] of cases)
        errors.push(yield* Effect.flip(copyAgentClientPolicyEffect(value, allowed)));
      const after = yield* Metric.snapshot;
      return { before, after, errors };
    }),
  );
  for (const [index, [value, message]] of cases.entries()) {
    expect(result.errors[index]).toMatchObject({
      _tag: "AgentClientPolicyError",
      operation: "policy",
      message,
    });
    expect(() => copyAgentClientPolicy(value, allowed)).toThrow(new TypeError(message));
  }
  expect(metricCount(result.after, "relkit.agents.client_policy.failure.total")).toBe(
    metricCount(result.before, "relkit.agents.client_policy.failure.total") + cases.length,
  );
});

test("client policy copies emit a stable span", () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  Effect.runSync(Effect.withTracer(copyAgentClientPolicyEffect({ public: true }), tracer));
  expect(spans.map(({ name }) => name)).toEqual(["Agents.clientPolicy.copy"]);
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
