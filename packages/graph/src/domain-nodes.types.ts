import type { JsonValue } from "@relkit/contracts";
import type { GeneratedFunctionMarker } from "./foundation-nodes.types.js";
import type { GraphNodeBase } from "./model.js";

/**
 * Whether a domain contract is public or internal.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: DomainExposure): void => { console.log(value); };
 */
export type DomainExposure = "public" | "internal";

/**
 * Function contract with invocation mode and schemas.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: FunctionNode): void => { console.log(value); };
 */
export interface FunctionNode extends GraphNodeBase<"function"> {
  readonly invocationMode: "callable" | "event-only";
  readonly publishes?: JsonValue;
  readonly exposure?: DomainExposure;
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly progress?: JsonValue;
  readonly errors?: JsonValue;
  readonly dependencies?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly generated?: GeneratedFunctionMarker;
}

/**
 * Named error contract emitted by the compiler.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ErrorNode): void => { console.log(value); };
 */
export interface ErrorNode extends GraphNodeBase<"error"> {
  readonly exposure: DomainExposure;
  readonly data: JsonValue;
  readonly http?: JsonValue;
  readonly retry: JsonValue;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}
