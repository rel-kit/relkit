import type { Deferred, Effect, Fiber } from "effect";
import type { LoggerOptions } from "@relkit/runtime-effect/logger";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type { SupervisorStateMachine } from "./state-machine.js";

/** Source revision admitted synchronously by a watcher owner. */
export interface SupervisorSourceChange {
  readonly version: number;
  readonly changedFiles?: readonly string[];
}

/** Native compilation must consume the owner cancellation signal. */
export interface SupervisorCompileRequest {
  readonly token: SupervisorCandidateToken;
  readonly version: number;
  readonly changedFiles: readonly string[];
  readonly signal: AbortSignal;
  /** Checks source and generation identity. @returns False after replacement or disposal. */
  readonly isCurrent: () => boolean;
}

/** Compiles a coalesced source batch. @param request - Owned identity and cancellation.
 * @returns Native completion; rejection retains the active generation.
 */
export type SupervisorCompile = (request: SupervisorCompileRequest) => void | PromiseLike<void>;

/** Watcher dependencies and explicit timing/sink configuration. */
export interface SupervisorWatcherOptions {
  readonly compile: SupervisorCompile;
  readonly debounceMs?: number;
  readonly stateMachine?: SupervisorStateMachine;
  readonly logger?: LoggerOptions;
}

/** Coalescing retains at most one pending batch. */
export interface PendingChange {
  readonly token: SupervisorCandidateToken;
  readonly version: number;
  readonly changedFiles: readonly string[];
}

/** Compile worker and join point owned by the watcher scope. */
export interface ActiveCompile {
  readonly pending: PendingChange;
  readonly controller: AbortController;
  readonly done: Deferred.Deferred<void>;
  readonly fiber?: Fiber.Fiber<void>;
}

/** Atomic watcher state; native callbacks borrow this authoritative snapshot. */
export interface WatcherState {
  readonly admission: WatcherAdmission | undefined;
  readonly version: number | undefined;
  readonly pending: PendingChange | undefined;
  readonly active: ActiveCompile | undefined;
  readonly disposed: boolean;
}

/** Source reservation established before native activation listeners can reenter notification. */
export interface WatcherAdmission {
  readonly identity: symbol;
  readonly changedFiles: readonly string[];
}

/** Replaceable source scheduling workflow with synchronous admission. */
export interface WatcherService {
  readonly version: Effect.Effect<number | undefined>;
  /** Accepts source. @param change - Revision/files. @returns Token or stale rejection. */
  readonly notify: (
    change: SupervisorSourceChange,
  ) => Effect.Effect<SupervisorCandidateToken | undefined, Error>;
  /** Bypasses debounce and joins work. @returns Accepted work has settled. */
  readonly flush: Effect.Effect<void>;
  /** Stops admission and cancels native work. @returns Owner disposal joins fibers. */
  readonly dispose: Effect.Effect<void>;
}
