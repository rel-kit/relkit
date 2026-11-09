import type { JsonValue } from "./json.js";

/** Delivery outcome of an emitted progress item. */
export type ProgressOutcome = "persisted" | "sent" | "dropped" | "unavailable";

/** Receipt returned after progress is persisted or sent. */
export interface ProgressEmitReceipt {
  readonly outcome: ProgressOutcome;
  readonly sequence?: number;
  readonly generation?: string;
  readonly reason?: string;
}

/** Name and version of a typed job stream schema. */
export interface StreamSchemaDescriptor<Name extends string = string> {
  readonly name: Name;
  readonly schemaVersion: string;
}

/** JSON-safe item carried by a named job stream. */
export type StreamItem = JsonValue;
