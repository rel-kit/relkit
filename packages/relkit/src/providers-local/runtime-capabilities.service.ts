import { Context, Effect, Layer, Ref } from "effect";
import type { JsonValue } from "../contracts/index.js";
import type { ObservabilityEffects } from "./runtime-capabilities.service.types.js";

/** In-memory observability collection; records remain caller-owned JSON values. */
export class LocalObservabilityService extends Context.Service<
  LocalObservabilityService,
  ObservabilityEffects
>()("@relkit/providers-local/Observability") {}

/** Constructs lazy synchronous record collection without recursively instrumenting the log sink. */
export const makeObservabilityService = Effect.gen(function* () {
  const records = yield* Ref.make<JsonValue[]>([]);
  return LocalObservabilityService.of({
    collect: (record) =>
      Ref.update(records, (current) => {
        current.push(record);
        return current;
      }),
    read: () => Effect.map(Ref.get(records), (current) => Object.freeze([...current])),
  });
});

/** Provides one isolated in-memory collection per layer acquisition. */
export const localObservabilityLayer = Layer.effect(
  LocalObservabilityService,
  makeObservabilityService,
);
