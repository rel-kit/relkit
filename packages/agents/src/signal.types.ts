import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";

/** Options whose limits and caller signal determine an execution deadline. */
export type ExecutionSignalOptions = AgentRuntimeOptions & AgentInvocationOptions;

/** Live execution signal whose owner must call close once finished. */
export interface ExecutionSignalHandle {
  readonly signal: AbortSignal;
  /** Clears the deadline timer and caller signal listener.
   * @returns Nothing; repeated calls are safe.
   * @example handle.close();
   */
  readonly close: () => void;
}

/** Replaceable deadline timer and current time boundary. */
export interface ExecutionSignalClockService {
  /** Reads the current wall time in milliseconds.
   * @returns Epoch milliseconds.
   * @example clock.now();
   */
  readonly now: () => number;
  /** Schedules a deadline callback.
   * @param callback - Deadline action.
   * @param delayMs - Nonnegative delay.
   * @returns Opaque timer handle.
   * @example clock.setTimeout(onDeadline, 1000);
   */
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  /** Cancels a scheduled callback.
   * @param handle - Opaque timer handle.
   * @returns Nothing.
   * @example clock.clearTimeout(handle);
   */
  readonly clearTimeout: (handle: unknown) => void;
}
