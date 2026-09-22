import { currentTaskAncestry } from "@relkit/invocation";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import { durationToMillis } from "./duration.js";
import { validateResultOptions } from "./trigger-validation.js";
import type { RunResultOptions } from "./trigger-types.js";
import { JobResultUnavailableError, TaskBlockingWaitError } from "./control-errors.js";
import type { JobsRuntime } from "./runtime.js";
import { isTerminal } from "./control-support.js";

export type ReadRun = (
  runtime: JobsRuntime,
  runId: string,
  signal?: AbortSignal,
) => Promise<RunSnapshot>;

export async function waitForResult(
  runtime: JobsRuntime,
  runId: string,
  options: RunResultOptions,
  readRun: ReadRun,
): Promise<unknown> {
  if (currentTaskAncestry() !== undefined) throw new TaskBlockingWaitError();
  const parsed = validateResultOptions(options);
  const timeoutMs = durationToMillis(parsed.timeout);
  const signal = parsed.signal ?? new AbortController().signal;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (signal.aborted) throw signal.reason ?? new Error("Result observation aborted");
    const run = await readRun(runtime, runId, signal);
    if (isTerminal(run)) {
      if (run.resultAvailability === "void") return undefined;
      if (run.resultAvailability !== "available")
        throw new JobResultUnavailableError(run.resultAvailability);
      return "output" in run ? run.output : undefined;
    }
    if (Date.now() >= deadline)
      throw new JobResultUnavailableError("pending", "Timed out waiting for the job result");
    await sleep(Math.min(50, Math.max(1, deadline - Date.now())), signal);
  }
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Observation aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
