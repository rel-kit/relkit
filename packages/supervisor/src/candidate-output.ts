import type { CandidateLogEvent, CandidateLogger, CandidateOutput } from "./candidate-types.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";

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
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const part = next.value.subarray(0, Math.max(0, budget.remaining));
      if (part.byteLength > 0) {
        const chunk = decoder.decode(part, { stream: part.byteLength < next.value.byteLength });
        text += chunk;
        budget.remaining -= part.byteLength;
        logOutput(logger, token, directory, channel, chunk);
      }
      if (part.byteLength < next.value.byteLength) {
        truncated = true;
        budget.truncated = true;
      }
    }
    text += decoder.decode();
  } catch {
    truncated = true;
  } finally {
    reader.releaseLock();
  }
  return { text, truncated };
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
