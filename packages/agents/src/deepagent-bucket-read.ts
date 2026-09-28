import type { ReadRawResult, ReadResult } from "deepagents";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { DeepAgentBucket, deepAgentBucketLayer } from "./deepagent-bucket-service.js";
import { readFileDataEffect } from "./deepagent-bucket-file-data.js";
import {
  errorMessage,
  isControlFailure,
  isTextMimeType,
  normalizedPage,
} from "./deepagent-bucket-files.js";
import type { DeepAgentBucketContext } from "./deepagent-bucket-files.types.js";

/** Reads the full file payload from the current bucket service.
 * @param path - Virtual file path.
 * @returns An Effect with raw data or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(readBucketRawEffect("/a.md"), deepAgentBucketLayer(context)));
 */
export const readBucketRawEffect = Effect.fn("Agents.bucket.readRaw")(
  function* (path: string) {
    yield* DeepAgentBucket;
    const data = yield* readFileDataEffect(path);
    return data === undefined ? { error: `File '${path}' not found` } : { data };
  },
  (effect) => observeAgent("bucket.read-raw", effect),
);

/** Reads the full file payload for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file path.
 * @returns Raw data or a legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await readBucketRaw(context, "/a.md");
 */
export function readBucketRaw(
  context: DeepAgentBucketContext,
  path: string,
): Promise<ReadRawResult> {
  return Effect.runPromise(
    readBucketRawEffect(path).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}

/** Reads a paged text file or an unmodified binary payload.
 * @param path - Virtual file path.
 * @param offset - Zero-based text line offset.
 * @param limit - Maximum number of text lines.
 * @returns An Effect with page data or a tagged bucket failure.
 * @example Effect.runPromise(Effect.provide(readBucketEffect("/a.md", 0, 50), deepAgentBucketLayer(context)));
 */
export const readBucketEffect = Effect.fn("Agents.bucket.read")(
  function* (path: string, offset = 0, limit = 500) {
    yield* DeepAgentBucket;
    const data = yield* readFileDataEffect(path);
    if (data === undefined) return { error: `File '${path}' not found` };
    if (!isTextMimeType(data.mimeType)) return { content: data.content, mimeType: data.mimeType };
    if (typeof data.content !== "string") {
      return { error: `File '${path}' has binary content but text MIME type` };
    }
    const page = normalizedPage(offset, limit);
    const lines = data.content.split("\n");
    const totalLines = lines.at(-1) === "" ? lines.length - 1 : lines.length;
    const selected = lines.slice(page.offset, page.offset + page.limit);
    if (selected.length === 0 || page.offset >= totalLines || page.limit === 0) {
      return { content: selected.join("\n"), mimeType: data.mimeType };
    }
    const endLine = Math.min(page.offset + selected.length, totalLines);
    return {
      content: selected.join("\n"),
      mimeType: data.mimeType,
      totalLines,
      startLine: page.offset + 1,
      endLine,
      ...(endLine < totalLines ? { nextOffset: endLine } : {}),
    };
  },
  (effect) => observeAgent("bucket.read", effect),
);

/** Reads a file for existing DeepAgents Promise callers.
 * @param context - Bound bucket client and prefix.
 * @param path - Virtual file path.
 * @param offset - Zero-based text line offset.
 * @param limit - Maximum number of text lines.
 * @returns A text page, binary content, or legacy error result.
 * @throws A cancellation or timeout failure from the bucket client.
 * @example await readBucket(context, "/a.md", 0, 50);
 */
export function readBucket(
  context: DeepAgentBucketContext,
  path: string,
  offset = 0,
  limit = 500,
): Promise<ReadResult> {
  return Effect.runPromise(
    readBucketEffect(path, offset, limit).pipe(
      Effect.catchTag("DeepAgentBucketFailure", (failure) =>
        isControlFailure(failure.cause)
          ? Effect.fail(failure.cause)
          : Effect.succeed({ error: errorMessage(failure.cause) }),
      ),
      Effect.provide(deepAgentBucketLayer(context)),
    ),
  );
}
