/** Presents a stop requested with Ctrl+C or a termination signal as a quiet closing line, not an error. */
import type { CliFailure, CliIo } from "./main-support-types.js";

/** The line printed when a command stopped on a signal without printing a closing line itself. */
export const STOPPED_LINE = "Stopped.";

/** Text of the closing line `relkit dev` prints through its logger when its shutdown is complete. */
const OWN_CLOSING_LINES = ["Development server stopped"];

/**
 * Tells a stop the user asked for from a hangup or a failure no signal explains.
 * @param failure - Terminal failure after the command released its resources.
 * @returns Whether the failure came from SIGINT or SIGTERM.
 */
export function isStopSignal(failure: CliFailure): boolean {
  return (
    failure.code === "RELKIT_INTERRUPTED" &&
    (failure.signal === "SIGINT" || failure.signal === "SIGTERM")
  );
}

/** Output sinks that remember whether the command closed itself. */
export interface ClosingLineTracker {
  /** Sinks to give the invocation; they forward every line unchanged. */
  readonly io: CliIo;
  /** Whether a line from the command's own shutdown went out. */
  readonly closed: () => boolean;
}

/**
 * Wraps the invocation's sinks to notice a command's own closing line.
 * @param io - Caller-owned stdout and stderr sinks.
 * @returns The forwarding sinks and the closing-line probe.
 */
export function trackClosingLine(io: CliIo): ClosingLineTracker {
  let closed = false;
  const watch = (write: (line: string) => void) => (line: string) => {
    if (OWN_CLOSING_LINES.some((closing) => line.includes(closing))) closed = true;
    write(line);
  };
  return { io: { stdout: watch(io.stdout), stderr: watch(io.stderr) }, closed: () => closed };
}
