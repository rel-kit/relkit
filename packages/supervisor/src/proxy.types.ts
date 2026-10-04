import type { LoggerOptions } from "@relkit/runtime-effect/logger";
import type { Effect, Scope } from "effect";
import type { StartedCandidate } from "./candidate.types.js";
import type { SupervisorDrainLease } from "./drain.types.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";

/** Generation token and native private backend address requested for atomic switching. */
export type SupervisorProxyTarget = Pick<StartedCandidate, "token" | "port"> & {
  readonly hostname?: string;
};

/** Immutable validated generation reference pinned by admitted requests. */
export interface ActiveSupervisorProxyTarget {
  readonly token: SupervisorCandidateToken;
  readonly hostname: string;
  readonly port: number;
}

/** Native forwarding capabilities, existing interception and generation-lease policy. */
export interface SupervisorProxyOptions {
  /** Handles an intercepted request. @param request - Native incoming request. @returns A response Promise or no interception. */
  readonly intercept?: (request: Request) => Promise<Response> | undefined;
  readonly hostname?: string;
  readonly port?: number;
  readonly targetHostname?: string;
  readonly fetch?: typeof fetch;
  /** Acquires generation admission. @param token - Selected generation. @returns A retained lease or rejection during drain. */
  readonly track?: (token: SupervisorCandidateToken) => SupervisorDrainLease | undefined;
  readonly logger?: LoggerOptions;
}

/** One synchronously selected generation and request parent scope. */
export interface ProxyAdmission {
  readonly target: ActiveSupervisorProxyTarget;
  readonly lease: SupervisorDrainLease | undefined;
  readonly scope: Scope.Closeable;
}

/** Atomic target admission and scoped native forwarding workflow. */
export interface SupervisorProxyService {
  /** Reads the immutable active reference. @returns The target or no active generation. */
  readonly target: Effect.Effect<ActiveSupervisorProxyTarget | undefined>;
  /** Switches against a witness atomically. @param expected - Previous identity. @param next - Requested newer target.
   * @returns Whether both revision counters advanced against that witness. */
  readonly compareAndSwitch: (
    expected: SupervisorCandidateToken | undefined,
    next: SupervisorProxyTarget,
  ) => Effect.Effect<boolean, TypeError | RangeError>;
  /** Pins the active target and native drain lease. @returns Admission or drain rejection; caller must attach lease cleanup. */
  readonly admit: Effect.Effect<ProxyAdmission | undefined>;
  /** Owns forwarding through response body termination. @param request - Native request. @returns Owned upstream headers/body. */
  readonly handle: (request: Request) => Effect.Effect<Response, unknown>;
  /** Stops admission before closing requests. @returns The scope whose native workers must be joined. */
  readonly stopAdmission: Effect.Effect<Scope.Closeable>;
  /** Creates a fresh request scope after shutdown. @returns Reopened admission without listening. */
  readonly finishStop: Effect.Effect<void>;
}

/** Single authoritative target and request-scope admission state. */
export interface ProxyState {
  readonly target: ActiveSupervisorProxyTarget | undefined;
  readonly requests: Scope.Closeable;
  readonly stopping: boolean;
}
