import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  ContractOperation,
  ContractTelemetryService,
} from "./contract-observability.types.js";

export type { ContractTelemetryService } from "./contract-observability.types.js";

/**
 * Injectable tracing and metrics service for contract operations.
 * @example Effect.provide(normalizeIdEffect("orders.get"), ContractTelemetryLive);
 */
export class ContractTelemetry extends Context.Service<
  ContractTelemetry,
  ContractTelemetryService
>()("relkit/contracts/ContractTelemetry") {}

/**
 * Live telemetry Layer using Effect spans, Clock, and Metric services.
 * @example Effect.runSync(Effect.provide(normalizeIdEffect("orders.get"), ContractTelemetryLive));
 */
export const ContractTelemetryLive = Layer.succeed(ContractTelemetry, {
  observe: observeLive,
});

const calls = Metric.counter("relkit_contract_operations_total", { incremental: true });
const failures = Metric.counter("relkit_contract_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_contract_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/**
 * Records a contract operation's span, call count, duration, and failure.
 * @param operation - Fixed operation name used as the only metric dimension.
 * @param effect - Effect to observe; its success and error channels are preserved.
 * @returns The same Effect result with telemetry around its execution.
 * @example
 * const checked = observeContract("id.is-stable", Effect.succeed(true));
 */
export function observeContract<A, E, R>(
  operation: ContractOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(ContractTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: ContractOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
      return yield* Effect.onExit(effect, (exit) =>
        Effect.gen(function* () {
          const elapsed = (yield* Clock.currentTimeMillis) - started;
          yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
          if (Exit.isFailure(exit)) {
            yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
          }
        }),
      );
    }),
    `contracts.${operation}`,
  );
}

/**
 * Runs a synchronous compatibility adapter while preserving the original error.
 * @param effect - Fully provided Effect implementation of the operation.
 * @returns The successful value produced by the Effect.
 * @throws The operation's original error or defect when it fails.
 * @example
 * const valid = runContract(Effect.succeed(true));
 */
export function runContract<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
