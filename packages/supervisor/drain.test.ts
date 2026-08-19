import { expect, test } from "bun:test";
import { createSupervisorStateMachine } from "./src/state-machine.js";
import { createSupervisorDrain, drainPreviousGeneration } from "./src/drain.js";

const token = { sourceToken: 1, generationToken: 1 } as const;

test("waits for prior work, then closes the candidate and providers exactly once", async () => {
  const closed: string[] = [];
  const drain = createSupervisorDrain({
    token,
    deadlineMs: 100,
    candidate: { token, dispose: async () => closed.push("candidate") },
    providers: [{ id: "provider-a", close: async () => closed.push("provider-a") }],
  });
  const lease = drain.track(token);
  expect(lease).toBeDefined();
  const running = drain.drain();
  expect(drain.acceptingWork).toBe(false);
  lease?.release();
  const report = await running;

  expect(report).toMatchObject({
    token,
    initialInFlight: 1,
    completed: 1,
    interrupted: 0,
    remaining: 0,
    timedOut: false,
    outcome: "drained",
    candidate: "closed",
  });
  expect(report.providers).toEqual([{ id: "provider-a", status: "closed" }]);
  expect(closed).toEqual(["candidate", "provider-a"]);
  expect(await drain.drain()).toBe(report);
});

test("aborts remaining work at the deadline and still bounds cleanup", async () => {
  let interrupted = 0;
  let disposed = 0;
  const drain = createSupervisorDrain({
    token,
    deadlineMs: 5,
    candidate: { token, dispose: () => void (disposed += 1) },
    providers: [{ id: "provider-a", release: () => undefined }],
  });
  const lease = drain.track(token, { interrupt: () => void (interrupted += 1) });
  const draining = drain.drain();
  expect(drain.track(token)).toBeUndefined();
  const report = await draining;

  expect(lease?.signal.aborted).toBe(true);
  expect(interrupted).toBe(1);
  expect(disposed).toBe(1);
  expect(report).toMatchObject({
    initialInFlight: 1,
    interrupted: 1,
    remaining: 1,
    timedOut: true,
    outcome: "timed-out",
  });
  lease?.release();
});

test("finishes the 13.2 drain transition without replacing the active token", async () => {
  const machine = createSupervisorStateMachine({ activeGeneration: token });
  const next = machine.requestSourceChange();
  machine.compileSucceeded(next);
  machine.startSucceeded(next);
  machine.verificationSucceeded(next);
  machine.switchSucceeded(next);

  const report = await drainPreviousGeneration({
    token,
    activeToken: next,
    stateMachine: machine,
    deadlineMs: 20,
  });

  expect(report.stateTransition).toBe("completed");
  expect(machine.snapshot()).toMatchObject({ state: "active", activeGeneration: next });
  expect(machine.snapshot().previousGeneration).toBeUndefined();
});
