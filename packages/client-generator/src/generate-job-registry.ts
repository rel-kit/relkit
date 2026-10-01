import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import {
  generateJobRegistryCore,
  generateJobRegistryFromDocumentCore,
} from "./generate-job-registry-render.js";
import {
  jobClientRegistryEntriesCore,
  jobRegistryTypeCore,
} from "./generate-job-registry-calculations.js";

const generateJobRegistryOperation = makeGeneratorOperation(
  "generateJobRegistry",
  generateJobRegistryCore,
);
/** Renders the graph-backed job registry declarations in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(generateJobRegistryEffect(graph));
 */
export const generateJobRegistryEffect = generateJobRegistryOperation.effect;
/** Renders the graph-backed job registry declarations synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example generateJobRegistry(graph);
 */
export const generateJobRegistry = generateJobRegistryOperation.run;
const generateJobRegistryFromDocumentOperation = makeGeneratorOperation(
  "generateJobRegistryFromDocument",
  generateJobRegistryFromDocumentCore,
);
/** Renders job registry declarations from serialized sources in an observed Effect.
 * @param value - Document or schema value to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(generateJobRegistryFromDocumentEffect(value));
 */
export const generateJobRegistryFromDocumentEffect =
  generateJobRegistryFromDocumentOperation.effect;
/** Renders job registry declarations from serialized sources synchronously for existing callers.
 * @param value - Document or schema value to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example generateJobRegistryFromDocument(value);
 */
export const generateJobRegistryFromDocument = generateJobRegistryFromDocumentOperation.run;
const jobRegistryTypeOperation = makeGeneratorOperation("jobRegistryType", jobRegistryTypeCore);
/** Renders the JobContract type for a job source in an observed Effect.
 * @param source - Normalized job source.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobRegistryTypeEffect(source));
 */
export const jobRegistryTypeEffect = jobRegistryTypeOperation.effect;
/** Renders the JobContract type for a job source synchronously for existing callers.
 * @param source - Normalized job source.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobRegistryType(source);
 */
export const jobRegistryType = jobRegistryTypeOperation.run;
const jobClientRegistryEntriesOperation = makeGeneratorOperation(
  "jobClientRegistryEntries",
  jobClientRegistryEntriesCore,
);
/** Builds React client registry entries for job operations in an observed Effect.
 * @param source - Normalized job source.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(jobClientRegistryEntriesEffect(source));
 */
export const jobClientRegistryEntriesEffect = jobClientRegistryEntriesOperation.effect;
/** Builds React client registry entries for job operations synchronously for existing callers.
 * @param source - Normalized job source.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example jobClientRegistryEntries(source);
 */
export const jobClientRegistryEntries = jobClientRegistryEntriesOperation.run;

/** Job registry calculations shared by composed generator operations. @internal */
export const jobRegistryCalculations = {
  graph: generateJobRegistryOperation.run,
  graphEffect: generateJobRegistryCore,
  document: generateJobRegistryFromDocumentOperation.run,
  documentEffect: generateJobRegistryFromDocumentCore,
} as const;
