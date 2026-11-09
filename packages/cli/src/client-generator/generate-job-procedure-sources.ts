import type {
  ApplicationGraph,
  JobProcedureSource,
} from "./generate-job-procedure-sources.types.js";
import { Effect } from "effect";
import { jobSourceCalculations } from "./generate-job-sources.js";
import { recordCalculation } from "./generate-schema-render.js";
/** Selects exposed graph jobs and normalizes their public metadata.
 * @param graph - Validated application graph.
 * @returns An Effect yielding sorted job sources; it has no expected failure.
 * @example Effect.runSync(jobProcedureSourcesCore(graph));
 */
export const jobProcedureSourcesCore = Effect.fnUntraced(function* (graph: ApplicationGraph) {
  const sources: JobProcedureSource[] = [];
  for (const node of graph.nodes) {
    const job = yield* jobSourceCalculations.exposedEffect(node);
    if (job !== undefined) sources.push(yield* jobSourceCalculations.sourceEffect(job));
  }
  return sources.sort(
    (left, right) => left.name.localeCompare(right.name) || left.jobId.localeCompare(right.jobId),
  );
});
/** Normalizes serialized job metadata while rejecting malformed entries.
 * @param value - Unknown job document list.
 * @returns An Effect yielding sorted valid sources; it has no expected failure.
 * @example Effect.runSync(jobProcedureSourcesFromDocumentCore([]));
 */
export const jobProcedureSourcesFromDocumentCore = Effect.fnUntraced(function* (value: unknown) {
  const sources: JobProcedureSource[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const job = yield* recordCalculation(item);
    if (
      job === undefined ||
      typeof job.name !== "string" ||
      typeof job.jobId !== "string" ||
      typeof job.taskId !== "string" ||
      typeof job.taskVersion !== "string"
    )
      continue;
    const operations = yield* jobSourceCalculations.operationsEffect(job.operations);
    if (operations.length === 0) continue;
    const streamNames = yield* jobSourceCalculations.stringsEffect(
      job.streamNames ?? (yield* jobSourceCalculations.keysEffect(job.streams)),
    );
    sources.push({
      name: job.name,
      jobId: job.jobId,
      taskId: job.taskId,
      taskVersion: job.taskVersion,
      ...(typeof job.buildId === "string" ? { buildId: job.buildId } : {}),
      input: job.input,
      output: job.output,
      ...(job.errors === undefined ? {} : { errors: job.errors }),
      ...(job.progress === undefined ? {} : { progress: job.progress }),
      ...(job.streams === undefined ? {} : { streams: job.streams }),
      operations,
      fields: yield* jobSourceCalculations.stringsEffect(job.fields),
      streamNames,
    });
  }
  return sources.sort(
    (left, right) => left.name.localeCompare(right.name) || left.jobId.localeCompare(right.jobId),
  );
});
