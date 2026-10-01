import type { JobsManifestGenerationFailure } from "./manifest.types.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { observeJobs, recordJobsWorkload } from "./observability.js";
import { serializeJsonEffect } from "@relkit/contracts";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { jobEntryEffect, taskEntryEffect } from "./manifest-entries.js";
import { hashGraphEffect } from "../normalize-graph.js";
import {
  buildManifestEffect,
  compareDescriptor,
  emptyManifest,
  inputWork,
  isTaskJob,
  result,
} from "./manifest-build.js";

import type { JobsManifestInput, GeneratedJobsManifest } from "./manifest.types.js";
export type {
  JobsManifestTask,
  JobsManifestJob,
  JobsManifestWorkerEntry,
  JobsManifest,
  JobsManifestInput,
  GeneratedJobsManifest,
} from "./manifest.types.js";

export const JOBS_MANIFEST_CODES = Object.freeze({
  mismatch: "RELKIT_JOBS_MANIFEST_GRAPH_MISMATCH",
} as const);

/**
 * Builds the versioned data-only jobs manifest in deterministic order.
 * @param input - Trusted normalized inputs and optional authoritative workspace.
 * @returns A lazy effect yielding the serialized manifest result; prerequisite errors deny activation.
 * @remarks Manifest construction failures use SchemaIssue validation issues; JSON failures use JsonValueError.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { generateJobsManifestEffect } from "./manifest.js";
 * const generation = generateJobsManifestEffect({ graphHash: "example", descriptors: [] });
 * const exit = Effect.runSync(Effect.exit(generation));
 * ```
 */
export const generateJobsManifestEffect = Effect.fn("Jobs.generateJobsManifest")(
  function* (
    input: JobsManifestInput,
  ): Effect.fn.Return<GeneratedJobsManifest, JobsManifestGenerationFailure> {
    const existing = input.diagnostics ?? [];
    if (existing.some((diagnostic) => diagnostic.severity === "error")) return emptyManifest();
    const diagnostics: Diagnostic[] = [];
    if (input.graph !== undefined && (yield* hashGraphEffect(input.graph)) !== input.graphHash) {
      diagnostics.push(
        createDiagnostic({
          code: JOBS_MANIFEST_CODES.mismatch,
          severity: "error",
          message: "Jobs manifest graph hash does not match the canonical graph.",
        }),
      );
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
      return result("", undefined, diagnostics, false);
    const work = inputWork(input);
    const tasks = input.descriptors
      .filter((entry) => entry.kind === "task")
      .sort(compareDescriptor);
    const jobs = input.descriptors
      .filter((entry) => entry.kind === "job" && isTaskJob(entry))
      .sort(compareDescriptor);
    const taskEntries = yield* Effect.forEach(tasks, (task) => taskEntryEffect(task, work));
    const jobEntries = yield* Effect.forEach(jobs, (job) => jobEntryEffect(job, work));
    const manifest = yield* buildManifestEffect(input, work, taskEntries, jobEntries);
    yield* recordJobsWorkload("manifest", { tasks: tasks.length, jobs: jobs.length });
    return result(`${yield* serializeJsonEffect(manifest)}\n`, manifest, diagnostics, true);
  },
  (effect) =>
    observeJobs("manifest", effect, undefined, (result) => ({
      bytes: Buffer.byteLength(result.source, "utf8"),
      diagnostics: result.diagnostics.length,
    })),
);

/**
 * Builds the versioned data-only jobs manifest in deterministic order.
 * @param input - Trusted normalized inputs and optional authoritative workspace.
 * @returns the serialized manifest result; prerequisite errors deny activation.
 * @see {@link generateJobsManifestEffect} for composition and execution examples.
 */
export function generateJobsManifest(input: JobsManifestInput): GeneratedJobsManifest {
  return runJobsSync(generateJobsManifestEffect(input));
}
