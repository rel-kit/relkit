import type { MaybePromise } from "@relkit/contracts";
import type { StandardResult, StandardSchemaV1 } from "@relkit/schema";
import type { Effect } from "effect";
import type {
  ProgressEmissionFailure,
  ProgressSinkFailure,
  ProgressValidationFailure,
} from "./progress.js";

/** External destination for validated progress values.
 * @example const sink: ProgressSink = { emit: async (value) => { console.log(value); } };
 */
export interface ProgressSink {
  /** Publishes one value.
   * @param value - Schema-validated progress value.
   * @param signal - Invocation cancellation signal.
   * @returns Completion of the destination write.
   * @example await sink.emit("working", signal);
   */
  readonly emit: (value: unknown, signal: AbortSignal) => MaybePromise<void>;
}

/** Public asynchronous progress API supplied to a handler.
 * @typeParam Value - Accepted progress value.
 * @example await context.progress.emit({ percent: 50 });
 */
export interface ProgressEmitter<Value = unknown> {
  /** Validates and publishes one value.
   * @param value - Candidate progress value.
   * @returns Completion or a validation, size, settlement, or sink failure.
   * @example await emitter.emit("working");
   */
  readonly emit: (value: Value) => Promise<void>;
}

/** Injectable schema and sink boundary for deterministic progress tests.
 * @example const layer = Layer.succeed(ProgressIO, { validate, emit });
 */
export interface ProgressIOService {
  /** Validates a candidate progress value.
   * @param schema - Target's progress schema.
   * @param value - Candidate value.
   * @returns A Standard Schema result or a rejected validation Promise.
   * @example await io.validate(schema, value);
   */
  readonly validate: (schema: StandardSchemaV1, value: unknown) => Promise<StandardResult<unknown>>;
  /** Publishes one validated value.
   * @param sink - External progress destination.
   * @param value - Validated value.
   * @param signal - Invocation cancellation signal.
   * @returns Completion of the sink write.
   * @example await io.emit(sink, value, signal);
   */
  readonly emit: (sink: ProgressSink, value: unknown, signal: AbortSignal) => Promise<void>;
}

/** Effect API and compatibility adapters for one progress lifecycle.
 * Emit calls fail after settlement; settling twice has no additional effect.
 * @example const handle = Effect.runSync(createProgressEmitterEffect(schema, signal));
 */
export interface ProgressEffectHandle {
  readonly emitter: ProgressEmitter;
  /** Marks the lifecycle settled for compatibility callers.
   * @returns Void; later emissions fail.
   * @example handle.settle();
   */
  readonly settle: () => void;
  /** Validates and publishes one value through Effect.
   * @param value - Candidate progress value.
   * @returns Void or a tagged validation, lifecycle, or sink failure.
   * @example await Effect.runPromise(handle.emitEffect("working"));
   */
  readonly emitEffect: (
    value: unknown,
  ) => Effect.Effect<
    void,
    ProgressEmissionFailure | ProgressSinkFailure | ProgressValidationFailure
  >;
  /** Marks the lifecycle settled through Effect.
   * @returns Void with no expected failure.
   * @example Effect.runSync(handle.settleEffect());
   */
  readonly settleEffect: () => Effect.Effect<void>;
}
