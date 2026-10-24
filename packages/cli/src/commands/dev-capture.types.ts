/** Session capture callbacks never own a database, query store or UI process. */
import type { Effect, Scope } from "effect";
import type { ObservabilityRecord, TelemetryConfiguration } from "@relkit/observability";
import type { InspectionCaptureOperations } from "@relkit/inspector-api/connection";
import type { CliAdapterError } from "../cli-errors.js";
import type { DevOptions } from "./dev.types.js";

/** Native callback facade over one scoped capture owner. */
export interface DevCapture {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly append: (
    record: ObservabilityRecord,
    origin?: "application" | "relkit" | "inspector",
  ) => void;
  readonly redact: NonNullable<NonNullable<DevOptions["logger"]>["redact"]>;
  readonly configureEffect: (
    configuration: TelemetryConfiguration,
  ) => Effect.Effect<void, CliAdapterError>;
  readonly records: InspectionCaptureOperations["records"];
}

/** Captured native authority; each acquisition owns fresh capture state. */
export interface DevCaptureOperations {
  readonly acquire: (
    enabled: boolean,
    configuration: TelemetryConfiguration,
  ) => Effect.Effect<DevCapture, CliAdapterError, Scope.Scope>;
}
