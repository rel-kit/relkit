import { expect, it } from "@effect/vitest";
import { Context, Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { createExecutionEvidence } from "../fixtures/execution-evidence.ts";
import { runBunFixture } from "../fixtures/bun-process.js";

it.effect("records each public runtime/job/event/HTTP release once including finalizers", () =>
  Effect.gen(function* () {
    const result = yield* runBunFixture(
      new URL("../fixtures/close-observation.ts", import.meta.url).pathname,
    );
    expect(result.stdout).toContain("RELKIT_NATIVE_CLOSE_OBSERVATION_OK");
  }),
);

it.effect("substitutes isolated test observability without sharing execution evidence", () =>
  Effect.gen(function* () {
    const first = createExecutionEvidence();
    const second = createExecutionEvidence();
    const work = observeExecution("testing", "fixture.invoke", Effect.succeed(42));

    expect(yield* work.pipe(Effect.provide(first.layer))).toBe(42);
    expect(first.registry.size).toBeGreaterThan(0);
    expect(second.registry.size).toBe(0);
    const firstOperations = [...first.registry.values()].find(
      (entry) => entry.id === "relkit_execution_operations_total",
    );
    expect(firstOperations?.hooks.get(Context.empty()).count).toBe(1);
    expect(yield* work.pipe(Effect.provide(second.layer))).toBe(42);
    expect(firstOperations?.hooks.get(Context.empty()).count).toBe(1);
    expect(second.registry.size).toBeGreaterThan(0);
    expect(second.registry).not.toBe(first.registry);
    expect(
      [...second.registry.values()].every((entry) => entry.attributes?.domain === "testing"),
    ).toBe(true);
  }),
);

it.live("uses the same observability Layer in a live consumer run", () =>
  Effect.gen(function* () {
    const evidence = createExecutionEvidence();
    const result = yield* observeExecution("testing", "fixture.invoke", Effect.succeed(42)).pipe(
      Effect.provide(evidence.layer),
    );
    expect(result).toBe(42);
    expect(evidence.registry.size).toBeGreaterThan(0);
  }),
);
