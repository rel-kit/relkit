/** Direct tool services retain outcome/duration/workload evidence without emitting private inputs. */
import { expect, it } from "@effect/vitest";
import { Effect, Layer, Logger, Metric } from "effect";
import { LocalWorkerError } from "@relkit/observability/local/worker-contract";
import { InspectorHistory } from "../src/history.service.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";

/** A method failure is injected independently from successful service acquisition. */
function historyNative(fail: () => boolean) {
  return Layer.succeed(InspectorHistoryNative, {
    acquire: () =>
      Effect.succeed({
        pid: undefined,
        close: () => Effect.void,
        call: () =>
          fail()
            ? Effect.fail(
                new LocalWorkerError({
                  reason: "worker",
                  message: "synthetic-private-value",
                }),
              )
            : Effect.succeed(undefined),
      }),
  });
}

it.effect("direct history methods instrument success and native failure with fixed labels", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const logs: string[] = [];
    const details: string[] = [];
    let fail = false;
    const native = historyNative(() => fail);
    yield* Effect.scoped(
      Effect.gen(function* () {
        const history = yield* InspectorHistory.make("/private/never-emit", "project");
        yield* history.call({ type: "flush" });
        fail = true;
        yield* Effect.exit(history.call({ type: "flush" }));
      }),
    ).pipe(
      Effect.provide(native),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provide(
        Logger.layer([
          Logger.make((event) => {
            logs.push(String(event.message));
            details.push(JSON.stringify(event.message));
          }),
        ]),
      ),
    );
    const entries = [...registry.values()].filter(
      (entry) => entry.attributes?.operation === "history.flush",
    );
    expect(
      entries
        .filter((entry) => entry.id === "relkit_execution_outcomes_total")
        .map((entry) => entry.attributes?.outcome)
        .sort(),
    ).toEqual(["failure", "success"]);
    expect(entries.some((entry) => entry.id === "relkit_execution_duration_ms")).toBe(true);
    expect(entries.some((entry) => entry.id === "relkit_execution_workload_total")).toBe(true);
    expect(logs).toContain("Execution operation completed");
    expect(logs).toContain("Execution operation failed");
    expect(JSON.stringify(logs)).not.toContain("synthetic-private-value");
    expect(details.join("\n")).toContain('"reason":"worker"');
    expect(details.join("\n")).toContain('"failure":"history.unavailable"');
    expect(details.join("\n")).not.toContain("synthetic-private-value");
    expect(JSON.stringify(entries.map((entry) => entry.attributes))).not.toContain("/private/");
  }),
);
