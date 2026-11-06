import type { FileHandle } from "node:fs/promises";

/** Active segment writer and its current byte and record counts. */
export interface SegmentState {
  readonly directory: string;
  readonly activePath: string;
  handle: FileHandle;
  bytes: number;
  records: number;
}
