import type { SEGMENT_DIRECTORIES } from "./segment-files-core.js";

/** Directory names owned by the segment store. */
export type SegmentDirectory = (typeof SEGMENT_DIRECTORIES)[number];

/** One active or finalized segment and its persisted size. */
export interface SegmentFile {
  readonly path: string;
  readonly number: number;
  readonly active: boolean;
  readonly bytes: number;
  readonly records: number;
}
