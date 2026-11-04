import type { Effect } from "effect";
import type { JsonValue } from "../contracts/index.js";

/** Synchronous Effect operations for an isolated observability record collection. */
export interface ObservabilityEffects {
  readonly collect: (record: JsonValue) => Effect.Effect<void>;
  readonly read: () => Effect.Effect<readonly JsonValue[]>;
}
