/**
 * Owns the bounded redacted buffer used before canonical telemetry is available.
 * Layer acquisition validates policy and creates fresh session state; it never
 * opens storage, starts exporters, or delays the backend's serving readiness.
 */
import { Context, Effect, Layer, Ref } from "effect";
import { emptyEarlyRetention } from "./early-records-state.js";
import { earlyRetentionOperations } from "./early-records-operations.js";
import { validateEarlyRetentionOptions } from "./early-records-policy.js";
import type { EarlyRetentionOperations, EarlyRetentionOptions } from "./early-records.types.js";

export type {
  EarlyRetentionOperations,
  EarlyRetentionOptions,
  EarlyRetainedRecord,
  EarlyRecordIdentity,
} from "./early-records.types.js";

/** Injectable session retention; persistence and terminal sinks are separate owners. */
export class EarlyRetention extends Context.Service<EarlyRetention, EarlyRetentionOperations>()(
  "@relkit/observability/EarlyRetention",
  {
    make: (options: EarlyRetentionOptions = {}) =>
      Effect.gen(function* () {
        const policy = yield* validateEarlyRetentionOptions(options);
        const state = yield* Ref.make(emptyEarlyRetention());
        const policyRef = yield* Ref.make(policy);
        return earlyRetentionOperations(state, policyRef);
      }),
  },
) {}

/**
 * Supplies fresh early retention state for one runtime or deterministic test.
 * @param options - Bounded count/byte policy; default 2,048 records and 2 MiB.
 * @returns Lazy Layer; policy errors remain acquisition failures.
 */
export function earlyRetentionLive(options: EarlyRetentionOptions = {}) {
  return Layer.effect(EarlyRetention, EarlyRetention.make(options));
}
