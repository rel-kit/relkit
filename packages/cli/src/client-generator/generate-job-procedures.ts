import type { ApplicationGraph, JobProcedureSource } from "./generate-job-procedures.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
export { JOB_PROCEDURE_OPERATIONS } from "./generate-job-sources.js";
import { jobTypeCalculations } from "./generate-job-types.js";
import {
  jobProcedureSourcesCore,
  jobProcedureSourcesFromDocumentCore,
} from "./generate-job-procedure-sources.js";
export {
  jobProcedureDocument,
  jobProcedureDocumentEffect,
  jobProcedurePaths,
  jobProcedurePathsEffect,
} from "./generate-job-paths.js";
export type {
  JobProcedureDocument,
  JobProcedureOperation,
  JobProcedureSource,
} from "./generate-job-procedures.types.js";
/** Builds procedure declarations for exposed graph jobs.
 * @param graph - Validated application graph.
 * @returns An Effect yielding job entries; it has no expected failure.
 * @example Effect.runSync(jobProcedureEntriesEffect(graph));
 */
function jobProcedureEntriesCore(graph: ApplicationGraph): Effect.Effect<readonly string[]> {
  return Effect.gen(function* () {
    const sources = yield* jobProcedureSourcesCore(graph);
    return yield* jobTypeCalculations.entriesEffect(sources);
  });
}
/** Builds procedure declarations from normalized job sources.
 * @param sources - Normalized public jobs.
 * @returns An Effect yielding job entries; it has no expected failure.
 * @example Effect.runSync(jobProcedureEntriesFromSourcesEffect([]));
 */
function jobProcedureEntriesFromSourcesCore(
  sources: readonly JobProcedureSource[],
): Effect.Effect<readonly string[]> {
  return jobTypeCalculations.entriesEffect(sources);
}
/** Builds procedure declarations from serialized job metadata.
 * @param value - Unknown job document list.
 * @returns An Effect yielding job entries; it has no expected failure.
 * @example Effect.runSync(jobProcedureEntriesFromDocumentEffect([]));
 */
function jobProcedureEntriesFromDocumentCore(value: unknown): Effect.Effect<readonly string[]> {
  return Effect.gen(function* () {
    const sources = yield* jobProcedureSourcesFromDocumentCore(value);
    return yield* jobTypeCalculations.entriesEffect(sources);
  });
}
export {
  jobFailureType,
  jobFailureTypeEffect,
  jobFieldsType,
  jobFieldsTypeEffect,
  jobSnapshotType,
  jobSnapshotTypeEffect,
  jobStreamItemType,
  jobStreamItemTypeEffect,
} from "./generate-job-types.js";
const jobProcedureSourcesOperation = makeGeneratorOperation(
  "jobProcedureSources",
  jobProcedureSourcesCore,
);
/** Collects exposed task jobs from an application graph in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureSourcesEffect(graph));
 */
export const jobProcedureSourcesEffect = jobProcedureSourcesOperation.effect;
/** Collects exposed task jobs from an application graph synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureSources(graph);
 */
export const jobProcedureSources = jobProcedureSourcesOperation.run;
const jobProcedureSourcesFromDocumentOperation = makeGeneratorOperation(
  "jobProcedureSourcesFromDocument",
  jobProcedureSourcesFromDocumentCore,
);
/** Normalizes serialized job procedure sources in an observed Effect.
 * @param value - Document or schema value to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureSourcesFromDocumentEffect(value));
 */
export const jobProcedureSourcesFromDocumentEffect =
  jobProcedureSourcesFromDocumentOperation.effect;
/** Normalizes serialized job procedure sources synchronously for existing callers.
 * @param value - Document or schema value to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureSourcesFromDocument(value);
 */
export const jobProcedureSourcesFromDocument = jobProcedureSourcesFromDocumentOperation.run;
const jobProcedureEntriesOperation = makeGeneratorOperation(
  "jobProcedureEntries",
  jobProcedureEntriesCore,
);
/** Builds job procedure entries from graph nodes in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureEntriesEffect(graph));
 */
export const jobProcedureEntriesEffect = jobProcedureEntriesOperation.effect;
/** Builds job procedure entries from graph nodes synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureEntries(graph);
 */
export const jobProcedureEntries = jobProcedureEntriesOperation.run;
const jobProcedureEntriesFromSourcesOperation = makeGeneratorOperation(
  "jobProcedureEntriesFromSources",
  jobProcedureEntriesFromSourcesCore,
);
/** Builds job procedure entries from normalized sources in an observed Effect.
 * @param sources - Normalized job sources.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureEntriesFromSourcesEffect(sources));
 */
export const jobProcedureEntriesFromSourcesEffect = jobProcedureEntriesFromSourcesOperation.effect;
/** Builds job procedure entries from normalized sources synchronously for existing callers.
 * @param sources - Normalized job sources.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureEntriesFromSources(sources);
 */
export const jobProcedureEntriesFromSources = jobProcedureEntriesFromSourcesOperation.run;
const jobProcedureEntriesFromDocumentOperation = makeGeneratorOperation(
  "jobProcedureEntriesFromDocument",
  jobProcedureEntriesFromDocumentCore,
);
/** Builds job procedure entries from a document in an observed Effect.
 * @param value - Document or schema value to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureEntriesFromDocumentEffect(value));
 */
export const jobProcedureEntriesFromDocumentEffect =
  jobProcedureEntriesFromDocumentOperation.effect;
/** Builds job procedure entries from a document synchronously for existing callers.
 * @param value - Document or schema value to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureEntriesFromDocument(value);
 */
export const jobProcedureEntriesFromDocument = jobProcedureEntriesFromDocumentOperation.run;

/** Job procedure calculations shared by composed generator operations. @internal */
export const jobProcedureCalculations = {
  graphSources: jobProcedureSourcesOperation.run,
  graphSourcesEffect: jobProcedureSourcesCore,
  documentSources: jobProcedureSourcesFromDocumentOperation.run,
  documentSourcesEffect: jobProcedureSourcesFromDocumentCore,
  entries: jobProcedureEntriesFromSourcesOperation.run,
  entriesEffect: jobProcedureEntriesFromSourcesCore,
} as const;
