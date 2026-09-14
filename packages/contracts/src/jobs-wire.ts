import type { JsonValue } from "./json.js";

export const JOBS_WIRE_VERSION = 1 as const;

export interface JsonWireEnvelope {
  readonly version: typeof JOBS_WIRE_VERSION;
  readonly kind: "json";
  readonly value: JsonValue;
}

export interface VoidWireEnvelope {
  readonly version: typeof JOBS_WIRE_VERSION;
  readonly kind: "void";
}

export type JobWireEnvelope = JsonWireEnvelope | VoidWireEnvelope;
