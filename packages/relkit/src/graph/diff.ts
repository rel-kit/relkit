import { Effect } from "effect";
import { buildDiffEffect } from "./diff-build.js";
import { observeGraph } from "./graph-observability.js";
import { canonicalizeGraphEffect } from "./hash.js";
import { runHash } from "./hash-errors.js";
import type { HashFailure } from "./hash-errors.types.js";
import type { GraphCanonicalizationOptions } from "./hash.types.js";
import type { ApplicationGraph } from "./model.js";
import type { GraphDiff } from "./diff-types.js";

/**
 * Compares canonical graph contracts and reports compatibility changes.
 * @param before - Graph before the change.
 * @param after - Graph after the change.
 * @param options - Optional project root for portable source paths.
 * @returns An Effect containing the diff, or a tagged canonicalization, path, or JSON error.
 * @example Effect.runSync(diffGraphEffect(before, after));
 */
export function diffGraphEffect(
  before: ApplicationGraph,
  after: ApplicationGraph,
  options: GraphCanonicalizationOptions = {},
): Effect.Effect<GraphDiff, HashFailure> {
  return observeGraph(
    "diff.compare",
    Effect.gen(function* () {
      const left = yield* canonicalizeGraphEffect(before, options);
      const right = yield* canonicalizeGraphEffect(after, options);
      return yield* buildDiffEffect(left, right);
    }),
  );
}

/**
 * Synchronous compatibility adapter for graph diffing.
 * @param before - Graph before the change.
 * @param after - Graph after the change.
 * @param options - Optional project root for portable source paths.
 * @returns An ordered graph diff.
 * @throws TypeError or a tagged contract error for invalid graph input.
 * @example diffGraph(before, after);
 */
export function diffGraph(
  before: ApplicationGraph,
  after: ApplicationGraph,
  options: GraphCanonicalizationOptions = {},
): GraphDiff {
  return runHash(diffGraphEffect(before, after, options));
}

/** Alias for command-style graph comparison.
 * @example diffGraphs(before, after);
 */
export const diffGraphs = diffGraph;
