import { expect, it } from "@effect/vitest";
import { Cause, Context, Effect, Exit, Fiber, Logger, Metric } from "effect";
import { ExecutionSuccessLogs, observeExecution } from "../src/operation.js";

it.effect("retains successful completion logs by default", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const logger = Logger.make((event) => messages.push(String(event.message)));
    expect(
      yield* observeExecution("runtime", "policy.default", Effect.succeed(42)).pipe(
        Effect.provide(Logger.layer([logger])),
      ),
    ).toBe(42);
    expect(messages).toEqual(["Execution operation completed"]);
  }),
);

it.effect(
  "limits background success logs while retaining child metrics, failures and user logs",
  () =>
    Effect.gen(function* () {
      const registry: Metric.MetricRegistry = new Map();
      const records: { message: string; level: string }[] = [];
      const logger = Logger.make((event) => {
        records.push({ message: String(event.message), level: event.logLevel });
      });
      const failure = new Error("expected provider failure");
      const defect = new Error("provider defect");
      yield* Effect.gen(function* () {
        const child = yield* Effect.forkChild(
          observeExecution(
            "runtime",
            "policy.poll",
            Effect.logInfo("application message").pipe(Effect.as(42)),
          ),
        );
        expect(yield* Fiber.join(child)).toBe(42);
        const failed = yield* Effect.exit(
          observeExecution("runtime", "policy.failure", Effect.fail(failure)),
        );
        expect(Exit.isFailure(failed) && Cause.squash(failed.cause)).toBe(failure);
        const died = yield* Effect.exit(
          observeExecution("runtime", "policy.defect", Effect.die(defect)),
        );
        expect(Exit.isFailure(died) && Cause.squash(died.cause)).toBe(defect);
      }).pipe(
        Effect.provideService(ExecutionSuccessLogs, false),
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.provide(Logger.layer([logger])),
      );
      expect(records).toEqual([
        { message: "application message", level: "Info" },
        { message: "Execution operation failed", level: "Error" },
        { message: "Execution operation failed", level: "Error" },
      ]);
      const snapshots = [...registry.values()];
      const outcomes = snapshots.filter((entry) => entry.id === "relkit_execution_outcomes_total");
      expect(outcomes.map((entry) => entry.attributes?.outcome).sort()).toEqual([
        "defect",
        "failure",
        "success",
      ]);
      expect(outcomes.every((entry) => entry.hooks.get(Context.empty()).count === 1)).toBe(true);
      expect(
        snapshots.filter((entry) => entry.id === "relkit_execution_operations_total"),
      ).toHaveLength(3);
      expect(snapshots.filter((entry) => entry.id === "relkit_execution_duration_ms")).toHaveLength(
        3,
      );
      // A local override never changes the default of another invocation.
      expect(yield* ExecutionSuccessLogs).toBe(true);
    }),
);
