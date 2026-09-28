import type { Effect } from "effect";
import type { JobsManifestLike, JobsRuntime, JobsRuntimeOptions } from "./runtime.js";
import type { JobsServerError } from "./server-manifest.js";

export type { JobsManifestLike, JobsRuntimeOptions } from "./runtime.js";

/** Options for a server invocation with a jobs runtime.
 * The caller retains ownership when runtime is supplied.
 * @example const config: RunWithJobsConfig = { projectRoot: process.cwd() };
 */
export interface RunWithJobsConfig {
  readonly projectRoot: string;
  readonly environment?: string;
  readonly manifestPath?: string;
  readonly runtime?: JobsRuntime;
  readonly adapter?: unknown;
  readonly provider?: unknown;
  readonly providerHandle?: { readonly value: unknown };
  readonly application?: string;
  readonly scope?: string;
  readonly service?: string;
  readonly serviceGeneration?: string;
  readonly capabilities?: JobsRuntimeOptions["capabilities"];
  readonly jobs?: JobsRuntimeOptions["jobs"];
  readonly taskExecutor?: JobsRuntimeOptions["taskExecutor"];
}

/** Injectable file reader for manifest loading.
 * @example const reader: JobsManifestReaderService = { read: () => Effect.succeed("{}") };
 */
export interface JobsManifestReaderService {
  /** Reads UTF-8 manifest data.
   * @param path - Resolved manifest path.
   * @returns File contents or JobsServerError.
   * @example reader.read("/project/.relkit/generated/jobs.manifest.json");
   */
  readonly read: (path: string) => Effect.Effect<string, JobsServerError>;
}
