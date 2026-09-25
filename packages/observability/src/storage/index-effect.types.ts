import type { Effect } from "effect";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexPage,
  ObservabilityIndexPageOptions,
  ObservabilityIndexStats,
  ObservabilityRetentionReport,
} from "./index.types.js";
import type { IndexOperationError } from "./index-effect.js";
/** Effect operations over one live segment index. The scope owner closes it. */
export interface ObservabilityIndexEffects {
  readonly root: string;
  readonly append: (
    record: RedactedObservabilityRecord,
    path: string,
    offset: number,
    bytes: number,
  ) => Effect.Effect<ObservabilityIndexEntry, IndexOperationError>;
  readonly finalize: (
    activePath: string,
    finalPath: string,
  ) => Effect.Effect<void, IndexOperationError>;
  readonly rebuild: () => Effect.Effect<void, IndexOperationError>;
  readonly retain: () => Effect.Effect<ObservabilityRetentionReport, IndexOperationError>;
  readonly page: (
    value?: ObservabilityIndexPageOptions,
  ) => Effect.Effect<ObservabilityIndexPage, IndexOperationError>;
  readonly tracePage: (
    value?: ObservabilityIndexPageOptions,
  ) => Effect.Effect<ObservabilityIndexPage, IndexOperationError>;
  readonly read: (
    entry: ObservabilityIndexEntry,
  ) => Effect.Effect<RedactedObservabilityRecord | undefined, IndexOperationError>;
  readonly stats: () => Effect.Effect<ObservabilityIndexStats, IndexOperationError>;
  readonly flush: () => Effect.Effect<void, IndexOperationError>;
  readonly close: () => Effect.Effect<void, IndexOperationError>;
}
