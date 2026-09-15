import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInInvocationScope, currentInvocationScope } from "@relkit/invocation";
import {
  createJobsRuntime,
  runInJobsRuntime,
  type JobsManifestLike,
  type JobsRuntime,
  type JobsRuntimeOptions,
} from "./runtime.js";

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

/** Server runtime hook; the native runtime is installed by the selected adapter. */
export async function runWithJobs<A>(
  config: RunWithJobsConfig,
  callback: () => A | PromiseLike<A>,
): Promise<Awaited<A>> {
  const ownedRuntime = config.runtime === undefined;
  const runtime = config.runtime ?? createJobsRuntime(runtimeOptions(config, await readManifest(config)));
  const parent = currentInvocationScope();
  try {
    return await runInJobsRuntime(runtime, () =>
      runInInvocationScope(
        Object.freeze({
          ...(parent ?? {}),
          jobsRuntime: runtime,
        }),
        callback,
      ),
    );
  } finally {
    if (ownedRuntime) await runtime.close();
  }
}

function runtimeOptions(
  config: RunWithJobsConfig,
  manifest: JobsManifestLike | undefined,
): JobsRuntimeOptions {
  return {
    ...(config.adapter === undefined ? {} : { adapter: config.adapter }),
    ...(config.provider === undefined ? {} : { provider: config.provider }),
    ...(config.providerHandle === undefined ? {} : { providerHandle: config.providerHandle }),
    ...(config.application === undefined ? {} : { application: config.application }),
    ...(config.environment === undefined ? {} : { environment: config.environment }),
    ...(config.scope === undefined ? {} : { scope: config.scope }),
    ...(config.service === undefined ? {} : { service: config.service }),
    ...(config.serviceGeneration === undefined ? {} : { serviceGeneration: config.serviceGeneration }),
    ...(config.capabilities === undefined ? {} : { capabilities: config.capabilities }),
    ...(config.jobs === undefined ? {} : { jobs: config.jobs }),
    ...(config.taskExecutor === undefined ? {} : { taskExecutor: config.taskExecutor }),
    ...(manifest === undefined ? {} : { manifest }),
  };
}

async function readManifest(config: RunWithJobsConfig): Promise<JobsManifestLike | undefined> {
  const path = config.manifestPath ?? join(config.projectRoot, ".relkit", "generated", "jobs.manifest.json");
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Jobs manifest must be an object");
    }
    const manifest = value as JobsManifestLike;
    if (manifest.protocol !== undefined && manifest.protocol !== "relkit.jobs-manifest") {
      throw new TypeError("Unsupported jobs manifest protocol");
    }
    if (manifest.version !== undefined && manifest.version !== 1) {
      throw new TypeError("Unsupported jobs manifest version");
    }
    if (manifest.jobsProtocolVersion !== undefined && manifest.jobsProtocolVersion !== 1) {
      throw new TypeError("Unsupported jobs protocol version");
    }
    return Object.freeze(manifest);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export type { RunResultOptions, ServerTriggerOptions, TriggerOptions } from "./trigger-types.js";
