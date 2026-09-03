import type { CandidateLogEvent, CandidateLogger, CandidateOutput } from "./candidate-types.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";
import { captureOutputLines } from "./output-lines.js";

export function captureOutput(
  child: Bun.ReadableSubprocess,
  logger: CandidateLogger | undefined,
  token: SupervisorCandidateToken,
  directory: string,
  limit: number,
): Promise<CandidateOutput> {
  const budget = { remaining: limit, truncated: false };
  return Promise.all([
    captureStream(child.stdout, "stdout", logger, token, directory, budget),
    captureStream(child.stderr, "stderr", logger, token, directory, budget),
  ]).then(([stdout, stderr]) => ({
    stdout: stdout.text,
    stderr: stderr.text,
    truncated: budget.truncated || stdout.truncated || stderr.truncated,
  }));
}

async function captureStream(
  stream: ReadableStream<Uint8Array>,
  channel: "stdout" | "stderr",
  logger: CandidateLogger | undefined,
  token: SupervisorCandidateToken,
  directory: string,
  budget: { remaining: number; truncated: boolean },
): Promise<{ readonly text: string; readonly truncated: boolean }> {
  const retained: Uint8Array[] = [];
  let truncated = false;
  try {
    await captureOutputLines(
      stream,
      (output) => logOutput(logger, token, directory, channel, output),
      {
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
    truncated,
  };
}

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
