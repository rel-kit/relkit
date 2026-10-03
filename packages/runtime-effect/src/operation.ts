import { Cause, Clock, Effect, Exit, Metric } from "effect";
import type {
  ExecutionDomain,
  ExecutionOutcome,
  ExecutionTerminalPolicy,
  ExecutionWorkload,
} from "./operation.types.js";

export type {
  ExecutionDomain,
  ExecutionOutcome,
  ExecutionTerminalPolicy,
  ExecutionWorkload,
} from "./operation.types.js";

const calls = Metric.counter("relkit_execution_operations_total", { incremental: true });

const outcomes = Metric.counter("relkit_execution_outcomes_total", { incremental: true });

const duration = Metric.histogram("relkit_execution_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000, 10000],
});

const workloads = Metric.counter("relkit_execution_workload_total", { incremental: true });

/**
 * Observes a lazy domain operation using the caller's logger, tracer and metric registry.
 * @typeParam A - Successful value.
 * @typeParam E - Expected typed failures.
 * @typeParam R - Required services.
 * @param domain - Fixed package owner.
 * @param operation - Declaration-owned operation label; never a path, ID or input value.
 * @param effect - Lazy operation, normally defined with a named Effect.fn.
 * @param workload - Lazy bounded workload counts evaluated once when execution starts.
 * @param terminal - Terminal decision or domain outcome override; false for suspension.
 * @returns An effect preserving the original value, failure, defect and interruption.
 * @remarks Observation failures are isolated. Compatibility adapters must not count again.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { observeExecution } from "@relkit/runtime-effect";
 * const inspect = Effect.fn("Runtime.inspect")((values: readonly number[]) =>
 *   observeExecution("runtime", "inspect", Effect.succeed(values.length),
 *     () => ({ entries: values.length })));
 * const count = await Effect.runPromise(inspect([1, 2]));
 * ```
 */
export function observeExecution<A, E, R>(
  domain: ExecutionDomain,
  operation: string,
  effect: Effect.Effect<A, E, R>,
  workload: () => ExecutionWorkload = () => ({}),
  terminal: ExecutionTerminalPolicy<A, E> = () => true,
): Effect.Effect<A, E, R> {
  const attributes = { domain, operation };
  return Effect.gen(function* () {
    const start = yield* Effect.exit(Clock.monotonicTimeNanos);
    if (Exit.isFailure(start) && Cause.hasInterruptsOnly(start.cause))
      return yield* Effect.failCause(start.cause);
    const started = Exit.isSuccess(start) ? start.value : undefined;
    yield* isolateObservation(
      Effect.gen(function* () {
        yield* Effect.withFiber((fiber) => {
          // Metric.update delegates to this synchronous mutation with the same
          // context. Batch telemetry bookkeeping without entering the run loop
          // for each counter; registry and inherited metric attributes stay local.
          Metric.withAttributes(calls, attributes).updateUnsafe(1, fiber.context);
          for (const [kind, count] of Object.entries(workload())) {
            if (Number.isFinite(count) && count >= 0)
              Metric.withAttributes(workloads, { ...attributes, kind }).updateUnsafe(
                count,
                fiber.context,
              );
          }
          return Effect.void;
        });
        yield* Effect.annotateCurrentSpan({
          "execution.domain": domain,
          "execution.operation": operation,
        });
      }),
    );
    return yield* Effect.onExit(effect, (exit) =>
      isolateObservation(
        Effect.gen(function* () {
          const decision = terminal(exit);
          if (decision === false) return;
          const outcome = typeof decision === "string" ? decision : operationOutcome(exit);
          const end = yield* Effect.exit(Clock.monotonicTimeNanos);
          const elapsed =
            started !== undefined && Exit.isSuccess(end)
              ? Math.max(0, Number(end.value - started) / 1_000_000)
              : undefined;
          yield* Effect.withFiber((fiber) => {
            if (elapsed !== undefined)
              Metric.withAttributes(duration, attributes).updateUnsafe(elapsed, fiber.context);
            Metric.withAttributes(outcomes, { ...attributes, outcome }).updateUnsafe(
              1,
              fiber.context,
            );
            return Effect.void;
          });
          yield* Effect.annotateCurrentSpan({
            "execution.outcome": outcome,
            ...(elapsed === undefined ? {} : { "execution.duration_ms": elapsed }),
          });
          const log =
            outcome === "failure" || outcome === "defect"
              ? Effect.logError("Execution operation failed")
              : outcome === "interrupted"
                ? Effect.logDebug("Execution operation interrupted")
                : Effect.logInfo("Execution operation completed");
          yield* Effect.annotateLogs(log, {
            ...attributes,
            outcome,
            ...(elapsed === undefined ? {} : { duration_ms: elapsed }),
          });
        }),
      ),
    );
  });
}

/**
 * Classifies a completed operation without discarding mixed failure causes.
 * @typeParam A - Successful value.
 * @typeParam E - Typed failure.
 * @param exit - Completed operation exit.
 * @returns A bounded outcome label.
 */
function operationOutcome<A, E>(exit: Exit.Exit<A, E>): ExecutionOutcome {
  if (Exit.isSuccess(exit)) return "success";
  if (Cause.hasDies(exit.cause)) return "defect";
  return Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failure";
}

/**
 * Keeps best-effort telemetry from changing authoritative domain results.
 * @param observation - Telemetry-only work with no application authority.
 * @returns Observation that succeeds even if a logger or observer defects.
 */
function isolateObservation(observation: Effect.Effect<unknown>): Effect.Effect<void> {
  return observation.pipe(
    Effect.asVoid,
    Effect.catchCause(() => Effect.void),
  );
}
