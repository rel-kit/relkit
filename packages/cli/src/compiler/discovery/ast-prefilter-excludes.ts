/** Matches exclusion patterns without requiring native Bun in declaration-only test Layers. */
import { posix } from "node:path";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";

/**
 * Matches portable filenames with the native Bun glob contract or Node's platform equivalent.
 * @param fileName - Portable project-relative filename.
 * @param patterns - Authored exclusion patterns using either slash style.
 * @returns Whether a pattern excludes the file; invalid native matcher calls remain defects.
 */
export const matchesExcludeEffect = Effect.fn("Discovery.matchesExclude")(
  function* (fileName: string, patterns: readonly string[]) {
    return patterns.some((pattern) => {
      const portable = pattern.replaceAll("\\", "/");
      if (typeof Bun !== "undefined") return new Bun.Glob(portable).match(fileName);
      return posix.matchesGlob(fileName, portable);
    });
  },
  (effect, _fileName, patterns) =>
    observeCompiler(
      "discovery",
      "matchesExclude",
      effect,
      () => ({ entries: patterns.length }),
      false,
    ),
);

/**
 * Runs exclusion matching at the existing synchronous compiler edge.
 * @param fileName - Portable project-relative filename.
 * @param patterns - Authored exclusion patterns.
 * @returns Whether the file is excluded.
 */
export function matchesExclude(fileName: string, patterns: readonly string[]): boolean {
  return runDiscoverySync(matchesExcludeEffect(fileName, patterns));
}
