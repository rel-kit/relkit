/** Sequential line/import counters private to one legacy NDJSON source. */
import type { LocalRecord } from "@relkit/observability/local/record";

/** Keeps file line identity stable across malformed rows and batch boundaries. */
export interface LegacyLineState {
  readonly sourcePath: string;
  lineNumber: number;
  malformed: number;
  records: number;
  pending: LocalRecord[];
}
