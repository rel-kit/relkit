import type { Effect } from "effect";
import type { StreamLifecycleFailure, StreamSourceFailure } from "./stream-errors.js";

/** Async iterator that also exposes its typed Effect path for direct composition.
 * The source starts on first demand and accepts only one consumer.
 * @typeParam T - Item type emitted by the source.
 * @example const item = await Effect.runPromise(iterator.nextEffect());
 */
export interface LazyEffectIterator<T> extends AsyncIterator<T> {
  /** Fetches the next value through Effect.
   * @returns An iterator result or a typed lifecycle/source failure.
   * @example Effect.runPromise(iterator.nextEffect());
   */
  readonly nextEffect: () => Effect.Effect<IteratorResult<T>, StreamLifecycleFailure | StreamSourceFailure>;
  /** Closes the source through Effect.
   * @param value - Optional final value.
   * @returns Final iterator result or typed lifecycle/source failure.
   * @example Effect.runPromise(iterator.returnEffect());
   */
  readonly returnEffect: (value?: unknown) => Effect.Effect<IteratorResult<T>, StreamLifecycleFailure | StreamSourceFailure>;
  /** Throws into the source through Effect.
   * @param error - Error to deliver.
   * @returns Iterator result or typed lifecycle/source failure.
   * @example Effect.runPromise(iterator.throwEffect(error));
   */
  readonly throwEffect: (error?: unknown) => Effect.Effect<IteratorResult<T>, StreamLifecycleFailure | StreamSourceFailure>;
}

/** Single-consumer iterable with an Effect-capable iterator.
 * A second iterator reports an already-consumed failure on demand.
 * @typeParam T - Item type emitted by the source.
 * @example const iterator = stream[Symbol.asyncIterator]();
 */
export interface LazyEffectStream<T> extends AsyncIterable<T> {
  /** Opens the one permitted iterator.
   * @returns An Effect-capable iterator.
   * @example stream[Symbol.asyncIterator]();
   */
  [Symbol.asyncIterator](): LazyEffectIterator<T>;
}
