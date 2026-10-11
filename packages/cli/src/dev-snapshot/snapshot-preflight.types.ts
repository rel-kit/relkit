import type { FSWatcher } from "node:fs";

/** Native watch established before the prepared Effect graph is imported. */
export interface SnapshotEpochPreflight {
  readonly root: string;
  watcher: FSWatcher;
  revision: number;
  failure: unknown;
  notify: (() => void) | undefined;
  close: () => void;
}

/** Speculative member proof is reusable only by the same receipt and epoch revision. */
export interface SnapshotCommandPreflight {
  readonly root: string;
  readonly generation: string;
  readonly startRevision: number;
  readonly epoch: SnapshotEpochPreflight;
  readonly mismatch: Promise<number | undefined>;
}
