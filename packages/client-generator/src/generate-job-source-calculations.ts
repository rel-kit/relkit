import type {
  ApplicationGraph,
  TaskJobNode,
  JobProcedureOperation,
  JobProcedureSource,
} from "./generate-job-source-calculations.types.js";
import { Effect } from "effect";
import { recordCalculation } from "./generate-schema-render.js";
/** Canonical order of public job operations in generated types and documents. */
export const JOB_PROCEDURE_OPERATIONS = [
  "trigger",
  "get",
  "list",
  "watch",
  "cancel",
  "retry",
  "stream",
] as const;
/** Filters operation names into canonical public order.
 * @param value - Unknown client operation list.
 * @returns An Effect yielding supported operations; it has no expected failure.
 * @example Effect.runSync(supportedOperationsCore(["watch", "trigger"]));
 */
export const supportedOperationsCore = Effect.fnUntraced(function* (value: unknown) {
  const operations: JobProcedureOperation[] = [];
  for (const operation of JOB_PROCEDURE_OPERATIONS)
    if (Array.isArray(value) && value.includes(operation)) operations.push(operation);
  return operations;
});
/** Retains string entries from an unknown list in source order.
 * @param value - Unknown document list.
 * @returns An Effect yielding strings; it has no expected failure.
 * @example Effect.runSync(stringArrayCore(["a", null]));
 */
export const stringArrayCore = Effect.fnUntraced(function* (value: unknown) {
  const strings: string[] = [];
  for (const entry of Array.isArray(value) ? value : [])
    if (typeof entry === "string") strings.push(entry);
  return strings;
});
/** Returns own enumerable keys from a non-array record.
 * @param value - Unknown document value.
 * @returns An Effect yielding keys; it has no expected failure.
 * @example Effect.runSync(recordKeysCore({ input: {} }));
 */
export const recordKeysCore = Effect.fnUntraced(function* (value: unknown) {
  const record = yield* recordCalculation(value);
  return record === undefined ? [] : Object.keys(record);
});
/** Copies exposed task metadata and normalizes client operation selections.
 * @param job - Exposed task job node.
 * @returns An Effect yielding normalized source metadata; it has no expected failure.
 * @example Effect.runSync(sourceCore(job));
 */
export const sourceCore = Effect.fnUntraced(function* (job: TaskJobNode) {
  const client = (yield* recordCalculation(job.client)) ?? {};
  return {
    name: job.name,
    jobId: job.jobId,
    taskId: job.taskId,
    taskVersion: job.taskVersion,
    ...(job.buildId === undefined ? {} : { buildId: job.buildId }),
    input: job.input,
    output: job.output,
    ...(job.errors === undefined ? {} : { errors: job.errors }),
    ...(job.progress === undefined ? {} : { progress: job.progress }),
    ...(job.streams === undefined ? {} : { streams: job.streams }),
    operations: yield* supportedOperationsCore(client.operations),
    fields: yield* stringArrayCore(client.fields),
    streamNames: yield* stringArrayCore(client.streams),
  } satisfies JobProcedureSource;
});
/** Selects task jobs with at least one public client operation.
 * @param node - Application graph node.
 * @returns An Effect yielding an exposed job or `undefined`; it has no expected failure.
 * @example Effect.runSync(exposedJobCore(node));
 */
export const exposedJobCore = Effect.fnUntraced(function* (
  node: ApplicationGraph["nodes"][number],
) {
  if (node.kind !== "job" || node.executionModel !== "task" || node.implicit) return undefined;
  const client = yield* recordCalculation(node.client);
  if (client === undefined) return undefined;
  const operations = yield* supportedOperationsCore(client.operations);
  return operations.length > 0 ? node : undefined;
});
