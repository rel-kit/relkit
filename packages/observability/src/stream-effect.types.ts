import type { Effect } from "effect";
import type { ObservabilityRecord } from "./model.js";
import type {
  ObservabilityStream,
  ObservabilityStreamCounters,
  ObservabilityStreamEvent,
  ObservabilityStreamEventType,
  ObservabilityStreamInput,
  ObservabilityStreamPage,
  ObservabilityStreamReplayOptions,
  ObservabilityStreamStats,
} from "./stream.types.js";
import type { StreamOperationError } from "./stream-effect.js";
/**
 * Observed operations for a bounded in-memory stream.
 * A scope owner must run `close` when the stream is no longer used.
 * @example
 * const page = yield* stream.replay();
 */
export interface ObservabilityStreamEffects {
  readonly publish: (
    input: ObservabilityStreamInput,
  ) => Effect.Effect<ObservabilityStreamEvent | undefined, StreamOperationError>;
  readonly publishRecord: (
    type: ObservabilityStreamEventType,
    record: ObservabilityRecord,
  ) => Effect.Effect<ObservabilityStreamEvent | undefined, StreamOperationError>;
  readonly replay: (
    value?: ObservabilityStreamReplayOptions | string,
    limit?: number,
  ) => Effect.Effect<ObservabilityStreamPage, StreamOperationError>;
  readonly subscribe: (
    input?: NonNullable<Parameters<ObservabilityStream["subscribe"]>[0]>,
  ) => Effect.Effect<ReturnType<ObservabilityStream["subscribe"]>, StreamOperationError>;
  readonly dropped: () => Effect.Effect<number>;
  readonly counters: () => Effect.Effect<ObservabilityStreamCounters>;
  readonly stats: () => Effect.Effect<ObservabilityStreamStats>;
  readonly close: () => Effect.Effect<void>;
}
