import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import {
  jobFailureTypeCore,
  jobFieldsTypeCore,
  jobSnapshotTypeCore,
  jobStreamItemTypeCore,
} from "./generate-job-type-calculations.js";
import { jobProcedureEntrySourcesCore } from "./generate-job-procedure-entries.js";
const jobProcedureEntrySourcesOperation = makeGeneratorOperation(
  "jobProcedureEntrySources",
  jobProcedureEntrySourcesCore,
);
/** Renders the nested oRPC job procedure entries in an observed Effect.
 * @param sources - Normalized job sources.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobProcedureEntrySourcesEffect(sources));
 */
export const jobProcedureEntrySourcesEffect = jobProcedureEntrySourcesOperation.effect;
/** Renders the nested oRPC job procedure entries synchronously for existing callers.
 * @param sources - Normalized job sources.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobProcedureEntrySources(sources);
 */
export const jobProcedureEntrySources = jobProcedureEntrySourcesOperation.run;
const jobSnapshotTypeOperation = makeGeneratorOperation("jobSnapshotType", jobSnapshotTypeCore);
/** Renders the job snapshot type for one source in an observed Effect.
 * @param source - Normalized job source.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobSnapshotTypeEffect(source));
 */
export const jobSnapshotTypeEffect = jobSnapshotTypeOperation.effect;
/** Renders the job snapshot type for one source synchronously for existing callers.
 * @param source - Normalized job source.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobSnapshotType(source);
 */
export const jobSnapshotType = jobSnapshotTypeOperation.run;
const jobStreamItemTypeOperation = makeGeneratorOperation(
  "jobStreamItemType",
  jobStreamItemTypeCore,
);
/** Renders the union of named job stream item types in an observed Effect.
 * @param source - Normalized job source.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobStreamItemTypeEffect(source));
 */
export const jobStreamItemTypeEffect = jobStreamItemTypeOperation.effect;
/** Renders the union of named job stream item types synchronously for existing callers.
 * @param source - Normalized job source.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobStreamItemType(source);
 */
export const jobStreamItemType = jobStreamItemTypeOperation.run;
const jobFieldsTypeOperation = makeGeneratorOperation("jobFieldsType", jobFieldsTypeCore);
/** Renders a readonly tuple of selected job fields in an observed Effect.
 * @param fields - Selected job field names.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobFieldsTypeEffect(fields));
 */
export const jobFieldsTypeEffect = jobFieldsTypeOperation.effect;
/** Renders a readonly tuple of selected job fields synchronously for existing callers.
 * @param fields - Selected job field names.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobFieldsType(fields);
 */
export const jobFieldsType = jobFieldsTypeOperation.run;
const jobFailureTypeOperation = makeGeneratorOperation("jobFailureType", jobFailureTypeCore);
/** Renders the union of declared job failure envelopes in an observed Effect.
 * @param value - Document or schema value to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobFailureTypeEffect(value));
 */
export const jobFailureTypeEffect = jobFailureTypeOperation.effect;
/** Renders the union of declared job failure envelopes synchronously for existing callers.
 * @param value - Document or schema value to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobFailureType(value);
 */
export const jobFailureType = jobFailureTypeOperation.run;
/** Job type calculations shared by composed generator operations. @internal */
export const jobTypeCalculations = {
  entries: jobProcedureEntrySourcesOperation.run,
  entriesEffect: jobProcedureEntrySourcesCore,
  snapshot: jobSnapshotTypeOperation.run,
  snapshotEffect: jobSnapshotTypeCore,
  streamItem: jobStreamItemTypeOperation.run,
  streamItemEffect: jobStreamItemTypeCore,
  fields: jobFieldsTypeOperation.run,
  fieldsEffect: jobFieldsTypeCore,
  failure: jobFailureTypeOperation.run,
  failureEffect: jobFailureTypeCore,
} as const;
