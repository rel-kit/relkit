import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer, Result, Schema } from "effect";
import type {
  JobsManifestLike,
  JobsManifestReaderService,
  RunWithJobsConfig,
} from "./server.types.js";
import { observeJobs } from "./jobs-observability.js";

/** A typed file, manifest, runtime, or callback failure.
 * @example new JobsServerError({ operation: "readManifest", cause: new Error("missing") });
 */
export class JobsServerError extends Schema.TaggedError<JobsServerError>()("Jobs.ServerError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/** Substitutable manifest file reader.
 * @example Effect.provide(readJobsManifestEffect(config), JobsManifestReaderLive);
 */
export class JobsManifestReader extends Context.Service<
  JobsManifestReader,
  JobsManifestReaderService
>()("relkit/jobs/JobsManifestReader") {}

/** Live UTF-8 reader backed by Node's file system.
 * @example Effect.provide(readJobsManifestEffect(config), JobsManifestReaderLive);
 */
export const JobsManifestReaderLive = Layer.succeed(
  JobsManifestReader,
  JobsManifestReader.of({
    read: Effect.fn("Jobs.manifest.readFile")((path: string) =>
      Effect.tryPromise({
        try: () => readFile(path, "utf8"),
        catch: (cause) => new JobsServerError({ operation: "readFile", cause }),
      }),
    ),
  }),
);

/** Reads and validates the optional generated jobs manifest.
 * @param config - Project root and optional override path.
 * @returns A manifest, undefined for ENOENT, or JobsServerError.
 * @example Effect.provide(readJobsManifestEffect({ projectRoot: "." }), JobsManifestReaderLive);
 */
export const readJobsManifestEffect = Effect.fn("Jobs.readManifest")(
  function* (config: RunWithJobsConfig) {
    const path =
      config.manifestPath ?? join(config.projectRoot, ".relkit", "generated", "jobs.manifest.json");
    const reader = yield* JobsManifestReader;
    const result = yield* Effect.result(reader.read(path));
    if (Result.isFailure(result)) {
      const cause = result.failure.cause;
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
      return yield* Effect.fail(result.failure);
    }
    return yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(result.success);
        if (value === null || typeof value !== "object" || Array.isArray(value))
          throw new TypeError("Jobs manifest must be an object");
        const manifest = value as JobsManifestLike;
        if (manifest.protocol !== undefined && manifest.protocol !== "relkit.jobs-manifest")
          throw new TypeError("Unsupported jobs manifest protocol");
        if (manifest.version !== undefined && manifest.version !== 1)
          throw new TypeError("Unsupported jobs manifest version");
        if (manifest.jobsProtocolVersion !== undefined && manifest.jobsProtocolVersion !== 1)
          throw new TypeError("Unsupported jobs protocol version");
        return Object.freeze(manifest);
      },
      catch: (cause) => new JobsServerError({ operation: "parseManifest", cause }),
    });
  },
  (effect) => observeJobs("server.readManifest", effect),
);
