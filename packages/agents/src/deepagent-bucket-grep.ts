import { matchesGlob } from "node:path";
import type { GrepResult } from "deepagents";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import {
  errorMessage,
  filePath,
  isControlFailure,
  isTextMimeType,
  type DeepAgentBucketContext,
} from "./deepagent-bucket-files.js";
import { readFileDataEffect } from "./deepagent-bucket-file-data.js";
import { scopedKeysEffect } from "./deepagent-bucket-file-index.js";
import { compileGlob } from "./deepagent-bucket-glob.js";

/** Searches text files in key order and stops as soon as the match cap is exceeded.
 * @param pattern - Literal text to find in each line.
 * @param path - Optional virtual search path.
 * @param globPattern - Optional filename glob.
 * @param maxCount - Optional maximum returned matches.
 * @returns An Effect with matches or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(grepFilesEffect("TODO"), deepAgentBucketLayer(context)));
 */
export const grepFilesEffect = Effect.fn("Agents.bucket.grep")(
  function* (
    pattern: string,
    path: string | null = null,
    globPattern: string | null = null,
    maxCount: number | null = null,
  ) {
    const context = yield* DeepAgentBucket;
    const glob = yield* Effect.try({
      try: () => {
        if (typeof pattern !== "string") throw new TypeError("Grep pattern must be a string");
        return globPattern === null ? undefined : compileGlob(globPattern);
      },
      catch: deepAgentBucketFailure,
    });
    const keys = yield* scopedKeysEffect(path);
    const cap = maxCount === null || !Number.isFinite(maxCount)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(maxCount));
    const matches: NonNullable<GrepResult["matches"]> = [];
    for (const key of keys) {
      const absolute = yield* Effect.try({
        try: () => filePath(context, key),
        catch: deepAgentBucketFailure,
      });
      const name = absolute.split("/").at(-1)!;
      if (glob !== undefined && !matchesGlob(name, glob)) continue;
      const data = yield* readFileDataEffect(absolute);
      if (data === undefined || !isTextMimeType(data.mimeType) || typeof data.content !== "string") {
        continue;
      }
      for (const [index, text] of data.content.split("\n").entries()) {
        if (!text.includes(pattern)) continue;
        matches.push({ path: absolute, line: index + 1, text });
        if (matches.length > cap) return { matches: matches.slice(0, cap), truncated: true };
      }
    }
    return { matches } satisfies GrepResult;
  },
  (effect) => observeAgent("bucket.grep", effect),
);

/** Searches text files for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param pattern - Literal text to find.
 * @param path - Optional virtual search path.
 * @param globPattern - Optional filename glob.
 * @param maxCount - Optional maximum returned matches.
 * @returns Matches or a legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await grepFiles(context, "TODO", "/notes", "*.md", 10);
 */
export function grepFiles(
  context: DeepAgentBucketContext,
  pattern: string,
  path: string | null = null,
  globPattern: string | null = null,
  maxCount: number | null = null,
): Promise<GrepResult> {
  return Effect.runPromise(
    grepFilesEffect(pattern, path, globPattern, maxCount).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}
