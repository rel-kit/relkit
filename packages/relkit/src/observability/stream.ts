import { Effect } from "effect";
import type { ObservabilityRecord } from "./model.js";
import { makeObservabilityStreamEffect, type StreamOperationError } from "./stream-effect.js";
import { ObservabilityStreamError } from "./stream-types.js";
import type {
  ObservabilityStream,
  ObservabilityStreamEventType,
  ObservabilityStreamInput,
  ObservabilityStreamOptions,
  ObservabilityStreamPublish,
  ObservabilityStreamReplay,
  ObservabilityStreamReplayOptions,
} from "./stream.types.js";
export * from "./stream-types.js";
export {
  StreamOperationError,
  ObservabilityStreamService,
  makeObservabilityStreamEffect,
  observabilityStreamLayer,
} from "./stream-effect.js";
export type { ObservabilityStreamEffects } from "./stream-effect.types.js";
function legacyError(error: StreamOperationError): Error {
  return error.kind === "stream" && error.code !== undefined
    ? new ObservabilityStreamError(error.code, error.message)
    : new TypeError(error.message);
}
/**
 * Creates a bounded in-memory stream with replay and consumers.
 * The Effect service and Layer own the same operations with typed errors and
 * scoped release; this adapter preserves synchronous callers.
 * @param options - Retention, queue, overflow, and redaction settings.
 * @returns A stream that owns consumer queues until close.
 * @throws {ObservabilityStreamError} If configuration is invalid.
 * @example
 * const stream = createObservabilityStream({ maxEvents: 100 });
 * try { stream.replay(); } finally { stream.close(); }
 */
export function createObservabilityStream(
  options: ObservabilityStreamOptions = {},
): ObservabilityStream {
  const stream = Effect.runSync(
    makeObservabilityStreamEffect(options).pipe(Effect.mapError(legacyError)),
  );
  const run = <A>(effect: Effect.Effect<A, StreamOperationError>): A =>
    Effect.runSync(effect.pipe(Effect.mapError(legacyError)));
  const publish = ((
    inputOrType: ObservabilityStreamInput | ObservabilityStreamEventType,
    record?: ObservabilityRecord,
  ) =>
    typeof inputOrType === "string"
      ? run(stream.publishRecord(inputOrType, record!))
      : run(stream.publish(inputOrType))) as ObservabilityStreamPublish;
  const replay = ((value?: ObservabilityStreamReplayOptions | string, limit?: number) =>
    run(stream.replay(value, limit))) as ObservabilityStreamReplay;
  return Object.freeze({
    publish,
    emit: publish,
    publishRecord: (type, record) => run(stream.publishRecord(type, record)),
    replay,
    read: replay,
    subscribe: (input) => run(stream.subscribe(input)),
    dropped: () => Effect.runSync(stream.dropped()),
    counters: () => Effect.runSync(stream.counters()),
    stats: () => Effect.runSync(stream.stats()),
    close: () => Effect.runSync(stream.close()),
  } satisfies ObservabilityStream);
}
