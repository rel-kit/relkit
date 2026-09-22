import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import {
  GENERATED_ARTIFACT_FILES,
  writeJobWorkerEntries,
  type JobsManifest,
} from "@relkit/compiler";

export const TASK_JOBS_RUNTIME_UNAVAILABLE = "RELKIT_TASK_RUNTIME_UNAVAILABLE" as const;

const TASK_JOBS_RUNTIME_MESSAGE =
  "Task-backed jobs cannot be activated until the native jobs runtime is available.";

export class TaskJobsRuntimeUnavailableError extends Error {
  readonly code = TASK_JOBS_RUNTIME_UNAVAILABLE;

  constructor() {
    super(TASK_JOBS_RUNTIME_MESSAGE);
    this.name = "TaskJobsRuntimeUnavailableError";
  }
}

export function taskJobsRuntimeDiagnostic(): Diagnostic {
  return createDiagnostic({
    code: TASK_JOBS_RUNTIME_UNAVAILABLE,
    severity: "error",
    message: TASK_JOBS_RUNTIME_MESSAGE,
  });
}

/** Prevents a task manifest from reaching the legacy queue runtime. */
export function assertTaskJobsRuntimeAvailable(manifest: JobsManifest | undefined): void {
  if (manifest !== undefined) throw new TaskJobsRuntimeUnavailableError();
}

export function parseJobsManifest(source: string | undefined): JobsManifest | undefined {
  if (source === undefined || source === "") return undefined;
  return JSON.parse(source) as JobsManifest;
}

/** Carries immutable worker history into the next transactional build stage. */
export async function stageJobs(
  buildDirectory: string,
  stage: string,
  manifest: JobsManifest | undefined,
): Promise<void> {
  await cp(join(buildDirectory, "jobs"), join(stage, "jobs"), {
    recursive: true,
    force: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (manifest === undefined) return;
  await writeJobWorkerEntries(manifest.workerEntries, { buildDirectory: stage });
  await writeFile(
    join(stage, GENERATED_ARTIFACT_FILES.jobsManifest),
    `${canonicalJson(manifest)}\n`,
  );
}
