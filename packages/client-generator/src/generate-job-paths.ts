import type {
  JobProcedureDocument,
  JobProcedureOperation,
  JobProcedureSource,
} from "./generate-job-paths.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
/** Builds canonical operation paths for a public job.
 * @param source - Job name and enabled operations.
 * @returns An Effect yielding paths by operation; it has no expected failure.
 * @example Effect.runSync(jobPathCalculations.pathsEffect({ name: "emails", operations: ["trigger"] }));
 */
const jobProcedurePathsCore = Effect.fnUntraced(function* (
  source: Pick<JobProcedureSource, "name" | "operations">,
) {
  return Object.fromEntries(
    source.operations.map((operation) => [
      operation,
      operation === "trigger"
        ? ["jobs", source.name, "trigger"]
        : ["jobs", source.name, "runs", operation],
    ]),
  ) as Readonly<Partial<Record<JobProcedureOperation, readonly string[]>>>;
});
/** Adds generated paths to a normalized job source.
 * @param source - Normalized job metadata.
 * @returns An Effect yielding a frozen document; it has no expected failure.
 * @example Effect.runSync(jobPathCalculations.documentEffect(source));
 */
const jobProcedureDocumentCore = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return Object.freeze({ ...source, procedurePaths: yield* jobProcedurePathsCore(source) });
});
const jobProcedurePathsOperation = makeGeneratorOperation(
  "jobProcedurePaths",
  jobProcedurePathsCore,
);
/** Derives stable selector paths for job operations in an observed Effect.
 * @param source - Normalized job source.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedurePathsEffect(source));
 */
export const jobProcedurePathsEffect = jobProcedurePathsOperation.effect;
/** Derives stable selector paths for job operations synchronously for existing callers.
 * @param source - Normalized job source.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedurePaths(source);
 */
export const jobProcedurePaths = jobProcedurePathsOperation.run;
const jobProcedureDocumentOperation = makeGeneratorOperation(
  "jobProcedureDocument",
  jobProcedureDocumentCore,
);
/** Adds stable procedure paths to a job source in an observed Effect.
 * @param source - Normalized job source.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureDocumentEffect(source));
 */
export const jobProcedureDocumentEffect = jobProcedureDocumentOperation.effect;
/** Adds stable procedure paths to a job source synchronously for existing callers.
 * @param source - Normalized job source.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureDocument(source);
 */
export const jobProcedureDocument = jobProcedureDocumentOperation.run;
/** Job path calculations shared by composed generator operations. @internal */
export const jobPathCalculations = {
  paths: jobProcedurePathsOperation.run,
  pathsEffect: jobProcedurePathsCore,
  document: jobProcedureDocumentOperation.run,
  documentEffect: jobProcedureDocumentCore,
} as const;
