import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import type { LogRecord } from "@relkit/runtime-effect/logger";
import { createActivationLayer, SupervisorActivation } from "../../src/activation.js";
import { createSupervisorStateMachine } from "../../src/state-machine.js";

it.effect("rejects illegal phase order as a typed failure without changing state", () =>
  Effect.gen(function* () {
    const service = yield* SupervisorActivation;
    const token = yield* service.sourceChanged();
    const exit = yield* Effect.exit(service.activate(token));
    expect(
      Exit.isFailure(exit) &&
        exit.cause.reasons.some(
          (reason) =>
            reason._tag === "Fail" &&
            reason.error instanceof Error &&
            reason.error.message ===
              "Supervisor cannot transition from compiling-candidate; expected switching.",
        ),
    ).toBe(true);
    expect(yield* service.snapshot).toMatchObject({
      state: "compiling-candidate",
      candidate: token,
    });
  }).pipe(
    Effect.provide(createActivationLayer()),
    Effect.provide(createLoggerLayer({ human: false, json: false })),
  ),
);

it.effect("concurrent source changes have unique atomic tokens and reject stale completions", () =>
  Effect.gen(function* () {
    const service = yield* SupervisorActivation;
    const tokens = yield* Effect.forEach(
      Array.from({ length: 1_000 }),
      () => service.sourceChanged(),
      { concurrency: 40 },
    );
    expect(new Set(tokens.map((token) => token.sourceToken)).size).toBe(1_000);
    expect(new Set(tokens.map((token) => token.generationToken)).size).toBe(1_000);
    const first = tokens.find((token) => token.sourceToken === 1);
    const last = (yield* service.snapshot).candidate;
    if (first === undefined || last === undefined) throw new Error("Missing candidate");
    expect(yield* service.complete("compile", first, true)).toBe(false);
    expect(yield* service.complete("compile", last, true)).toBe(true);
    expect(yield* service.snapshot).toMatchObject({ state: "starting-candidate", candidate: last });
  }).pipe(
    Effect.provide(createActivationLayer()),
    Effect.provide(createLoggerLayer({ human: false, json: false })),
    Effect.provideService(Metric.MetricRegistry, new Map()),
  ),
);

it.effect("listener reentrancy observes a committed switch and preserves newer source state", () =>
  Effect.sync(() => {
    const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
    const first = machine.requestSourceChange();
    machine.compileSucceeded(first);
    machine.startSucceeded(first);
    machine.verificationSucceeded(first);
    let notified = 0;
    const sequences: number[] = [];
    const unsubscribe = machine.subscribe((event) => {
      sequences.push(event.sequence);
      if (event.type === "outcome" && event.outcome === "switch-succeeded") {
        notified++;
        expect(machine.snapshot().activeGeneration).toEqual(first);
        machine.requestSourceChange();
      }
    });
    expect(machine.switchSucceeded(first)).toBe(true);
    expect(notified).toBe(1);
    expect(machine.state).toBe("compiling-candidate");
    expect(machine.snapshot().activeGeneration).toEqual(first);
    expect(machine.snapshot().candidate?.sourceToken).toBe(2);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    unsubscribe();
    unsubscribe();
  }),
);

it.effect("configured logs and metrics preserve redaction, threshold and domain failure", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const registry: Metric.MetricRegistry = new Map();
    const configured = Layer.mergeAll(
      createActivationLayer(),
      createLoggerLayer({
        minimumLevel: "error",
        json: false,
        human: { write: (_line, record) => records.push(record) },
      }),
    );
    yield* Effect.gen(function* () {
      const service = yield* SupervisorActivation;
      const token = yield* service.sourceChanged();
      expect(yield* service.complete("compile", token, false, "password=raw-secret")).toBe(true);
      expect(yield* service.snapshot).toMatchObject({ state: "idle", activeGeneration: undefined });
    }).pipe(Effect.provide(configured), Effect.provideService(Metric.MetricRegistry, registry));
    expect(records).toHaveLength(1);
    expect(records[0]?.level).toBe("error");
    expect(records[0]?.fields.outcome).toBe("failure");
    expect(JSON.stringify(records)).not.toContain("raw-secret");
    const outcomes = [...registry.values()].filter(
      (entry) =>
        entry.id === "relkit_execution_outcomes_total" && entry.attributes?.domain === "supervisor",
    );
    expect(outcomes.map((entry) => entry.attributes?.outcome).sort()).toEqual([
      "failure",
      "success",
    ]);
  }),
);

it.effect("boundary tokens preserve validation messages and getter failures remain defects", () =>
  Effect.sync(() => {
    const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
    expect(() => machine.compileSucceeded({ sourceToken: 0, generationToken: 1 })).toThrow(
      "Supervisor source tokens must be positive safe integers.",
    );
    expect(() =>
      machine.compileSucceeded({ sourceToken: 1, generationToken: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow("Supervisor generation tokens must be positive safe integers.");
    const defect = new Error("getter defect");
    const token = {
      get sourceToken(): number {
        throw defect;
      },
      generationToken: 1,
    };
    let caught: unknown;
    try {
      machine.compileSucceeded(token);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(defect);
  }),
);
