import { validate } from "@relkit/schema";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Context, Data, Effect, Layer, Option } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  ProgressEffectHandle,
  ProgressEmitter,
  ProgressIOService,
  ProgressSink,
} from "./progress.types.js";

export type { ProgressEffectHandle, ProgressEmitter, ProgressIOService, ProgressSink } from "./progress.types.js";

/** Maximum encoded size of one progress record in bytes. */
export const MAX_PROGRESS_RECORD_BYTES = 256 * 1024;

/** Compatibility error surfaced from an invalid progress emission.
 * @example new ProgressEmissionError("RELKIT_PROGRESS_VALIDATION", "Invalid progress");
 */
export class ProgressEmissionError extends Error {
  constructor(
    readonly code:
      | "RELKIT_PROGRESS_VALIDATION"
      | "RELKIT_PROGRESS_TOO_LARGE"
      | "RELKIT_PROGRESS_AFTER_SETTLEMENT",
    message: string,
  ) {
    super(message);
    this.name = "ProgressEmissionError";
  }
}

/** Tagged expected failure from progress validation and lifecycle checks.
 * @example Effect.catchTag(handle.emitEffect(1), "ProgressEmissionFailure", () => Effect.void);
 */
export class ProgressEmissionFailure extends Data.TaggedError("ProgressEmissionFailure")<{
  readonly code: ProgressEmissionError["code"];
  readonly message: string;
}> {}

/** Tagged failure from an external progress sink.
 * @example Effect.catchTag(handle.emitEffect(1), "ProgressSinkFailure", () => Effect.void);
 */
export class ProgressSinkFailure extends Data.TaggedError("ProgressSinkFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Tagged failure from a rejecting progress schema validator.
 * @example Effect.catchTag(handle.emitEffect(1), "ProgressValidationFailure", () => Effect.void);
 */
export class ProgressValidationFailure extends Data.TaggedError("ProgressValidationFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Injectable schema and sink operations for progress emission.
 * @example Effect.provide(handle.emitEffect(1), ProgressIOLive);
 */
export class ProgressIO extends Context.Service<ProgressIO, ProgressIOService>()(
  "relkit/invocation/ProgressIO",
) {}

const liveIO: ProgressIOService = {
  validate: (schema, value) => Promise.resolve(validate(schema, value as never)),
  emit: (sink, value, signal) => Promise.resolve(sink.emit(value, signal)),
};

/** Live schema validation and progress sink operations.
 * @example Effect.runPromise(Effect.provide(handle.emitEffect(1), ProgressIOLive));
 */
export const ProgressIOLive = Layer.succeed(ProgressIO, liveIO);

/** Creates an Effect progress lifecycle with synchronous compatibility adapters.
 * @param schema - Standard Schema for each progress value.
 * @param signal - Invocation abort signal forwarded to the sink.
 * @param sink - Destination for validated progress values.
 * @returns A lifecycle handle; the factory has no expected Effect failure.
 * @example Effect.runSync(createProgressEmitterEffect(schema, signal));
 */
export function createProgressEmitterEffect(
  schema: StandardSchemaV1,
  signal: AbortSignal,
  sink: ProgressSink = discardProgress,
): Effect.Effect<ProgressEffectHandle> {
  return observeInvocation(
    "progress.create",
    Effect.sync(() => {
      let settled = false;
      const settleEffect = (): Effect.Effect<void> =>
        observeInvocation(
          "progress.settle",
          Effect.sync(() => {
            settled = true;
          }),
        );
      const emitEffect = (
        value: unknown,
      ): Effect.Effect<void, ProgressEmissionFailure | ProgressSinkFailure | ProgressValidationFailure> =>
        observeInvocation(
          "progress.emit",
          Effect.gen(function* () {
            if (settled)
              return yield* Effect.fail(
                new ProgressEmissionFailure({
                  code: "RELKIT_PROGRESS_AFTER_SETTLEMENT",
                  message: "Progress cannot be emitted after invocation settlement.",
                }),
              );
            const provided = yield* Effect.serviceOption(ProgressIO);
            const io = Option.isSome(provided) ? provided.value : liveIO;
            const result = yield* Effect.tryPromise({
              try: () => io.validate(schema, value),
              catch: (cause) => new ProgressValidationFailure({
                cause,
                message: "Progress validation failed",
              }),
            });
            if (!("value" in result))
              return yield* Effect.fail(
                new ProgressEmissionFailure({
                  code: "RELKIT_PROGRESS_VALIDATION",
                  message: "Progress validation failed.",
                }),
              );
            const bytes = new TextEncoder().encode(
              JSON.stringify({ type: "progress", value: result.value }),
            ).byteLength;
            if (bytes > MAX_PROGRESS_RECORD_BYTES)
              return yield* Effect.fail(
                new ProgressEmissionFailure({
                  code: "RELKIT_PROGRESS_TOO_LARGE",
                  message: `Progress record exceeds ${MAX_PROGRESS_RECORD_BYTES} encoded bytes.`,
                }),
              );
            yield* Effect.tryPromise({
              try: () => io.emit(sink, result.value, signal),
              catch: (cause) => new ProgressSinkFailure({ cause, message: "Progress sink failed" }),
            });
          }),
        );
      return {
        emitter: Object.freeze({
          emit: (value: unknown) => Effect.runPromise(emitEffect(value)).catch((cause: unknown) => {
            if (cause instanceof ProgressEmissionFailure)
              throw new ProgressEmissionError(cause.code, cause.message);
            if (cause instanceof ProgressSinkFailure) throw cause.cause;
            if (cause instanceof ProgressValidationFailure) throw cause.cause;
            throw cause;
          }),
        }),
        settle: () => runInvocationSync(settleEffect()),
        emitEffect,
        settleEffect,
      };
    }),
  );
}

/** Creates the public progress emitter compatibility API.
 * @param schema - Standard Schema for each progress value.
 * @param signal - Invocation abort signal forwarded to the sink.
 * @param sink - Destination for validated progress values.
 * @returns An emitter and settlement function.
 * @example createProgressEmitter(schema, new AbortController().signal).settle();
 */
export function createProgressEmitter(
  schema: StandardSchemaV1,
  signal: AbortSignal,
  sink: ProgressSink = discardProgress,
): { readonly emitter: ProgressEmitter; readonly settle: () => void } {
  const handle = runInvocationSync(createProgressEmitterEffect(schema, signal, sink));
  return { emitter: handle.emitter, settle: handle.settle };
}

const discardProgress: ProgressSink = Object.freeze({ emit: () => undefined });
