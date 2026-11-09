import type { Schema } from "effect";
import type { EvaluatorProcessResult } from "./evaluator-process.js";

/** Minimal externally owned Bun-compatible child process capability. */
export interface EvaluatorProcess {
  readonly stdin: {
    /**
     * Writes serialized request bytes to the process.
     * @param value - Canonical request JSON.
     * @returns Accepted byte count, synchronously or after native backpressure.
     */
    readonly write: (value: string) => number | Promise<number>;

    /**
     * Closes the request pipe after the accepted write.
     * @returns The native close result.
     */
    readonly end: () => unknown;
  };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly exitCode: number | null;

  /**
   * Terminates the child at the operating-system boundary.
   * @param signal - Forced termination signal.
   * @returns Nothing after requesting termination.
   */
  readonly kill: (signal: "SIGKILL") => void;
}

/**
 * Native spawn adapter supplied by the Bun ingress or deterministic tests.
 * @returns The native process capability whose lifetime the evaluator scope owns.
 */
export type SpawnEvaluator = () => EvaluatorProcess;

/** Reaped child status and fully drained output. */
export type EvaluatorProcessResult = Schema.Schema.Type<typeof EvaluatorProcessResult>;
