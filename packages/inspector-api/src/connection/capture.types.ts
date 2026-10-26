/** Lightweight capture borrows telemetry contracts and owns no persistent store. */
import type { Effect } from "effect";
import type { ObservabilityRecord, TelemetryConfiguration } from "@relkit/observability";
import type { InspectionConnectionError } from "./connection-error.js";

/** Operations owned by one dev session, shared by its producers and private bridge. */
export interface InspectionCaptureOperations {
  readonly append: (
    record: ObservabilityRecord,
    identity?: { readonly key: string; readonly origin: "application" | "relkit" | "inspector" },
  ) => Effect.Effect<void, InspectionConnectionError>;
  readonly records: (request: Request) => Effect.Effect<Response, InspectionConnectionError>;
  readonly producer: (request: Request) => Effect.Effect<Response, InspectionConnectionError>;
  readonly configure: (
    configuration: TelemetryConfiguration,
  ) => Effect.Effect<void, InspectionConnectionError>;
  readonly close: Effect.Effect<void>;
  readonly markIncomplete: Effect.Effect<void>;
}
