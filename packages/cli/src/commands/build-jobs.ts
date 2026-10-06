import { join } from "node:path";
import { Effect, Layer, Schema } from "effect";
import { canonicalJson } from "@relkit/contracts";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { GENERATED_ARTIFACT_FILES, JobsManifestSchema, type JobsManifest } from "@relkit/compiler";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";

/** Stable public diagnostic discriminant for unsupported task-backed activation. */
export const TASK_JOBS_RUNTIME_UNAVAILABLE = "RELKIT_TASK_RUNTIME_UNAVAILABLE" as const;

const TASK_JOBS_RUNTIME_MESSAGE =
  "Task-backed jobs cannot be activated until the native jobs runtime is available.";

/** Tagged activation rejection retaining its existing public constructor and code. */
export class TaskJobsRuntimeUnavailableError extends Schema.TaggedError<TaskJobsRuntimeUnavailableError>()(
  "TaskJobsRuntimeUnavailableError",
  {
    code: Schema.Literal(TASK_JOBS_RUNTIME_UNAVAILABLE),
    message: Schema.String,
  },
) {
  /** Constructs the established unavailable-runtime diagnostic without caller input. */
  constructor() {
    super({ code: TASK_JOBS_RUNTIME_UNAVAILABLE, message: TASK_JOBS_RUNTIME_MESSAGE });
    this.name = "TaskJobsRuntimeUnavailableError";
  }
}

/** Reports unsupported task job activation using the compiler diagnostic contract.
 * @returns The existing compiler-facing diagnostic for unsupported task activation.
 */
export function taskJobsRuntimeDiagnostic(): Diagnostic {
  return createDiagnostic({
    code: TASK_JOBS_RUNTIME_UNAVAILABLE,
    severity: "error",
    message: TASK_JOBS_RUNTIME_MESSAGE,
  });
}

/**
 * Prevents a task manifest from reaching the legacy queue runtime.
 * @param manifest - Validated optional compiler manifest.
 * @returns No value when no task runtime is required.
 * @throws TaskJobsRuntimeUnavailableError when a task manifest is present.
 */
export function assertTaskJobsRuntimeAvailable(manifest: JobsManifest | undefined): void {
  if (manifest !== undefined) throw new TaskJobsRuntimeUnavailableError();
}

/**
 * Validates the complete compiler-owned jobs manifest before staging workers.
 * @param source - Optional generated JSON bytes.
 * @returns The original validated value, absent for an empty artifact.
 * @throws TypeError with the established invalid-manifest message on shape rejection.
 */
export function parseJobsManifest(source: string | undefined): JobsManifest | undefined {
  if (source === undefined || source === "") return undefined;
  const value: unknown = JSON.parse(source);
  if (!Schema.is(JobsManifestSchema)(value)) throw new TypeError("Jobs manifest is invalid.");
  return value;
}

/**
 * Carries immutable worker history into the next owned build stage.
 * @param buildDirectory - Previous published cohort.
 * @param stage - Owned staging directory.
 * @param manifest - Accepted versioned compiler manifest, when jobs exist.
 * @returns Lazy history copy and worker publication; only absent history is ignored.
 */
export const stageJobsEffect = Effect.fn("Project.stageJobs")(
  function* (buildDirectory: string, stage: string, manifest: JobsManifest | undefined) {
    const files = yield* CliFileSystem;
    const compiler = yield* CliCompiler;
    yield* files.copy(join(buildDirectory, "jobs"), join(stage, "jobs")).pipe(
      Effect.catchTag("CliAdapterError", (error) => {
        const cause = cliOriginalError(error);
        return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
          ? Effect.void
          : Effect.fail(error);
      }),
    );
    if (manifest === undefined) return;
    yield* compiler.writeWorkers(manifest.workerEntries, { buildDirectory: stage });
    yield* files.writeText(
      join(stage, GENERATED_ARTIFACT_FILES.jobsManifest),
      `${canonicalJson(manifest)}\n`,
    );
  },
  (effect, _buildDirectory: string, _stage: string, _manifest: JobsManifest | undefined) =>
    observeCli("build.stageJobs", effect),
);

/**
 * Stages workers at the existing Promise edge.
 * @param buildDirectory - Published cohort path.
 * @param stage - New owned staging path.
 * @param manifest - Validated compiler manifest.
 * @returns A Promise completing after immutable worker writes.
 */
export function stageJobs(
  buildDirectory: string,
  stage: string,
  manifest: JobsManifest | undefined,
): Promise<void> {
  return runCliEffect(
    stageJobsEffect(buildDirectory, stage, manifest),
    Layer.merge(fileSystemLayer, compilerLayer),
  );
}
