import { validate } from "@relkit/schema";
import { Context, Effect, Layer, Option, Semaphore } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { createManagedIteratorEffect } from "./managed-stream-iterator.js";
import type {
  ManagedEffectStream,
  ManagedStreamIOService,
  ManagedStreamOptions,
} from "./managed-stream.types.js";

export type {
  ManagedEffectIterator,
  ManagedEffectStream,
  ManagedStreamIOService,
  ManagedStreamOptions,
} from "./managed-stream.types.js";

/** Injectable validation and idle timer operations for managed streams.
 * @example Effect.provide(managedValidatedStreamEffect(options), ManagedStreamIOLive);
 */
export class ManagedStreamIO extends Context.Service<ManagedStreamIO, ManagedStreamIOService>()(
  "relkit/invocation/ManagedStreamIO",
) {}

const liveIO: ManagedStreamIOService = {
  validate: (schema, value) => Promise.resolve(validate(schema, value as never)),
  scheduleIdle: (milliseconds, onIdle) => {
    const timer = setTimeout(onIdle, milliseconds);
    return () => clearTimeout(timer);
  },
};

/** Live schema validation and idle scheduling boundary.
 * @example Effect.runSync(Effect.provide(managedValidatedStreamEffect(options), ManagedStreamIOLive));
 */
export const ManagedStreamIOLive = Layer.succeed(ManagedStreamIO, liveIO);

/** Creates a validated single-consumer stream through Effect.
 * @param options - Source, schema, limits, and lifecycle callbacks.
 * @returns An iterable with typed Effect iterator operations.
 * @example Effect.runSync(managedValidatedStreamEffect({ source, schema, maxItemBytes: 1024, idleMs: 1000, abort, run, settle }));
 */
export function managedValidatedStreamEffect<T>(
  options: ManagedStreamOptions,
): Effect.Effect<ManagedEffectStream<T>> {
  return observeInvocation(
    "stream.managed-create",
    Effect.gen(function* () {
      const provided = yield* Effect.serviceOption(ManagedStreamIO);
      const io = Option.isSome(provided) ? provided.value : liveIO;
      const semaphore = yield* Semaphore.make(1);
      const state = { consumed: false };
      return {
        [Symbol.asyncIterator]() {
          return runInvocationSync(createManagedIteratorEffect<T>(options, io, semaphore, state));
        },
      };
    }),
  );
}

/** Public managed stream compatibility adapter.
 * @param options - Source, schema, limits, and lifecycle callbacks.
 * @returns A validated single-consumer async iterable.
 * @example managedValidatedStream({ source, schema, maxItemBytes: 1024, idleMs: 1000, abort, run, settle });
 */
export function managedValidatedStream<T>(options: ManagedStreamOptions): AsyncIterable<T> {
  return runInvocationSync(managedValidatedStreamEffect<T>(options));
}
