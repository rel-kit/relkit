import { Effect, Metric, Tracer } from "effect";
import { expect, test } from "vitest";
import {
  copyAgentChat,
  copyAgentChatEffect,
  copyAgentControls,
  copyAgentControlsEffect,
} from "../src/agent-client.ts";

test("copies canonical controls and chat mappings", () => {
  expect(Effect.runSync(copyAgentControlsEffect(undefined))).toBeUndefined();
  expect(Effect.runSync(copyAgentChatEffect(undefined))).toBeUndefined();
  expect(copyAgentControls(["stop", "approve"])).toEqual(["stop", "approve"]);
  expect(Object.isFrozen(copyAgentControls(["stop"]))).toBe(true);
  const mapping = { input: "message", output: "answer" };
  expect(Effect.runSync(copyAgentChatEffect(mapping))).toEqual(mapping);
  expect(copyAgentChat(mapping)).toEqual(mapping);
  expect(Object.isFrozen(copyAgentChat(mapping))).toBe(true);
});

test("invalid controls and chat fail by tag and preserve TypeError adapters", () => {
  for (const [value, message] of [
    ["stop", "Agent controls must be an array"],
    [["unknown"], "Agent controls contain an unsupported capability"],
    [["stop", "stop"], "Agent controls must be unique"],
  ] as const) {
    const error = Effect.runSync(Effect.flip(copyAgentControlsEffect(value)));
    expect(error).toMatchObject({ _tag: "AgentClientPolicyError", operation: "controls", message });
    expect(() => copyAgentControls(value)).toThrow(new TypeError(message));
  }
  const error = Effect.runSync(
    Effect.flip(copyAgentChatEffect({ input: "question", output: "answer" })),
  );
  expect(error).toMatchObject({ _tag: "AgentClientPolicyError", operation: "chat" });
  expect(() => copyAgentChat({ input: "question", output: "answer" })).toThrow(TypeError);
});

test("controls and chat have named spans and count failures", () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const result = Effect.runSync(
    Effect.withTracer(
      Effect.gen(function* () {
        const before = yield* Metric.snapshot;
        yield* copyAgentControlsEffect(["stop"]);
        yield* Effect.flip(copyAgentChatEffect(null));
        const after = yield* Metric.snapshot;
        return { before, after };
      }),
      tracer,
    ),
  );
  expect(spans.map(({ name }) => name)).toContain("Agents.clientPolicy.controls");
  expect(spans.map(({ name }) => name)).toContain("Agents.clientPolicy.chat");
  expect(metricCount(result.after, "relkit.agents.client_policy.failure.total")).toBe(
    metricCount(result.before, "relkit.agents.client_policy.failure.total") + 1,
  );
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
