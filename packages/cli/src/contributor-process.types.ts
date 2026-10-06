import type { ChildProcess } from "node:child_process";
import type { Effect } from "effect";
import type { CliAdapterError } from "./cli-errors.js";

/** A scoped inherited-terminal invocation with no pipe ownership. */
export interface ContributorTerminalCapabilities {
  /**
   * Runs a contributor launcher with borrowed terminal streams.
   * @param command - Executable followed by literal arguments.
   * @param cwd - Caller working directory.
   * @returns Native exit status after process-group cleanup.
   */
  readonly run: (command: readonly string[], cwd: string) => Effect.Effect<number, CliAdapterError>;
}
/** Native child and one physical completion receipt owned by its scope. */
export interface ContributorTerminalChild {
  readonly child: ChildProcess;
  readonly exited: Promise<number>;
}
