import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { JsonValue } from "@relkit/contracts";
import type {
  NormalizedRedactionPolicy,
  RedactedCapture,
  RedactionPolicy,
} from "./redaction.types.js";
import { redactionCore as core } from "./redaction-core.js";
/**
 * Tagged invalid redaction policy or capture failure.
 * @example
 * if (error._tag === "RedactionError") console.error(error.message);
 */
export class RedactionError extends Schema.TaggedError<RedactionError>()("RedactionError", {
  message: Schema.String,
}) {}
function observe<A, E>(
  operation: "policy" | "record" | "capture",
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_redaction_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_redaction_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function expected<A>(run: () => A): Effect.Effect<A, RedactionError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof TypeError
        ? Effect.fail(new RedactionError({ message: cause.message }))
        : Effect.die(cause),
    ),
  );
}
/**
 * Normalizes and validates a redaction policy.
 * @param value - Input policy.
 * @returns An Effect with a frozen policy or tagged validation failure.
 * @example
 * const policy = Effect.runSync(createRedactionPolicyEffect({ mode: "off" }));
 */
export const createRedactionPolicyEffect = Effect.fn("ObservabilityRedaction.policy")(
  (value: RedactionPolicy = {}): Effect.Effect<NormalizedRedactionPolicy, RedactionError> =>
    observe(
      "policy",
      expected(() => core.createRedactionPolicy(value)),
    ),
);
/**
 * Removes sensitive values and returns a safe immutable JSON value.
 * @param value - Value to redact.
 * @param policy - Optional redaction policy.
 * @returns An Effect with the safe value or tagged policy failure.
 * @example
 * const safe = Effect.runSync(redactRecordEffect(record));
 */
export const redactRecordEffect = Effect.fn("ObservabilityRedaction.record")(
  (value: unknown, policy?: RedactionPolicy): Effect.Effect<JsonValue, RedactionError> =>
    observe(
      "record",
      expected(() => core.redactRecord(value, policy)),
    ),
);
/**
 * Creates a size-bounded development capture after redaction.
 * @param value - Candidate capture value.
 * @param policy - Required capture policy.
 * @returns An Effect with an optional capture or tagged policy failure.
 * @example
 * const capture = Effect.runSync(captureRedactedEffect(value, policy));
 */
export const captureRedactedEffect = Effect.fn("ObservabilityRedaction.capture")(
  (
    value: unknown,
    policy: RedactionPolicy,
  ): Effect.Effect<RedactedCapture | undefined, RedactionError> =>
    observe(
      "capture",
      expected(() => core.captureRedacted(value, policy)),
    ),
);
