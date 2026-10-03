import type { Effect } from "effect";
import type { JsonValue } from "@relkit/contracts";
import type { LocalJobProvider } from "./runtime-capabilities.types.js";
import type { LocalOperationError } from "./local-effect.js";

/** Effect operations for legacy queue acquisition and shared journal finalization. */
export interface LegacyJobEffects {
  readonly createQueue: (
    context: Parameters<LocalJobProvider["createQueue"]>[0],
  ) => Effect.Effect<Awaited<ReturnType<LocalJobProvider["createQueue"]>>, LocalOperationError>;
  readonly close: () => Effect.Effect<void, LocalOperationError>;
}

/** Synchronous Effect operations for an isolated observability record collection. */
export interface ObservabilityEffects {
  readonly collect: (record: JsonValue) => Effect.Effect<void>;
  readonly read: () => Effect.Effect<readonly JsonValue[]>;
}
