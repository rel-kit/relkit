/** Explicit development policy keeps resourceful work in the session's Effect scope. */
import type { LoggerOptions, LogLevel, LogRecord } from "@relkit/runtime-effect";
import type { Effect } from "effect";
import type { JsonValue, RuntimeActivationFingerprint } from "@relkit/contracts";
import type {
  CandidateCompile,
  StartedCandidate,
  SupervisorObservabilityOptions,
} from "@relkit/supervisor";
import type { InspectionBridgeOptions } from "@relkit/inspector-api/connection";
import type { CliAdapterError } from "../cli-errors.js";

/** One admitted development log, rendered by the existing terminal policy. */
export interface DevLogEvent {
  readonly level: LogLevel;
  readonly event: string;
  readonly fields?: Readonly<Record<string, JsonValue>>;
}
/**
 * Synchronous native logging callback; failures cannot change session lifecycle.
 * @param event - Projected native lifecycle or output record.
 * @returns No value; caller isolation keeps sink failure out of resource control.
 */
export type DevLog = (event: DevLogEvent) => void;
/**
 * Full activation identity or an explicit foreign identity provider.
 * @param candidate - Unpublished candidate whose complete identity will be verified.
 * @returns The accepted complete fingerprint or its native Promise receipt.
 */
export type DevActivationFingerprint =
  | RuntimeActivationFingerprint
  | ((
      candidate: StartedCandidate,
    ) => RuntimeActivationFingerprint | PromiseLike<RuntimeActivationFingerprint>);
/** Existing manually owned local service compatibility boundary. */
export interface DevLocalServices {
  /**
   * Joins native local resource cleanup before session shutdown completes.
   * @returns Shared local owner release completion.
   */
  readonly close: () => Promise<void>;
}
/** Development host inputs; all process/session resources belong to one lifetime. */
export interface DevOptions {
  readonly projectRoot?: string;
  readonly compile: CandidateCompile;
  readonly activationFingerprint?: DevActivationFingerprint;
  /**
   * Reuses the prepared identity only for a child installed from that validated receipt.
   * @param candidate - SDK child associated with one immutable preparation result.
   * @returns Its accepted identity, or absence for an independently checked fallback child.
   */
  readonly preparedActivationFingerprint?: (
    candidate: StartedCandidate,
  ) => RuntimeActivationFingerprint | undefined;
  /**
   * Proves application readiness after mandatory SDK cohort verification.
   * @param candidate - Unpublished child already matched to its graph/cohort.
   * @param signal - Activation cancellation consumed by readiness HTTP work.
   * @returns Joined proof or typed rejection before switching traffic.
   */
  readonly candidateVerificationEffect?: (
    candidate: StartedCandidate,
    signal: AbortSignal,
  ) => Effect.Effect<void, CliAdapterError>;
  /** Releases any request retained as the candidate's real route proof after publication. */
  readonly candidateVerificationPublished?: (candidate: StartedCandidate) => void;
  /** Releases a request retained by a candidate that could not be published. */
  readonly candidateVerificationRejected?: (candidate: StartedCandidate) => void;
  /**
   * Checks the final input epoch in the atomic traffic-switch turn.
   * @param candidate - Verified unpublished child.
   * @returns False when its prepared input epoch is obsolete.
   */
  readonly candidateAdmission?: (candidate: StartedCandidate) => boolean;
  readonly hostname?: string;
  readonly candidateHostname?: string;
  readonly stablePort?: number;
  readonly generatedDirectory?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maxStartupOutputBytes?: number;
  readonly candidateStopTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
  /** Permits immutable prepared candidates to overlap independent health reads. */
  readonly candidateVerificationConcurrentHealth?: boolean;
  /** Native verification transport; prepared sessions restrict bearer credentials to internal probes. */
  readonly candidateVerificationFetch?: typeof fetch;
  readonly drainTimeoutMs?: number;
  readonly inspector?: Pick<InspectionBridgeOptions, "host" | "port"> | false;
  readonly inspectionRecords?: InspectionBridgeOptions["records"];
  /** Bridge credentials shared by every generation; generated when inspection starts enabled. */
  readonly inspectionIdentity?: { readonly sessionId: string; readonly token: string };
  /**
   * Reads the bridge policy an accepted generation was built with.
   * @param generationToken - Promoted generation.
   * @returns Its policy, or undefined when the session keeps its current bridge.
   */
  readonly inspectionPolicy?: (generationToken: number) => DevOptions["inspector"] | undefined;
  /**
   * Observes a bridge policy after the session switched its bridge to it.
   * @param policy - Newly applied bridge policy.
   * @returns Completion after policy-owned resources are released or retained.
   */
  readonly inspectionApplied?: (policy: DevOptions["inspector"]) => Effect.Effect<void>;
  /** Grace period after backend activation before optional inspector acquisition. */
  readonly supportStartupDelayMs?: number;
  readonly spawn?: typeof Bun.spawn;
  readonly signal?: AbortSignal;
  readonly installSignalHandlers?: boolean;
  readonly logger?: Omit<LoggerOptions, "component">;
  readonly onLog?: DevLog;
  /**
   * Consumes a projected native log envelope without lifecycle authority.
   * @param record - Existing structured log record.
   * @param origin - Declared process source.
   * @returns No value after synchronous admission.
   */
  readonly onRecord?: (record: LogRecord, origin: "application" | "relkit" | "inspector") => void;
  /**
   * Optionally intercepts a stable-proxy request before application routing.
   * @param request - Native incoming request.
   * @returns A native response receipt or absence to delegate to the backend.
   */
  readonly intercept?: (request: Request) => Promise<Response> | undefined;
  /**
   * Closes callback admission when shutdown begins.
   * @returns No value; resource cleanup remains with the session Scope.
   */
  readonly onStopping?: () => void;
  readonly terminal?: {
    readonly verbose?: boolean;
    readonly color?: boolean;
    readonly columns?: number;
  };
  readonly observability?: Omit<SupervisorObservabilityOptions, "activationFingerprint">;
  readonly localServices?: DevLocalServices;
  /** Native orchestration hook; acquired local owners close in the same session graph. */
  readonly localServicesEffect?: Effect.Effect<void>;
  /**
   * Native invalidation hook, captured by the owning compiler/cache service.
   * @param files - Admitted changed paths.
   * @returns Lazy session cache invalidation before the next compilation.
   */
  readonly sourceChangedEffect?: (files: readonly string[]) => Effect.Effect<void>;
}
