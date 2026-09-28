import { describe, expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { decideThreadTransition, type ThreadAction, type ThreadStatus } from "../src/index.ts";
import { decideThreadTransitionEffect } from "../src/thread-transition.ts";

const statuses: readonly ThreadStatus[] = [
  "idle",
  "running",
  "approval-interrupted",
  "stopping",
  "worker-interrupted",
];
const actions: readonly ThreadAction[] = ["send", "steer", "follow-up", "stop", "approve", "deny"];

describe("thread transition contract", () => {
  test("defines every declared status/action pair", () => {
    for (const status of statuses) {
      for (const action of actions) expect(decideThreadTransition(status, action)).toBeDefined();
    }
  });

  test("keeps completed segments reusable and uncertain work blocked", () => {
    expect(decideThreadTransition("idle", "send")).toEqual({
      accepted: true,
      nextStatus: "running",
      idempotent: false,
    });
    expect(decideThreadTransition("stopping", "stop")).toEqual({
      accepted: true,
      nextStatus: "stopping",
      idempotent: true,
    });
    expect(decideThreadTransition("worker-interrupted", "send")).toMatchObject({
      accepted: false,
      code: "AGENT_WORKER_INTERRUPTED",
    });
  });

  test("runs the Effect path and records each decision", () => {
    const outcome = Effect.runSync(
      Effect.gen(function* () {
        const before = yield* Metric.snapshot;
        const accepted = yield* decideThreadTransitionEffect("idle", "send");
        const rejected = yield* decideThreadTransitionEffect("running", "send");
        const after = yield* Metric.snapshot;
        const count = (snapshot: typeof after) => {
          const state = snapshot.find(
            (metric) => metric.id === "relkit.agents.thread_transition.total",
          )?.state;
          return state !== undefined && "count" in state && typeof state.count === "number"
            ? state.count
            : 0;
        };
        return { accepted, rejected, before: count(before), after: count(after) };
      }),
    );
    expect(outcome.accepted).toMatchObject({ accepted: true, nextStatus: "running" });
    expect(outcome.rejected).toMatchObject({ accepted: false, code: "AGENT_BUSY" });
    expect(outcome.after).toBe(outcome.before + 2);
  });
});
