export interface RunWithJobsConfig {
  readonly projectRoot: string;
  readonly environment?: string;
  readonly manifestPath?: string;
}

/** Server runtime hook; the native runtime is installed by the selected adapter. */
export async function runWithJobs<A>(
  _config: RunWithJobsConfig,
  _callback: () => A | PromiseLike<A>,
): Promise<Awaited<A>> {
  throw new Error("RELKIT_JOBS_RUNTIME_UNBOUND");
}

export type { RunResultOptions, ServerTriggerOptions, TriggerOptions } from "./trigger-types.js";
