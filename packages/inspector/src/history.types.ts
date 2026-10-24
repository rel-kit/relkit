/** Standalone history owns the native worker; the application receives only durable ACKs. */
import type { Effect, Schema } from "effect";
import type { LocalWorkerCommand } from "@relkit/observability/local/worker-contract";
import type { InspectionConnectionError } from "@relkit/inspector-api/connection";

/** Serialized operations use the existing project store/schema and stable receipt keys. */
export interface InspectorHistoryOperations {
  readonly call: (
    command: LocalWorkerCommand,
  ) => Effect.Effect<Schema.Json | undefined, InspectionConnectionError>;
}
