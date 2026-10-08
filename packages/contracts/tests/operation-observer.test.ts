import { expect, it } from "@effect/vitest";
import { Context, Effect, Logger, Metric } from "effect";
import { observeExecution } from "../src/operation-observer.js";
import type { ExecutionDomain } from "../src/operation.types.js";

it.effect("records each standalone consumer owner with declaration-owned labels", () =>
  Effect.gen(function* () {
    const domains: readonly ExecutionDomain[] = [
      "client",
      "inspector",
      "supervisor",
      "testing",
      "cli",
      "generator",
    ];
    const registry: Metric.MetricRegistry = new Map();
    const caller = { domain: "untrusted-id", operation: "untrusted-input", kind: "untrusted-kind" };
    yield* Effect.gen(function* () {
      for (const domain of domains) {
        const value = yield* observeExecution(domain, "test.fixed", Effect.succeed(42), () => ({
          entries: 2,
          invalid: Number.NaN,
          negative: -1,
        }));
        expect(value).toBe(42);
      }
    }).pipe(
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(Metric.CurrentMetricAttributes, caller),
      Effect.provide(Logger.layer([])),
    );
    const snapshots = [...registry.values()];
    expect(
      snapshots.filter((entry) => entry.id === "relkit_execution_operations_total"),
    ).toHaveLength(domains.length);
    expect(
      snapshots.some((entry) => Object.values(entry.attributes ?? {}).includes("untrusted-id")),
    ).toBe(false);
    expect(
      snapshots.some((entry) => Object.values(entry.attributes ?? {}).includes("untrusted-input")),
    ).toBe(false);
    expect(
      snapshots
        .filter((entry) => entry.id === "relkit_execution_workload_total")
        .every((entry) => entry.attributes?.kind === "entries"),
    ).toBe(true);
    // An isolated execution registry does not mutate the caller's attributes or another registry.
    const other = new Map();
    yield* observeExecution("client", "test.fixed", Effect.void).pipe(
      Effect.provideService(Metric.MetricRegistry, other),
      Effect.provide(Logger.layer([])),
    );
    expect(other.size).toBeGreaterThan(0);
    expect(
      Context.get(
        Context.make(Metric.CurrentMetricAttributes, caller),
        Metric.CurrentMetricAttributes,
      ),
    ).toBe(caller);
    expect(
      snapshots
        .filter((entry) => entry.id === "relkit_execution_operations_total")
        .every((entry) => entry.hooks.get(Context.empty()).count === 1),
    ).toBe(true);
  }),
);
