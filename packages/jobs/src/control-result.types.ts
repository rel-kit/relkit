import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { JobsRuntime } from "./runtime.js";
/** Substitutable snapshot reader for result polling. */
export type ReadRun = (
  runtime: JobsRuntime,
  runId: string,
  signal?: AbortSignal,
) => Promise<RunSnapshot>;
