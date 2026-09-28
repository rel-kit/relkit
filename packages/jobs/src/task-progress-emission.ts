import { canonicalJson } from "@relkit/contracts";
import type { ProgressEmitReceipt } from "@relkit/contracts/jobs";
import { validate, type InferInput, type StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result } from "effect";
import { observeJobs } from "./jobs-observability.js";
import { TASK_ITEM_MAX_BYTES } from "./task-policy-validation.js";
import { TaskEmissionError, TaskEmissionFailure } from "./task-progress-error.js";
import type {
  EffectTaskEmitter,
  TaskEmissionErrorCode,
  TaskEmitterOptions,
} from "./task-progress.types.js";
/** Builds a validated Effect emitter and its compatibility adapter.
 * @param schema - Item schema used before delivery.
 * @param options - Sink, retention, and cancellation settings.
 * @param kind - Progress or named stream emission.
 * @returns Effect emitter and Promise adapter.
 * @example createEmission(progressSchema, options, "progress");
 */
export function createEmission<S extends StandardSchemaV1>(
  schema: S,
  options: TaskEmitterOptions,
  kind: "progress" | "stream",
): EffectTaskEmitter<InferInput<S>> {
  const maxBytes = options.maxBytes ?? TASK_ITEM_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new TypeError("Emission byte limit must be positive");
  const signal = options.signal ?? new AbortController().signal;
  const code = (suffix: "INVALID" | "TOO_LARGE" | "PERSISTENCE" | "RETENTION") =>
    `RELKIT_TASK_${kind.toUpperCase()}_${suffix}` as TaskEmissionErrorCode;
  const fail = (errorCode: TaskEmissionErrorCode, message: string) =>
    new TaskEmissionFailure({ code: errorCode, cause: new TaskEmissionError(errorCode, message) });
  const emitEffect = Effect.fn("Jobs.emitTaskItem")((input: InferInput<S>) =>
    observeJobs(
      kind === "progress" ? "task.emitProgress" : "task.emitStream",
      Effect.gen(function* () {
        if (signal.aborted)
          return yield* fail("RELKIT_TASK_EMISSION_ABORTED", "Emission was aborted");
        const validation = yield* Effect.tryPromise({
          try: () => Promise.resolve(validate(schema, input)),
          catch: (cause) => fail(code("INVALID"), message(cause)),
        });
        if (!("value" in validation))
          return yield* fail(
            code("INVALID"),
            validation.issues[0]?.message ?? "Emission validation failed",
          );
        const value = validation.value;
        const encoded = yield* Effect.try({
          try: () => canonicalJson(value),
          catch: (cause) => fail(code("INVALID"), message(cause)),
        });
        if (new TextEncoder().encode(encoded).byteLength > maxBytes)
          return yield* fail(code("TOO_LARGE"), `${kind} item exceeds ${maxBytes} encoded bytes`);
        if (options.sink === undefined) {
          if (options.durable)
            return yield* fail(code("PERSISTENCE"), `No durable ${kind} sink is configured`);
          return Object.freeze({
            outcome: "unavailable" as const,
            reason: `No ${kind} sink is configured`,
          });
        }
        const delivery = yield* Effect.result(
          Effect.tryPromise({
            try: async () => normalizeReceipt(await options.sink!(value, signal)),
            catch: (cause) => cause,
          }),
        );
        if (Result.isFailure(delivery)) {
          const cause = delivery.failure;
          if (cause instanceof TaskEmissionError)
            return yield* new TaskEmissionFailure({ code: cause.code, cause });
          if (options.durable) return yield* fail(code("PERSISTENCE"), message(cause));
          return Object.freeze({ outcome: "unavailable" as const, reason: message(cause) });
        }
        const receipt = delivery.success;
        if (options.generation !== undefined) {
          if (receipt.generation !== undefined && receipt.generation !== options.generation)
            return yield* fail(
              code("RETENTION"),
              `${kind} receipt generation does not match the active attempt`,
            );
          if (options.requireGeneration === true && receipt.generation !== options.generation)
            return yield* fail(
              code("RETENTION"),
              `Durable ${kind} receipt is missing its generation identity`,
            );
        }
        if (options.durable && receipt.outcome !== "persisted")
          return yield* fail(code("PERSISTENCE"), `Durable ${kind} emission was not persisted`);
        return Object.freeze(receipt);
      }),
    ),
  );
  const emit = async (input: InferInput<S>): Promise<ProgressEmitReceipt> => {
    const result = await Effect.runPromise(Effect.result(emitEffect(input)));
    if (Result.isFailure(result)) throw result.failure.cause;
    return result.success;
  };
  return Object.freeze({ emit, emitEffect });
}
/** Normalizes a sink receipt and rejects malformed outcomes. */
function normalizeReceipt(receipt: ProgressEmitReceipt | void): ProgressEmitReceipt {
  if (receipt === undefined) return { outcome: "sent" };
  if (
    receipt.outcome !== "persisted" &&
    receipt.outcome !== "sent" &&
    receipt.outcome !== "dropped" &&
    receipt.outcome !== "unavailable"
  )
    throw new TypeError("Invalid task emission receipt");
  return {
    outcome: receipt.outcome,
    ...(receipt.sequence === undefined ? {} : { sequence: receipt.sequence }),
    ...(receipt.generation === undefined ? {} : { generation: receipt.generation }),
    ...(receipt.reason === undefined ? {} : { reason: receipt.reason }),
  };
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
