import type { JsonValue } from "@relkit/contracts";
import type { GeneratedFunctionMarker } from "./foundation-nodes.js";
import type { GraphNodeBase } from "./model.js";

export type DomainExposure = "public" | "internal";

export interface FunctionNode extends GraphNodeBase<"function"> {
  readonly invocationMode: "callable" | "event-only";
  readonly publishes?: JsonValue;
  readonly exposure?: DomainExposure;
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly errors?: JsonValue;
  readonly dependencies?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly generated?: GeneratedFunctionMarker;
}

export interface ErrorNode extends GraphNodeBase<"error"> {
  readonly exposure: DomainExposure;
  readonly data: JsonValue;
  readonly http?: JsonValue;
  readonly retry: JsonValue;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}
