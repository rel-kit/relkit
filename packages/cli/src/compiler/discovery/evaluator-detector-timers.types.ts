/** Native timer cancellation capability; opaque handles stay in the session's ownership map. */
export interface TimerRecord {
  /** Native scheduling API that created the handle. */
  readonly kind: "setTimeout" | "setInterval" | "setImmediate";

  /**
   * Cancels this handle using its original platform implementation.
   * @returns Nothing after cancellation; native failures propagate to the owning finalizer.
   */
  readonly cancel: () => void;
}

/**
 * Native output callback used while a scoped candidate owns the process streams.
 * @param stream - Captured process stream.
 * @param value - Text projected by the synchronous native output adapter.
 * @returns Nothing after retaining the candidate observation.
 */
export type OutputCapture = (stream: "stdout" | "stderr", value: string) => void;
