import { describe, expect, test } from "bun:test";
import { decideThreadTransition, type ThreadAction, type ThreadStatus } from "./src/index.ts";

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
});
