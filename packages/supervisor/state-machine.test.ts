import { expect, test } from "bun:test";
import { SUPERVISOR_STATES, createSupervisorStateMachine } from "./src/state-machine.js";

test("runs the activation states and drains the previous generation", () => {
  const machine = createSupervisorStateMachine();
  expect(machine.state).toBe("idle");
  expect(SUPERVISOR_STATES).toEqual([
    "idle",
    "compiling-candidate",
    "starting-candidate",
    "verifying-hash-and-readiness",
    "switching",
    "draining-previous",
    "active",
  ]);

  const first = machine.requestSourceChange();
  expect(machine.compileSucceeded(first)).toBe(true);
  expect(machine.startSucceeded(first)).toBe(true);
  expect(machine.verificationSucceeded(first)).toBe(true);
  expect(machine.switchSucceeded(first)).toBe(true);
  expect(machine.state).toBe("active");

  const second = machine.requestSourceChange();
  expect(second.sourceToken).toBeGreaterThan(first.sourceToken);
  expect(second.generationToken).toBeGreaterThan(first.generationToken);
  machine.compileSucceeded(second);
  machine.startSucceeded(second);
  machine.verificationSucceeded(second);
  machine.switchSucceeded(second);
  expect(machine.state).toBe("draining-previous");
  expect(machine.snapshot().previousGeneration).toEqual(first);
  machine.drainSucceeded(second);
  expect(machine.snapshot()).toMatchObject({ state: "active", previousGeneration: undefined });
});

test("records failures without adding failure states or replacing active traffic", () => {
  const machine = createSupervisorStateMachine();
  const first = machine.requestSourceChange();
  expect(machine.compileFailed(first, new Error("invalid source"))).toBe(true);
  expect(machine.state).toBe("idle");
  expect(machine.telemetry.at(-2)).toMatchObject({
    type: "outcome",
    outcome: "compile-failed",
    returnState: "idle",
  });

  const active = createSupervisorStateMachine({
    activeGeneration: { sourceToken: 3, generationToken: 3 },
  });
  const candidate = active.requestSourceChange();
  active.compileSucceeded(candidate);
  active.startFailed(candidate, "startup failed");
  expect(active.state).toBe("active");
  expect(active.snapshot().activeGeneration).toEqual({ sourceToken: 3, generationToken: 3 });
  expect(active.telemetry.at(-2)).toMatchObject({
    type: "outcome",
    outcome: "start-failed",
    returnState: "active",
  });
});

test("ignores stale candidate completions and emits an outcome", () => {
  const machine = createSupervisorStateMachine();
  const oldCandidate = machine.requestSourceChange();
  const currentCandidate = machine.requestSourceChange();

  expect(machine.compileSucceeded(oldCandidate)).toBe(false);
  expect(machine.state).toBe("compiling-candidate");
  expect(machine.telemetry.at(-1)).toMatchObject({
    type: "outcome",
    outcome: "candidate-stale",
    sourceToken: oldCandidate.sourceToken,
  });
  expect(machine.compileSucceeded(currentCandidate)).toBe(true);
});
