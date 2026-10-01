import type { Effect } from "effect";
import type { SourceMapReadError } from "./source-map-source.js";

/** Filesystem capability owned by the discovery caller; no handles escape a read. */
export interface SourceReader {
  /**
   * Checks whether an absolute candidate exists.
   * @param path - Absolute filesystem path.
   * @returns A lazy effect yielding existence; implementation defects remain defects.
   */
  readonly exists: (path: string) => Effect.Effect<boolean>;

  /**
   * Reads a candidate's complete UTF-8 source text.
   * @param path - Absolute filesystem path.
   * @returns A lazy effect yielding source text or a classified native read failure.
   */
  readonly read: (path: string) => Effect.Effect<string, SourceMapReadError>;
}
