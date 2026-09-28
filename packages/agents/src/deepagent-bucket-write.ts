import type { EditResult, WriteResult } from "deepagents";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { deepAgentBucketFailure } from "./deepagent-bucket-error.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import { putFileDataEffect, readFileDataEffect } from "./deepagent-bucket-file-data.js";
import { errorMessage, isControlFailure, virtualPath } from "./deepagent-bucket-files.js";
import type { DeepAgentBucketContext } from "./deepagent-bucket-files.types.js";

/** Writes a text file through the current bucket service.
 * @param path - Virtual file path.
 * @param content - Text to write.
 * @returns An Effect with the written path or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(writeBucketEffect("/a.md", "hi"), deepAgentBucketLayer(context)));
 */
export const writeBucketEffect = Effect.fn("Agents.bucket.write")(
  function* (path: string, content: string) {
    yield* DeepAgentBucket;
    const normalized = yield* Effect.try({
      try: () => {
        if (typeof content !== "string") throw new TypeError("File content must be a string");
        return virtualPath(path);
      },
      catch: deepAgentBucketFailure,
    });
    yield* putFileDataEffect(normalized, content);
    return { path: normalized, filesUpdate: null } satisfies WriteResult;
  },
  (effect) => observeAgent("bucket.write", effect),
);

/** Writes text for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file path.
 * @param content - Text to write.
 * @returns The written path or a legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await writeBucket(context, "/a.md", "hi");
 */
export function writeBucket(
  context: DeepAgentBucketContext,
  path: string,
  content: string,
): Promise<WriteResult> {
  return Effect.runPromise(
    writeBucketEffect(path, content).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}

/** Replaces text with the existing DeepAgents edit rules.
 * @param path - Virtual file path.
 * @param oldText - Existing text to replace.
 * @param newText - Replacement text.
 * @param replaceAll - Whether multiple occurrences may be replaced.
 * @returns An Effect with edit details or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(editBucketEffect("/a.md", "old", "new"), deepAgentBucketLayer(context)));
 */
export const editBucketEffect = Effect.fn("Agents.bucket.edit")(
  function* (path: string, oldText: string, newText: string, replaceAll = false) {
    yield* DeepAgentBucket;
    const normalized = yield* Effect.try({
      try: () => virtualPath(path),
      catch: deepAgentBucketFailure,
    });
    const data = yield* readFileDataEffect(normalized);
    if (data === undefined) return { error: `Error: File '${normalized}' not found` };
    if (typeof data.content !== "string") return { error: `Error: File '${normalized}' is binary` };
    if (oldText === "" && data.content !== "") {
      return { error: "Error: oldString cannot be empty when file has content" };
    }
    const occurrences = oldText === "" ? 0 : data.content.split(oldText).length - 1;
    if (oldText !== "" && occurrences === 0) {
      return { error: `Error: String not found in file: '${oldText}'` };
    }
    if (occurrences > 1 && !replaceAll) {
      return { error: `Error: String '${oldText}' has multiple occurrences (${occurrences})` };
    }
    const content = oldText === "" ? newText : data.content.split(oldText).join(newText);
    yield* putFileDataEffect(normalized, content);
    return { path: normalized, filesUpdate: null, occurrences } satisfies EditResult;
  },
  (effect) => observeAgent("bucket.edit", effect),
);

/** Edits text for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file path.
 * @param oldText - Existing text to replace.
 * @param newText - Replacement text.
 * @param replaceAll - Whether multiple occurrences may be replaced.
 * @returns Edit details or a legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await editBucket(context, "/a.md", "old", "new", true);
 */
export function editBucket(
  context: DeepAgentBucketContext,
  path: string,
  oldText: string,
  newText: string,
  replaceAll = false,
): Promise<EditResult> {
  return Effect.runPromise(
    editBucketEffect(path, oldText, newText, replaceAll).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}
