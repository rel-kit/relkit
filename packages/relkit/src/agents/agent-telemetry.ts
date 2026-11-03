import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { AgentOperation, AgentTelemetryService } from "./agent-telemetry.types.js";

export type { AgentOperation, AgentTelemetryService } from "./agent-telemetry.types.js";

/** Injectable telemetry boundary for agent operations.
 * @example Effect.provide(observeAgent("capture.policy", Effect.void), AgentTelemetryLive);
 */
export class AgentTelemetry extends Context.Service<AgentTelemetry, AgentTelemetryService>()(
  "relkit/agents/AgentTelemetry",
) {}

/** Live metric observer for traced agent operations.
 * @example Effect.runSync(Effect.provide(observeAgent("capture.policy", Effect.void), AgentTelemetryLive));
 */
export const AgentTelemetryLive = Layer.succeed(AgentTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_agent_operations_total", { incremental: true });
const failures = Metric.counter("relkit_agent_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_agent_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Records a call, duration, and failure with a fixed operation label.
 * @param operation - Stable operation name from the package inventory.
 * @param effect - Operation to observe.
 * @returns The original Effect success, error, and dependency channels.
 * @example observeAgent("capture.policy", Effect.succeed({ mode: "off" }));
 */
export function observeAgent<A, E, R>(
  operation: AgentOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(AgentTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: AgentOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
        yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
        if (Exit.isFailure(exit)) {
          yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
        }
      }),
    );
  });
}
