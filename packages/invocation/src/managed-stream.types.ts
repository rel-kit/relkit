import type { StandardResult, StandardSchemaV1 } from "@relkit/schema";
import type { Effect } from "effect";
import type { StreamLifecycleFailure, StreamSourceFailure } from "./stream-errors.js";

/** External operations and limits for a validated invocation stream.
 * The owner must settle the invocation when iteration completes or is cancelled.
 * @example const options: ManagedStreamOptions = { source, schema, maxItemBytes: 1024, idleMs: 1000, abort, run, settle };
 */
export interface ManagedStreamOptions {
  readonly source: AsyncIterable<unknown>;
  readonly schema: StandardSchemaV1;
  readonly maxItemBytes: number;
  readonly idleMs: number;
  /** Aborts the owning invocation on stream cancellation or failure.
   * @param reason - Public stream error or abort reason.
   * @returns Void.
   * @example options.abort(new DOMException("cancelled", "AbortError"));
   */
  readonly abort: (reason: unknown) => void;
  /** Runs a source operation inside the invocation scope.
   * @param work - Source pull or close operation.
   * @returns The source operation's result.
   * @example await options.run(() => iterator.next());
   */
  readonly run: <A>(work: () => Promise<A>) => Promise<A>;
  /** Finalizes the owning invocation exactly once.
   * @param error - Optional stream failure.
   * @returns Completion of release hooks.
   * @example await options.settle();
   */
  readonly settle: (error?: unknown) => Promise<void>;
}

/** Injectable schema validation and idle scheduling boundary.
 * @example const layer = Layer.succeed(ManagedStreamIO, { validate, scheduleIdle });
 */
export interface ManagedStreamIOService {
  /** Validates one source item.
   * @param schema - Stream item schema.
   * @param value - Candidate item.
   * @returns A Standard Schema result.
   * @example await io.validate(schema, value);
   */
  readonly validate: (schema: StandardSchemaV1, value: unknown) => Promise<StandardResult<unknown>>;
  /** Arms the consumer idle timeout.
   * @param milliseconds - Idle duration.
   * @param onIdle - Callback fired after inactivity.
   * @returns A timer cancellation callback.
   * @example const cancel = io.scheduleIdle(1_000, onIdle);
   */
  readonly scheduleIdle: (milliseconds: number, onIdle: () => void) => () => void;
}

/** Managed iterator exposing a typed Effect next operation.
 * Interrupted pulls close and settle the source before interruption completes.
 * @typeParam T - Validated stream item type.
 * @example const item = await Effect.runPromise(iterator.nextEffect());
 */
export interface ManagedEffectIterator<T> extends AsyncIterator<T> {
  /** Pulls one validated item with serialized access.
   * @returns An iterator result or typed stream failure.
   * @example await Effect.runPromise(iterator.nextEffect());
   */
  readonly nextEffect: () => Effect.Effect<
    IteratorResult<T>,
    StreamLifecycleFailure | StreamSourceFailure
  >;
}

/** Validated iterable with an Effect-capable iterator.
 * The iterable accepts one consumer; a second iterator fails on demand.
 * @typeParam T - Validated stream item type.
 * @example const iterator = stream[Symbol.asyncIterator]();
 */
export interface ManagedEffectStream<T> extends AsyncIterable<T> {
  /** Opens the one permitted iterator.
   * @returns An Effect-capable iterator.
   * @example const iterator = stream[Symbol.asyncIterator]();
   */
  [Symbol.asyncIterator](): ManagedEffectIterator<T>;
}
