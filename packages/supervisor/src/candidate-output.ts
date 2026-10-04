import type { CandidateLogEvent, CandidateLogger, CandidateOutput } from "./candidate.types.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import { captureOutputLines } from "./output-lines.js";
import type { CandidateOutputBudget, RetainedCandidateOutput } from "./candidate-output.types.js";

/** Consumes exactly two native streams under one retained-byte budget. @param child - Owned process.
 * @param logger - Native block sink. @param token - Generation identity. @param directory - Generation path.
 * @param limit - Shared retained-byte budget. @param signal - Owned reader cancellation.
 * @returns Diagnostics after both readers and framing timers release. */
export function captureOutput(
  child: Bun.ReadableSubprocess,
  logger: CandidateLogger | undefined,
  token: SupervisorCandidateToken,
  directory: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CandidateOutput> {
  const budget = { remaining: limit, truncated: false };
  return Promise.all([
    captureStream(child.stdout, "stdout", logger, token, directory, budget, signal),
    captureStream(child.stderr, "stderr", logger, token, directory, budget, signal),
  ]).then(([stdout, stderr]) => ({
    stdout: stdout.text,
    stderr: stderr.text,
    truncated: budget.truncated || stdout.truncated || stderr.truncated,
  }));
}

/** Retains and frames one native output stream. @param stream - Owned reader.
 * @param channel - Fixed stdout/stderr label. @param logger - Native sink. @param token - Generation identity.
 * @param directory - Generation path. @param budget - Shared retention policy. @param signal - Owned cancellation.
 * @returns Bounded diagnostics with cancellation/truncation evidence. */
async function captureStream(
  stream: ReadableStream<Uint8Array>,
  channel: "stdout" | "stderr",
  logger: CandidateLogger | undefined,
  token: SupervisorCandidateToken,
  directory: string,
  budget: CandidateOutputBudget,
  signal: AbortSignal | undefined,
): Promise<RetainedCandidateOutput> {
  const retained: Uint8Array[] = [];
  let truncated = false;
  try {
    await captureOutputLines(
      stream,
      (output) => logOutput(logger, token, directory, channel, output),
      {
        ...(signal === undefined ? {} : { signal }),
        retain: (bytes) => {
          const part = bytes.subarray(0, Math.max(0, budget.remaining));
          if (part.byteLength > 0) retained.push(part.slice());
          budget.remaining -= part.byteLength;
          if (part.byteLength < bytes.byteLength) truncated = budget.truncated = true;
        },
      },
    );
  } catch {
    truncated = true;
  }
  return {
    text: Buffer.concat(retained)
      .toString("utf8")
      .replace(/\uFFFD$/, ""),
    truncated: truncated || signal?.aborted === true,
  };
}

/** Adapts a framed block to the existing native sink. @param logger - Isolated sink.
 * @param token - Generation identity. @param directory - Generation path. @param channel - Fixed stream.
 * @param output - Already bounded native output block. */
function logOutput(
  logger: CandidateLogger | undefined,
  token: SupervisorCandidateToken,
  directory: string,
  channel: "stdout" | "stderr",
  output: string,
): void {
  const event: CandidateLogEvent = {
    level: channel === "stderr" ? "warn" : "info",
    event: "candidate.startup-output",
    token,
    directory,
    stream: channel,
    output,
  };
  try {
    logger?.(event);
  } catch {
    // Logging failures must not change candidate lifecycle behavior.
  }
}
