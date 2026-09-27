import { Effect, Result } from "effect";
import { runInInvocationScope, currentInvocationScope } from "@relkit/invocation";
import { createJobsRuntime, runInJobsRuntime } from "./runtime.js";
import { observeJobs } from "./jobs-observability.js";
import {
  JobsManifestReaderLive,
  JobsServerError,
  readJobsManifestEffect,
} from "./server-manifest.js";
import type { JobsManifestLike, JobsRuntimeOptions, RunWithJobsConfig } from "./server.types.js";
import type { JobsRuntime } from "./runtime.js";

export type { RunWithJobsConfig } from "./server.types.js";
export { JobsManifestReader, JobsManifestReaderLive, JobsServerError } from "./server-manifest.js";

/** Runs a server callback inside an owned or borrowed jobs runtime.
 * An owned runtime closes after success, typed failure, or interruption.
 * @param config - Runtime and manifest configuration.
 * @param callback - Work that uses the installed jobs runtime.
 * @returns An Effect of the callback result or JobsServerError.
 * @example Effect.provide(runWithJobsEffect({ projectRoot: "." }, () => "ok"), JobsManifestReaderLive);
 */
export const runWithJobsEffect = Effect.fn("Jobs.runWithJobs")(
  function* <A>(config: RunWithJobsConfig, callback: () => A | PromiseLike<A>) {
    const parent = currentInvocationScope();
    const use = (runtime: JobsRuntime) =>
      Effect.tryPromise({
        try: async () =>
          await runInJobsRuntime(runtime, () =>
            runInInvocationScope(
              Object.freeze({ ...(parent ?? {}), jobsRuntime: runtime }),
              callback,
            ),
          ),
        catch: (cause: unknown) => new JobsServerError({ operation: "callback", cause }),
      });
    if (config.runtime !== undefined) return yield* use(config.runtime);
    const manifest = yield* readJobsManifestEffect(config);
    const options = yield* runtimeOptionsEffect(config, manifest);
    return yield* Effect.acquireUseRelease(
      Effect.try({
        try: () => createJobsRuntime(options),
        catch: (cause) => new JobsServerError({ operation: "createRuntime", cause }),
      }),
      use,
      (runtime) =>
        Effect.tryPromise({
          try: () => runtime.close(),
          catch: (cause) => new JobsServerError({ operation: "closeRuntime", cause }),
        }),
    );
  },
  (effect) => observeJobs("server.run", effect),
);

/** Promise compatibility adapter for server invocation.
 * @param config - Runtime and manifest configuration.
 * @param callback - Work that uses the jobs runtime.
 * @returns A Promise of the callback result.
 * @throws The original manifest, runtime, callback, or close error.
 * @example await runWithJobs({ projectRoot: "." }, () => "ok");
 */
export async function runWithJobs<A>(
  config: RunWithJobsConfig,
  callback: () => A | PromiseLike<A>,
): Promise<Awaited<A>> {
  const result = await Effect.runPromise(
    Effect.result(Effect.provide(runWithJobsEffect(config, callback), JobsManifestReaderLive)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return await Promise.resolve(result.success);
}

/** Copies runtime options without sharing mutable user input. */
const runtimeOptionsEffect = Effect.fn("Jobs.runtimeOptions")(
  function* (
    config: RunWithJobsConfig,
    manifest: JobsManifestLike | undefined,
  ): Generator<never, JobsRuntimeOptions, never> {
    return {
      ...(config.adapter === undefined ? {} : { adapter: config.adapter }),
      ...(config.provider === undefined ? {} : { provider: config.provider }),
      ...(config.providerHandle === undefined ? {} : { providerHandle: config.providerHandle }),
      ...(config.application === undefined ? {} : { application: config.application }),
      ...(config.environment === undefined ? {} : { environment: config.environment }),
      ...(config.scope === undefined ? {} : { scope: config.scope }),
      ...(config.service === undefined ? {} : { service: config.service }),
      ...(config.serviceGeneration === undefined
        ? {}
        : { serviceGeneration: config.serviceGeneration }),
      ...(config.capabilities === undefined ? {} : { capabilities: config.capabilities }),
      ...(config.jobs === undefined ? {} : { jobs: config.jobs }),
      ...(config.taskExecutor === undefined ? {} : { taskExecutor: config.taskExecutor }),
      ...(manifest === undefined ? {} : { manifest }),
    };
  },
  (effect) => observeJobs("server.runtimeOptions", effect),
);

export type { RunResultOptions, ServerTriggerOptions, TriggerOptions } from "./trigger.types.js";
