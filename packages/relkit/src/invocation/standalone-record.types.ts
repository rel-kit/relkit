import type { InvocationDispatchOptions } from "./dispatcher.types.js";
export type {
  InvocationIdSource,
  InvocationMetadata,
  InvocationParent,
  InvocationRecord,
  InvocationSource,
} from "./contracts.js";

/** Correlation and parent inputs for one standalone record.
 * Parent fields are copied into the new invocation record.
 * @example const options: RecordOptions = { correlationId: "request-1" };
 */
export type RecordOptions = Pick<InvocationDispatchOptions, "correlationId" | "parent">;
