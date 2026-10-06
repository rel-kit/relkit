import type { Effect, Scope } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Existing production-start options, including native adapter overrides. */
export interface StartOptions {
  readonly projectRoot?: string;
  readonly buildDirectory?: string;
  readonly hostname?: string;
  readonly port?: number;
  readonly healthTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
  readonly spawn?: typeof Bun.spawn;
}

/** Caller-owned production handle; stop settles process and response drains exactly once. */
export interface StartedProject {
  readonly projectRoot: string;
  readonly buildDirectory: string;
  readonly hostname: string;
  readonly port: number;
  readonly process: Bun.ReadableSubprocess;
  readonly exited: Promise<number>;
  readonly stop: () => Promise<void>;
}

/** Scoped domain handle: native ownership stays with the supplied lifetime scope. */
export interface ScopedStartedProject extends Omit<StartedProject, "stop"> {
  /**
   * Stops the owned child and waits for its readers.
   * @returns A lazy idempotent stop; its completion is shared with every caller.
   */
  readonly stopEffect: Effect.Effect<void, CliAdapterError>;
}

/** Production-start authority, acquired from built-artifact and native capabilities. */
export interface StartOperations {
  /**
   * Starts and awaits readiness in the caller's explicit scope.
   * @param options - Build, bind and native policy.
   * @returns A handle requiring Scope; closure stops resources before the owner settles.
   */
  readonly start: (
    options: StartOptions,
  ) => Effect.Effect<ScopedStartedProject, CliAdapterError, Scope.Scope>;
}

/** Native startup identity supplied to the child-process capability. */
export interface StartProcessRequest {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly stopTimeoutMs: number;
}

/** Native process boundary with physical pipe and child settlement. */
export interface StartProcessOperations {
  /**
   * Acquires a process and installs cleanup before publishing the handle.
   * @param request - Literal command and environment.
   * @returns Owned child plus shared stop, requiring caller lifetime Scope.
   */
  readonly spawn: (request: StartProcessRequest) => Effect.Effect<
    {
      readonly child: Bun.ReadableSubprocess;
      readonly stop: Effect.Effect<void, CliAdapterError>;
    },
    CliAdapterError,
    Scope.Scope
  >;
}

/** Probe callbacks captured once per native startup Layer. */
export interface StartNativeOperations {
  /**
   * Allocates dynamic port zero through a finite listener.
   * @param port - Requested port.
   * @param hostname - Bind address.
   * @returns Actual port only after the listener closes.
   */
  readonly allocate: (port: number, hostname: string) => Effect.Effect<number, CliAdapterError>;
  /**
   * Sends one cancellable readiness request and closes its response body.
   * @param url - Fixed health endpoint.
   * @returns HTTP success status after body release.
   */
  readonly health: (url: string) => Effect.Effect<boolean, CliAdapterError>;
}
