/**
 * Defines early ingress independently from persistent support readiness.
 * Producer keys survive the buffer, allowing idempotent ordered handoff. Native
 * callbacks borrow this session's context; the Effect run remains scope-owned.
 */
import type { Context, Effect, Ref, Scope, Semaphore } from "effect";
import type { EarlyRetentionOperations } from "@relkit/observability/early";
import type {
  DiagnosticRecord,
  ObservabilityRecord,
  TelemetryConfiguration,
  ObservabilityStream,
} from "@relkit/observability";
import type { CliAdapterError } from "../cli-errors.js";
import type { CliCleanup } from "../services/cleanup.service.js";
import type { CleanupCapabilities } from "../services/cleanup.types.js";
import type { HttpCapabilities } from "../services/http.types.js";
import type { DevTelemetryEffects } from "./dev-telemetry.types.js";
import type { DevLog, DevOptions } from "./dev.types.js";
import type { LocalLogOrigin } from "@relkit/observability/local/record";

/** Session-owned ingress with independent scoped persistent initialization. */
export interface DevTelemetryRelay {
  readonly environment: DevTelemetryEffects["environment"];
  readonly append: (record: ObservabilityRecord, origin?: LocalLogOrigin) => void;
  readonly redact: NonNullable<NonNullable<DevOptions["logger"]>["redact"]>;
  readonly handle: DevTelemetryEffects["handle"];
  readonly closeStream: () => void;
  readonly configureEffect: DevTelemetryEffects["configureEffect"];
  readonly run: (log: DevLog) => Effect.Effect<void, CliAdapterError, Scope.Scope>;
}

/** Shared adapters are captured at acquisition; root/config are session inputs. */
export interface DevTelemetryRelayOperations {
  readonly acquire: (
    root: string,
    configuration: TelemetryConfiguration,
  ) => Effect.Effect<DevTelemetryRelay, CliAdapterError, Scope.Scope>;
}

/** Explicit state passed only between this domain's ingress and handoff operations. */
export interface DevTelemetryRelayState {
  readonly root: string;
  readonly token: string;
  readonly source: string;
  readonly sequence: Ref.Ref<number>;
  readonly closed: Ref.Ref<boolean>;
  /** Borrowed configured diagnostic sink, supplied only by the owned support lifetime. */
  readonly diagnostic: Ref.Ref<DevLog | undefined>;
  /** Latest coalesced loss waits independently for canonical storage admission. */
  readonly pendingLoss: Ref.Ref<DiagnosticRecord | undefined>;
  readonly configuration: Ref.Ref<TelemetryConfiguration>;
  /** Serializes latest-policy publication against updates while storage is opening. */
  readonly configurationGate: Semaphore.Semaphore;
  readonly store: Ref.Ref<DevTelemetryEffects | undefined>;
  /** Distinguishes delayed support from an exhausted support failure for query clients. */
  readonly storageState: Ref.Ref<"starting" | "ready" | "unavailable">;
  readonly buffer: EarlyRetentionOperations;
  readonly stream: ObservabilityStream;
  readonly http: HttpCapabilities;
  readonly cleanup: CleanupCapabilities;
  readonly context: Context.Context<CliCleanup>;
}
