import type { LoggerOptions, LogLevel, LogRecord } from "@relkit/runtime-effect";
import type { Effect } from "effect";
import type { JsonValue, RuntimeActivationFingerprint } from "@relkit/contracts";
import type {
  CandidateCompile,
  StartedCandidate,
  SupervisorObservabilityOptions,
} from "@relkit/supervisor";
import type { DevInspectorOptions } from "./dev-process.types.js";

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
  readonly hostname?: string;
  readonly candidateHostname?: string;
  readonly stablePort?: number;
  readonly generatedDirectory?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maxStartupOutputBytes?: number;
  readonly candidateStopTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
  readonly drainTimeoutMs?: number;
  readonly inspector?: DevInspectorOptions | false;
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
