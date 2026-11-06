import type { StandardSchemaV1 } from "../schema/index.js";

/** Descriptor for an invocation output stream and its item schema.
 * The item schema validates each yielded value during consumption.
 * @example const output: StreamOutput = { kind: "stream", item: itemSchema };
 */
export interface StreamOutput {
  readonly kind: "stream";
  readonly item: StandardSchemaV1;
}
