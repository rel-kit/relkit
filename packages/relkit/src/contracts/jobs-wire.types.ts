import type { JsonValue } from "./json.types.js";
import type { JOBS_WIRE_VERSION } from "./jobs-wire.js";

/** Wire envelope carrying a JSON result. */
export interface JsonWireEnvelope {
  readonly version: typeof JOBS_WIRE_VERSION;
  readonly kind: "json";
  readonly value: JsonValue;
}

/** Wire envelope carrying no result value. */
export interface VoidWireEnvelope {
  readonly version: typeof JOBS_WIRE_VERSION;
  readonly kind: "void";
}

/** Versioned result representation on the jobs wire. */
export type JobWireEnvelope = JsonWireEnvelope | VoidWireEnvelope;
