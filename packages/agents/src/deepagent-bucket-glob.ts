import { matchesGlob } from "node:path";
import type { FileInfo, GlobResult } from "deepagents";
import { Effect, Result } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import {
  errorMessage,
  filePath,
  isControlFailure,
  virtualPath,
  type DeepAgentBucketContext,
} from "./deepagent-bucket-files.js";
import { infoForEffect, scopedKeysEffect } from "./deepagent-bucket-file-index.js";

/** Finds matching bucket files and orders them by modification time.
 * @param pattern - Glob pattern relative to the search path.
 * @param path - Virtual search path.
 * @returns An Effect with matching files or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(globFilesEffect("*.md"), deepAgentBucketLayer(context)));
 */
export const globFilesEffect = Effect.fn("Agents.bucket.glob")(
  function* (pattern: string, path = "/") {
    const context = yield* DeepAgentBucket;
    const { glob, base } = yield* Effect.try({
      try: () => ({ glob: compileGlob(pattern), base: virtualPath(path, true) }),
      catch: deepAgentBucketFailure,
    });
    const keys = yield* scopedKeysEffect(path);
    const matching = yield* Effect.try({
      try: () => keys.filter((key) => {
        const absolute = filePath(context, key);
        const relative = absolute.startsWith(base)
          ? absolute.slice(base.length)
          : absolute.split("/").at(-1)!;
        return relative !== "" && matchesGlob(relative, glob);
      }),
      catch: deepAgentBucketFailure,
    });
    const outcomes = yield* Effect.forEach(
      matching,
      (key) => Effect.result(infoForEffect(key)),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
    const infos: FileInfo[] = outcomes.flatMap((outcome) =>
      Result.isSuccess(outcome) && outcome.success !== undefined ? [outcome.success] : [],
    );
    infos.sort(
      (left, right) =>
        (right.modified_at ?? "").localeCompare(left.modified_at ?? "") ||
        left.path.localeCompare(right.path),
    );
    return { files: infos } satisfies GlobResult;
  },
  (effect) => observeAgent("bucket.glob", effect),
);

/** Finds files for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param pattern - Glob pattern relative to the search path.
 * @param path - Virtual search path.
 * @returns Matching files or a legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await globFiles(context, "*.md", "/notes");
 */
export function globFiles(
  context: DeepAgentBucketContext,
  pattern: string,
  path = "/",
): Promise<GlobResult> {
  return Effect.runPromise(
    globFilesEffect(pattern, path).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}

/** Validates and normalizes a user glob without changing match semantics. */
export function compileGlob(pattern: string): string {
  if (
    typeof pattern !== "string" ||
    pattern.trim() === "" ||
    pattern.includes("\0") ||
    pattern.replaceAll("\\", "/").split("/").includes("..")
  ) {
    throw new TypeError("Glob pattern is invalid");
  }
  return pattern.startsWith("/") ? pattern.slice(1) : pattern;
}
