import type { JobProcedureSource } from "./generate-job-type-calculations.types.js";
import { Effect } from "effect";
import { schemaCalculations } from "./generate-schema.js";
import { recordCalculation } from "./generate-schema-render.js";
/** Renders a readonly selection of requested job fields.
 * @param fields - Selected field names.
 * @returns An Effect yielding a tuple type; it has no expected failure.
 * @example Effect.runSync(jobFieldsTypeCore(["status"]));
 */
export const jobFieldsTypeCore = Effect.fnUntraced(function* (fields: readonly string[]) {
  return fields.length === 0
    ? "readonly []"
    : `readonly [${fields.map((field) => JSON.stringify(field)).join(", ")}]`;
});
/** Renders declared job failure envelopes from schema metadata.
 * @param value - Unknown declared error metadata.
 * @returns An Effect yielding an error union; it has no expected failure.
 * @example Effect.runSync(jobFailureTypeCore([]));
 */
export const jobFailureTypeCore = Effect.fnUntraced(function* (value: unknown) {
  const errors: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const entry = yield* recordCalculation(item);
    if (entry === undefined || typeof entry.id !== "string") continue;
    const data =
      entry.data === undefined ? undefined : yield* schemaCalculations.typeEffect(entry.data);
    errors.push(
      `{ readonly code: ${JSON.stringify(entry.id)}; readonly message: string${data === undefined ? "" : `; readonly data?: ${data}`} }`,
    );
  }
  return errors.length === 0
    ? 'import("@relkit/contracts/jobs").JobErrorEnvelope'
    : errors.join(" | ");
});
/** Renders the union of named job stream item variants.
 * @param source - Normalized public job.
 * @returns An Effect yielding a stream item type; it has no expected failure.
 * @example Effect.runSync(jobStreamItemTypeCore(source));
 */
export const jobStreamItemTypeCore = Effect.fnUntraced(function* (source: JobProcedureSource) {
  const streams = (yield* recordCalculation(source.streams)) ?? {};
  const types: string[] = [];
  for (const name of source.streamNames)
    types.push(yield* schemaCalculations.typeEffect(streams[name]));
  return types.length === 0 ? "never" : types.join(" | ");
});
/** Renders the job snapshot type for one source.
 * @param source - Normalized public job.
 * @returns An Effect yielding a snapshot type; it has no expected failure.
 * @example Effect.runSync(jobSnapshotTypeCore(source));
 */
export const jobSnapshotTypeCore = Effect.fnUntraced(function* (source: JobProcedureSource) {
  const input = yield* schemaCalculations.typeEffect(source.input);
  const output = yield* schemaCalculations.typeEffect(source.output);
  const progress = yield* schemaCalculations.typeEffect(source.progress);
  const failure = yield* jobFailureTypeCore(source.errors);
  const fields = yield* jobFieldsTypeCore(source.fields);
  return `import("@relkit/client/jobs").JobSnapshotFor<${input}, ${output}, ${progress}, ${failure}, ${fields}>`;
});
/** Renders a paginated job history type.
 * @param source - Normalized public job.
 * @returns An Effect yielding a page type; it has no expected failure.
 * @example Effect.runSync(pageTypeEffect(source));
 */
export const pageTypeEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return `import("@relkit/contracts/jobs").RunPage<${yield* jobSnapshotTypeCore(source)}>`;
});
/** Renders live job watch frames.
 * @param source - Normalized public job.
 * @returns An Effect yielding a watch frame type; it has no expected failure.
 * @example Effect.runSync(watchFrameTypeEffect(source));
 */
export const watchFrameTypeEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return `import("@relkit/contracts/jobs").RunWatchFrame<${yield* jobSnapshotTypeCore(source)}>`;
});
/** Renders named job stream frames.
 * @param source - Normalized public job.
 * @returns An Effect yielding a stream frame type; it has no expected failure.
 * @example Effect.runSync(streamFrameTypeEffect(source));
 */
export const streamFrameTypeEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return `import("@relkit/contracts/jobs").NamedStreamFrame<${yield* jobStreamItemTypeCore(source)}>`;
});
/** Renders trigger input metadata for a job source.
 * @param source - Normalized public job.
 * @returns An Effect yielding a trigger input type; it has no expected failure.
 * @example Effect.runSync(triggerInputEffect(source));
 */
export const triggerInputEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return `{ readonly input: ${yield* schemaCalculations.typeEffect(source.input)}; readonly options?: import("@relkit/client/jobs").JobTriggerOptions; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }`;
});
/** Renders the input for a named job stream.
 * @param source - Normalized public job.
 * @returns An Effect yielding a stream input type; it has no expected failure.
 * @example Effect.runSync(streamInputTypeEffect(source));
 */
export const streamInputTypeEffect = Effect.fnUntraced(function* (source: JobProcedureSource) {
  return `{ readonly runId: string; readonly name: ${source.streamNames.map((name) => JSON.stringify(name)).join(" | ") || "never"}; readonly after?: string; readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity }`;
});
