/** Contracts of the warm development checker client. */
import type { ChildProcess } from "node:child_process";
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { CheckResult } from "./check-result.js";
import type { DevCheckMessage, DevCheckRequest } from "./dev-check.types.js";

/** Session-owned warm checker. */
export interface DevChecker {
  /**
   * Checks the project in the warm worker, starting it on first use.
   * @param request - Project root and generation identity.
   * @returns The check result; transport and worker failures are typed.
   */
  readonly check: (request: DevCheckRequest) => Effect.Effect<CheckResult, CliAdapterError>;
  /** @returns Candidates the warm evaluator imported again for the last check. */
  readonly reimported: () => readonly string[];
  /** Kills the worker group and waits for it. */
  readonly close: Effect.Effect<void>;
}

/** A running worker process. */
export interface DevCheckerWorker {
  readonly root: string;
  readonly child: ChildProcess;
  /** Whether the worker leads its own process group. */
  readonly grouped: boolean;
  exited: boolean;
  /**
   * Sends one request and waits for the response with the same ID.
   * @param message - Correlated request.
   * @returns The raw response, validated by the caller.
   */
  readonly request: (message: DevCheckMessage) => Promise<object>;
}
