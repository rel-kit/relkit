import type { DeleteResult } from "deepagents";
import { Effect, Result } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import {
  bucketKey,
  errorMessage,
  isControlFailure,
  virtualPath,
  type DeepAgentBucketContext,
} from "./deepagent-bucket-files.js";

/** Removes a virtual file or directory with at most eight bucket requests in flight.
 * @param path - Virtual path to remove; root removes every key in the backend prefix.
 * @returns An Effect with the delete result or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(removeBucketPathEffect("/notes"), deepAgentBucketLayer(context)));
 */
export const removeBucketPathEffect = Effect.fn("Agents.bucket.delete")(
  function* (path: string) {
    const context = yield* DeepAgentBucket;
    const normalized = yield* Effect.try({
      try: () => (path === "/" ? "/" : virtualPath(path)),
      catch: deepAgentBucketFailure,
    });
    const keys =
      normalized === "/"
        ? yield* Effect.tryPromise({
            try: () => context.bucket.list(`${context.prefix}/`),
            catch: deepAgentBucketFailure,
          })
        : yield* deletionKeys(context, normalized);
    if (keys.length === 0) {
      return { error: `Error: File '${normalized}' not found` } satisfies DeleteResult;
    }
    const outcomes = yield* Effect.forEach(
      keys,
      (key) =>
        Effect.result(
          Effect.tryPromise({
            try: () => context.bucket.delete(key),
            catch: deepAgentBucketFailure,
          }),
        ),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
    return { path: normalized, filesUpdate: null } satisfies DeleteResult;
  },
  (effect) => observeAgent("bucket.delete", effect),
);

/** Removes a bucket path for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file or directory path.
 * @returns The removed path or a legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await removeBucketPath(context, "/notes");
 */
export function removeBucketPath(
  context: DeepAgentBucketContext,
  path: string,
): Promise<DeleteResult> {
  return Effect.runPromise(
    removeBucketPathEffect(path).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}

function deletionKeys(context: DeepAgentBucketContext, path: string) {
  return Effect.gen(function* () {
    const exact = bucketKey(context, path);
    const [exists, nested] = yield* Effect.all([
      Effect.tryPromise({
        try: () => context.bucket.exists(exact),
        catch: deepAgentBucketFailure,
      }),
      Effect.tryPromise({
        try: () => context.bucket.list(`${exact}/`),
        catch: deepAgentBucketFailure,
      }),
    ]);
    return exists ? [exact, ...nested] : nested;
  });
}
