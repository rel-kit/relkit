import type { ApplicationGraph, TaskJobNode } from "./generate-job-sources.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { observeGenerator, runGenerator } from "./generator-observability.js";
import { recordCalculation } from "./generate-schema-render.js";
import {
  exposedJobCore,
  recordKeysCore,
  sourceCore,
  stringArrayCore,
  supportedOperationsCore,
} from "./generate-job-source-calculations.js";
export { JOB_PROCEDURE_OPERATIONS } from "./generate-job-source-calculations.js";
const sourceOperation = makeGeneratorOperation("source", sourceCore);
/** Converts an exposed task job into normalized public generator metadata.
 * @param job - Exposed task job node.
 * @returns An Effect with a normalized public job source and no expected failures.
 * @example Effect.runSync(sourceEffect(job));
 */
export const sourceEffect = sourceOperation.effect;
/** Returns a normalized public job source synchronously.
 * @param job - Exposed task job node.
 * @returns A normalized public job source.
 * @throws If malformed trusted input causes a defect.
 * @example source(job);
 */
export const source = sourceOperation.run;
const supportedOperationsOperation = makeGeneratorOperation(
  "supportedOperations",
  supportedOperationsCore,
);
/** Selects supported public job operations in canonical order.
 * @param value - Unknown document value.
 * @returns An Effect with supported job operations in canonical order and no expected failures.
 * @example Effect.runSync(supportedOperationsEffect(value));
 */
export const supportedOperationsEffect = supportedOperationsOperation.effect;
/** Returns supported job operations in canonical order synchronously.
 * @param value - Unknown document value.
 * @returns Supported job operations in canonical order.
 * @throws If malformed trusted input causes a defect.
 * @example supportedOperations(value);
 */
export const supportedOperations = supportedOperationsOperation.run;
const stringArrayOperation = makeGeneratorOperation("stringArray", stringArrayCore);
/** Filters an unknown list to its string entries while preserving order.
 * @param value - Unknown document value.
 * @returns An Effect with string entries and no expected failures.
 * @example Effect.runSync(stringArrayEffect(value));
 */
export const stringArrayEffect = stringArrayOperation.effect;
/** Returns string entries synchronously.
 * @param value - Unknown document value.
 * @returns String entries.
 * @throws If malformed trusted input causes a defect.
 * @example stringArray(value);
 */
export const stringArray = stringArrayOperation.run;
const recordKeysOperation = makeGeneratorOperation("recordKeys", recordKeysCore);
/** Returns the own keys of an unknown record value.
 * @param value - Unknown document value.
 * @returns An Effect with record keys and no expected failures.
 * @example Effect.runSync(recordKeysEffect(value));
 */
export const recordKeysEffect = recordKeysOperation.effect;
/** Returns record keys synchronously.
 * @param value - Unknown document value.
 * @returns Record keys.
 * @throws If malformed trusted input causes a defect.
 * @example recordKeys(value);
 */
export const recordKeys = recordKeysOperation.run;
/** Checks whether the input is a public task job in an observed Effect.
 * @param node - Graph node to inspect.
 * @returns An Effect with a boolean and no expected failures.
 * @example Effect.runSync(isExposedJobEffect(node));
 */
export const isExposedJobEffect = Effect.fn("clientGenerator.isExposedJob")(
  (node: ApplicationGraph["nodes"][number]) =>
    observeGenerator(
      "isExposedJob",
      Effect.map(exposedJobCore(node), (job) => job !== undefined),
    ),
);
/** Checks whether the input is a public task job synchronously.
 * @param node - Graph node to inspect.
 * @returns Whether the input is a public task job.
 * @throws If the synchronous Effect runtime defects.
 * @example isExposedJob(node);
 */
export function isExposedJob(node: ApplicationGraph["nodes"][number]): node is TaskJobNode {
  return runGenerator(isExposedJobEffect(node));
}
/** Checks whether the input is a non-array object in an observed Effect.
 * @param value - Unknown document value to inspect.
 * @returns An Effect with a boolean and no expected failures.
 * @example Effect.runSync(isRecordEffect(value));
 */
export const isRecordEffect = Effect.fn("clientGenerator.isRecord")((value: unknown) =>
  observeGenerator(
    "isRecord",
    Effect.map(recordCalculation(value), (record) => record !== undefined),
  ),
);
/** Checks whether the input is a non-array object synchronously.
 * @param value - Unknown document value to inspect.
 * @returns Whether the input is a non-array object.
 * @throws If the synchronous Effect runtime defects.
 * @example isRecord(value);
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return runGenerator(isRecordEffect(value));
}
/** Job source calculations shared by composed generator operations. @internal */
export const jobSourceCalculations = {
  source: sourceOperation.run,
  sourceEffect: sourceCore,
  exposed: isExposedJob,
  exposedEffect: exposedJobCore,
  operations: supportedOperationsOperation.run,
  operationsEffect: supportedOperationsCore,
  strings: stringArrayOperation.run,
  stringsEffect: stringArrayCore,
  keys: recordKeysOperation.run,
  keysEffect: recordKeysCore,
  record: isRecord,
} as const;
