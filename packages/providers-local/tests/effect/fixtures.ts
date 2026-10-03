import { Effect, Layer, Ref } from "effect";
import { LocalCacheService, makeLocalCacheService } from "../../src/cache/provider.js";
import { LocalRealtimeService, makeRealtimeService } from "../../src/realtime/provider.js";
import { emptyRealtimeState } from "../../src/realtime/state.js";
import type { LocalRealtimeState } from "../../src/realtime/state.js";

/** Deterministic cache layer using the test runtime Clock and a fresh byte-LRU. */
export const CacheTest = Layer.effect(
  LocalCacheService,
  makeLocalCacheService({ defaultTtlMs: 100 }),
);

/** In-memory atomic storage supplies the same realtime service contract as its live layer. */
export const RealtimeTest = Layer.effect(
  LocalRealtimeService,
  Effect.gen(function* () {
    const state = yield* Ref.make(emptyRealtimeState("test-epoch"));
    return makeRealtimeService(
      {
        read: () => Ref.get(state),
        update: <A>(
          change: (current: LocalRealtimeState) => {
            readonly state: LocalRealtimeState;
            readonly value: A;
          },
        ) =>
          Ref.modify(state, (current) => {
            const next = change(current);
            return [next.value, next.state];
          }),
      },
      50,
    );
  }),
);
