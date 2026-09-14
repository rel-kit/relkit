import type { JsonValue } from "./json.js";

export type ProgressOutcome = "persisted" | "sent" | "dropped" | "unavailable";

export interface ProgressEmitReceipt {
  readonly outcome: ProgressOutcome;
  readonly sequence?: number;
  readonly generation?: string;
  readonly reason?: string;
}

export interface StreamSchemaDescriptor<Name extends string = string> {
  readonly name: Name;
  readonly schemaVersion: string;
}

export type StreamItem = JsonValue;
