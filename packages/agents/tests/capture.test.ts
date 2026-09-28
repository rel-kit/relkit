import { expect, test } from "vitest";
import { Effect, Metric, Tracer } from "effect";
import {
  captureAgentContent,
  captureAgentContentEffect,
  createAgentCapturePolicy,
  createAgentCapturePolicyEffect,
  createAgentSpanCapture,
  createAgentSpanCaptureEffect,
} from "../src/capture.ts";

test("capture policy preserves synchronous behavior and exposes tagged validation errors", () => {
  expect(Effect.runSync(createAgentCapturePolicyEffect(undefined))).toEqual({ mode: "off" });
  expect(createAgentCapturePolicy({ mode: "off" })).toEqual({ mode: "off" });
  const policy = createAgentCapturePolicy({
    mode: "development-redacted",
    maxBytes: 1024,
    redactKeys: ["Private"],
  });
  expect(Object.isFrozen(policy)).toBe(true);
  expect(policy.redactKeys).toContain("private");
  for (const [value, message] of [
    [{ mode: "unknown" }, "Agent capture mode must be off or development-redacted"],
    [
      { mode: "development-redacted", maxBytes: 0 },
      "Agent capture maxBytes must be a positive safe integer",
    ],
    [
      { mode: "development-redacted", maxBytes: 1, redactKeys: [0] },
      "Agent capture redactKeys must be text values",
    ],
  ] as const) {
    const error = Effect.runSync(Effect.flip(createAgentCapturePolicyEffect(value as never)));
    expect(error).toMatchObject({ _tag: "AgentCapturePolicyError", message });
    expect(() => createAgentCapturePolicy(value as never)).toThrow(new TypeError(message));
  }
});

test("capture content redacts, bounds, and marks serialization failures", () => {
  const policy = createAgentCapturePolicy({ mode: "development-redacted", maxBytes: 1024 });
  const record = Effect.runSync(
    captureAgentContentEffect({ token: "secret", note: "Bearer abc" }, policy),
  );
  expect(record).toMatchObject({
    mode: "development-redacted",
    truncated: false,
    content: { token: "[REDACTED]", note: "Bearer [REDACTED]" },
  });
  expect(Object.isFrozen(record)).toBe(true);
  expect(captureAgentContent(undefined, policy)).toBeUndefined();
  expect(captureAgentContent("value", { mode: "off" })).toBeUndefined();
  expect(captureAgentContent([null, 1, { password: "secret" }], policy)?.content).toEqual([
    null,
    1,
    { password: "[REDACTED]" },
  ]);
  expect(captureAgentContent("too long", { ...policy, maxBytes: 1 })).toMatchObject({
    bytes: 1,
    truncated: true,
  });
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  expect(captureAgentContent(cyclic, policy)).toMatchObject({ bytes: 0, truncated: true });
  expect(
    captureAgentContent(
      { PRIVATE_field: "secret" },
      {
        ...policy,
        redactKeys: ["private"],
      },
    )?.content,
  ).toEqual({ PRIVATE_field: "[REDACTED]" });
});

test("span capture and Effect telemetry cover success and failure", () => {
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
        const policy = yield* createAgentCapturePolicyEffect({
          mode: "development-redacted",
          maxBytes: 1,
        });
        const input = yield* captureAgentContentEffect("long", policy);
        const combined = yield* createAgentSpanCaptureEffect(input, undefined);
        const failure = yield* Effect.flip(
          createAgentCapturePolicyEffect({ mode: "development-redacted" }),
        );
        const after = yield* Metric.snapshot;
        return { before, after, combined, failure };
      }),
      tracer,
    ),
  );
  expect(result.combined?.input?.truncated).toBe(true);
  expect(result.failure._tag).toBe("AgentCapturePolicyError");
  expect(metricCount(result.after, "relkit.agents.capture.policy.failure.total")).toBe(
    metricCount(result.before, "relkit.agents.capture.policy.failure.total") + 1,
  );
  expect(metricCount(result.after, "relkit.agents.capture.content.truncated.total")).toBe(
    metricCount(result.before, "relkit.agents.capture.content.truncated.total") + 1,
  );
  expect(spans.map(({ name }) => name)).toContain("Agents.capture.policy");
  expect(spans.map(({ name }) => name)).toContain("Agents.capture.content");
  expect(spans.map(({ name }) => name)).toContain("Agents.capture.span");
  expect(createAgentSpanCapture(undefined, undefined)).toBeUndefined();
  expect(createAgentSpanCapture(undefined, result.combined?.input)?.output).toBe(
    result.combined?.input,
  );
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
