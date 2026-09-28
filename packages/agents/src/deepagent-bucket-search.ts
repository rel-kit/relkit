import type { FileInfo, LsResult } from "deepagents";
import { Effect, Result } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import {
  errorMessage,
  isControlFailure,
  virtualPath,
  type DeepAgentBucketContext,
} from "./deepagent-bucket-files.js";
import { infoForEffect } from "./deepagent-bucket-file-index.js";

/** Lists direct files and child directories through bounded metadata IO.
 * @param path - Virtual directory to list.
 * @returns An Effect with ordered files or DeepAgentBucketFailure.
 * @example Effect.runPromise(Effect.provide(listDirectoryEffect("/"), deepAgentBucketLayer(context)));
 */
export const listDirectoryEffect = Effect.fn("Agents.bucket.list")(
  function* (path: string) {
    const context = yield* DeepAgentBucket;
    const directory = yield* Effect.try({
      try: () => virtualPath(path, true),
      catch: deepAgentBucketFailure,
    });
    const keyPrefix = directory === "/" ? `${context.prefix}/` : `${context.prefix}${directory}`;
    const keys = [...(yield* Effect.tryPromise({
      try: () => context.bucket.list(keyPrefix),
      catch: deepAgentBucketFailure,
    }))].sort();
    const directories = new Set<string>();
    const direct: string[] = [];
    for (const key of keys) {
      const relative = key.slice(keyPrefix.length);
      const separator = relative.indexOf("/");
      if (separator >= 0) directories.add(relative.slice(0, separator));
      else if (relative !== "") direct.push(key);
    }
    const outcomes = yield* Effect.forEach(
      direct,
      (key) => Effect.result(infoForEffect(key)),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
    const files: FileInfo[] = outcomes.flatMap((outcome) =>
      Result.isSuccess(outcome) && outcome.success !== undefined ? [outcome.success] : [],
    );
    for (const name of directories) {
      files.push({ path: `${directory}${name}/`, is_dir: true, size: 0, modified_at: "" });
    }
    return { files: files.sort((left, right) => left.path.localeCompare(right.path)) };
  },
  (effect) => observeAgent("bucket.list", effect),
);

/** Lists a virtual directory for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual directory to list.
 * @returns Ordered files or an error result.
 * @throws A cancellation or control failure.
 * @example await listDirectory(context, "/notes");
 */
export function listDirectory(
  context: DeepAgentBucketContext,
  path: string,
): Promise<LsResult> {
  return Effect.runPromise(
    listDirectoryEffect(path).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}
