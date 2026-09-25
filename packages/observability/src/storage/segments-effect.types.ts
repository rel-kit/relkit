import type { Effect } from "effect";
import type { ObservabilityRecord } from "../model.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import type { SegmentOperationError } from "./segments-effect.js";
/** Effect operations over one live segment store and its file handles. */
export interface ObservabilitySegmentStoreEffects {
  readonly root: string;
  readonly append: (
    record: ObservabilityRecord,
  ) => Effect.Effect<RedactedObservabilityRecord | undefined, SegmentOperationError>;
  readonly flush: () => Effect.Effect<void, SegmentOperationError>;
  readonly shutdown: () => Effect.Effect<void, SegmentOperationError>;
  readonly close: () => Effect.Effect<void, SegmentOperationError>;
}
