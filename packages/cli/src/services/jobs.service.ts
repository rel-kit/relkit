import { Context, Effect, Layer } from "effect";
import { CliFileSystem, fileSystemLayer } from "./filesystem.service.js";
import { CliHttp, httpLayer } from "./http.service.js";
import { CliJobsSdk, jobsSdkLiveLayer } from "./jobs-sdk.service.js";
import { observeCli } from "../cli-runtime.js";
import { cliTry } from "../cli-errors.js";
import { jobsBaseUrl } from "../commands/jobs-base-url.js";
import { jobsIdentityHeadersEffect, fetchJobsJsonEffect } from "../commands/jobs-http.js";
import { readJobsJsonFileEffect, readJobsManifestEffect } from "../commands/jobs-json.js";
import { triggerJobEffect, watchJobEffect } from "../commands/jobs-rpc-core.js";
import type { JobsOperations } from "./jobs.types.js";
import { withJobsSignal } from "../commands/jobs-signal.js";

/** Native jobs control and watch authority, acquired only for a jobs invocation. */
export class CliJobs extends Context.Service<CliJobs, JobsOperations>()("relkit/cli/Jobs") {}

/**
 * Captures explicit filesystem, HTTP and SDK authority without executing a request.
 * @returns A domain Layer requiring all three adapters, with no hidden method authority.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const listed = Effect.gen(function* () {
 *   const jobs = yield* CliJobs;
 *   return yield* jobs.manifest(process.cwd());
 * }).pipe(Effect.provide(jobsLiveLayer()));
 * ```
 */
export const jobsLayer = Layer.effect(
  CliJobs,
  Effect.gen(function* () {
    const files = yield* CliFileSystem;
    const http = yield* CliHttp;
    const sdk = yield* CliJobsSdk;
    const authority = Context.empty().pipe(
      Context.add(CliFileSystem, files),
      Context.add(CliHttp, http),
      Context.add(CliJobsSdk, sdk),
    );
    return CliJobs.of({
      request: (parsed, method, path, options = {}) =>
        observeCli(
          "jobs.request",
          Effect.scoped(
            Effect.gen(function* () {
              const baseUrl = yield* cliTry("jobs.base-url", () => jobsBaseUrl());
              return yield* fetchJobsJsonEffect(baseUrl, parsed, method, path, options);
            }).pipe(Effect.provideContext(authority), (effect) =>
              withJobsSignal(effect, options.signal),
            ),
          ),
        ),
      identity: () =>
        observeCli(
          "jobs.identity",
          Effect.scoped(
            Effect.gen(function* () {
              const baseUrl = yield* cliTry("jobs.base-url", () => jobsBaseUrl());
              return yield* jobsIdentityHeadersEffect(baseUrl);
            }).pipe(Effect.provideContext(authority)),
          ),
        ),
      jsonFile: (root, path) =>
        observeCli(
          "jobs.json-file",
          readJobsJsonFileEffect(root, path).pipe(Effect.provideContext(authority)),
        ),
      manifest: (root) =>
        observeCli(
          "jobs.manifest",
          readJobsManifestEffect(root).pipe(Effect.provideContext(authority)),
        ),
      trigger: (parsed, signal) =>
        observeCli(
          "jobs.trigger",
          Effect.scoped(
            Effect.gen(function* () {
              const baseUrl = yield* cliTry("jobs.base-url", () => jobsBaseUrl());
              return yield* triggerJobEffect(baseUrl, parsed, signal);
            }).pipe(Effect.provideContext(authority), (effect) => withJobsSignal(effect, signal)),
          ),
        ),
      watch: (parsed, context) =>
        observeCli(
          "jobs.watch",
          Effect.scoped(
            Effect.gen(function* () {
              const baseUrl = yield* cliTry("jobs.base-url", () => jobsBaseUrl());
              yield* watchJobEffect(baseUrl, parsed, context);
            }).pipe(Effect.provideContext(authority), (effect) =>
              withJobsSignal(effect, context.signal),
            ),
          ),
        ),
    });
  }),
);

/**
 * Provides the invocation-owned jobs graph without session caching.
 * @returns A complete finite-request/stream domain Layer.
 */
export function jobsLiveLayer() {
  return jobsLayer.pipe(
    Layer.provide(Layer.mergeAll(fileSystemLayer, httpLayer, jobsSdkLiveLayer)),
  );
}
