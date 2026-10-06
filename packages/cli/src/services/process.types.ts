import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** A subprocess invocation with bounded captured output and no inherited secret diagnostics. */
export interface ProcessRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maximumOutputBytes?: number;
}

/** Completed native process output, available only after its owned readers and child settle. */
export interface ProcessOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Scoped process execution authority. */
export interface ProcessCapabilities {
  /**
   * Executes one process with concurrent readers and process-group cleanup.
   * @param request - Command, working directory, optional environment, and output bound.
   * @returns Lazy reaped output or a typed native failure; interruption kills owned children.
   */
  readonly run: (request: ProcessRequest) => Effect.Effect<ProcessOutput, CliAdapterError>;
}

/** Internal native handle; only the owning scope may terminate its process group. */
export interface OwnedProcess {
  readonly child: Pick<ChildProcessWithoutNullStreams, "pid" | "exitCode" | "kill">;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exited: Promise<number>;
}
