import type { ObservabilityRecord } from "../model.js";
import type { LocalRecord } from "./types.types.js";

/** Validated and redacted envelope retained until its transaction commits. */
export interface PreparedDuckdbRecord {
  readonly item: LocalRecord;
  readonly safe: ObservabilityRecord;
  readonly payload: string;
}
