import type { RuntimeFiles } from "../runtime/index.js";

/** static files options configuring dependencies, callbacks and runtime policy. */
export interface StaticFilesOptions {
  readonly root: string;
  /** Filesystem access that opens file bodies; defaults to the detected runtime adapter's. */
  readonly files?: RuntimeFiles;
}
