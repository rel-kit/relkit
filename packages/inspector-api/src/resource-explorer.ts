export type {
  InspectorBucketExplorer,
  InspectorCacheExplorer,
  InspectorResourceExplorers,
} from "./resource-explorer.types.js";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import type { JsonValue } from "@relkit/contracts";
import { InspectorEndpointError } from "./router-utils.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "./shared.js";

/**
 * Validates resource filters before listing native bucket objects.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param bucketId - Declared bucket identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing a bounded redacted object page or existing unsupported envelope.
 */
export const bucketObjectsEffect = Effect.fn("Inspector.bucketObjects")(
  function* (generation: ResolvedActiveGeneration, bucketId: string, request: Request) {
    const explorer = generation.resources?.buckets;
    if (explorer === undefined || !(yield* nativeAttempt(() => explorer.supports(bucketId))))
      return unsupported(generation);
    const query = yield* projectionAttempt(() => queryFor(request));
    const result = yield* nativeAttempt(() =>
      explorer.list({ bucketId, ...query, signal: request.signal }),
    );
    const projected = safeJson(result);
    return safeJson({
      ...identity(generation),
      supported: true,
      ...(isRecord(projected) ? projected : {}),
    });
  },
  (effect) => observeExecution("inspector", "bucketObjects", effect),
);

/**
 * Validates resource filters before listing native bucket objects.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param bucketId - Declared bucket identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A bounded redacted object page or existing unsupported envelope.
 */
export function bucketObjects(
  generation: ResolvedActiveGeneration,
  bucketId: string,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorExecution,
    bucketObjectsEffect(generation, bucketId, request),
  );
}

/**
 * Validates byte bounds before reading a native bucket preview.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param bucketId - Declared bucket identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param maximumBytes - Configured upper bound for the native preview.
 * @returns A lazy observed Effect containing safe preview metadata and permitted content, preserving truncation evidence.
 */
export const bucketPreviewEffect = Effect.fn("Inspector.bucketPreview")(
  function* (
    generation: ResolvedActiveGeneration,
    bucketId: string,
    request: Request,
    maximumBytes: number,
  ) {
    const explorer = generation.resources?.buckets;
    if (explorer === undefined || !(yield* nativeAttempt(() => explorer.supports(bucketId))))
      return unsupported(generation);
    const params = new URL(request.url).searchParams;
    const { key, offset, limit } = yield* projectionAttempt(() => ({
      key: requiredText(params.get("key"), "key", 1_024),
      offset: integer(params.get("offset"), "offset", 0, Number.MAX_SAFE_INTEGER),
      limit: integer(params.get("limit"), "limit", maximumBytes, maximumBytes),
    }));
    const result = yield* nativeAttempt(() =>
      explorer.preview({ bucketId, key, offset, limit, signal: request.signal }),
    );
    if (result === undefined)
      return yield* Effect.fail(new InspectorEndpointError("RELKIT_INSPECTOR_NOT_FOUND", 404));
    const metadata = safeJson(result.metadata ?? {});
    const contentType = mediaType(metadata);
    const totalBytes = result.totalBytes ?? result.bytes.byteLength;
    return {
      ...identity(generation),
      supported: true,
      key,
      metadata,
      totalBytes,
      truncated: offset + result.bytes.byteLength < totalBytes,
      ...previewContent(result.bytes, contentType),
    } as JsonValue;
  },
  (effect) => observeExecution("inspector", "bucketPreview", effect),
);

/**
 * Validates byte bounds before reading a native bucket preview.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param bucketId - Declared bucket identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param maximumBytes - Configured upper bound for the native preview.
 * @returns Safe preview metadata and permitted content, preserving truncation evidence.
 */
export function bucketPreview(
  generation: ResolvedActiveGeneration,
  bucketId: string,
  request: Request,
  maximumBytes: number,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorExecution,
    bucketPreviewEffect(generation, bucketId, request, maximumBytes),
  );
}

/**
 * Validates resource filters before scanning native cache keys.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param cacheId - Declared cache identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing a bounded redacted key page or existing unsupported envelope.
 */
export const cacheKeysEffect = Effect.fn("Inspector.cacheKeys")(
  function* (generation: ResolvedActiveGeneration, cacheId: string, request: Request) {
    const explorer = generation.resources?.cache;
    if (explorer === undefined || !(yield* nativeAttempt(() => explorer.supports(cacheId))))
      return unsupported(generation);
    const query = yield* projectionAttempt(() => queryFor(request));
    const result = yield* nativeAttempt(() =>
      explorer.scan({ cacheId, ...query, signal: request.signal }),
    );
    const projected = safeJson(result);
    return safeJson({
      ...identity(generation),
      supported: true,
      ...(isRecord(projected) ? projected : {}),
    });
  },
  (effect) => observeExecution("inspector", "cacheKeys", effect),
);

/**
 * Validates resource filters before scanning native cache keys.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param cacheId - Declared cache identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A bounded redacted key page or existing unsupported envelope.
 */
export function cacheKeys(
  generation: ResolvedActiveGeneration,
  cacheId: string,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, cacheKeysEffect(generation, cacheId, request));
}

/**
 * Validates byte bounds before reading one native cache value.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param cacheId - Declared cache identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param maximumBytes - Configured upper bound for the native preview.
 * @returns A lazy observed Effect containing the existing redacted cache-value response.
 */
export const cacheValueEffect = Effect.fn("Inspector.cacheValue")(
  function* (
    generation: ResolvedActiveGeneration,
    cacheId: string,
    request: Request,
    maximumBytes: number,
  ) {
    const explorer = generation.resources?.cache;
    if (explorer === undefined || !(yield* nativeAttempt(() => explorer.supports(cacheId))))
      return unsupported(generation);
    const params = new URL(request.url).searchParams;
    const { key, limit } = yield* projectionAttempt(() => ({
      key: requiredText(params.get("key"), "key", 2_048),
      limit: integer(params.get("limit"), "limit", maximumBytes, maximumBytes),
    }));
    const result = yield* nativeAttempt(() =>
      explorer.value({ cacheId, key, limit, signal: request.signal }),
    );
    if (result === undefined)
      return yield* Effect.fail(new InspectorEndpointError("RELKIT_INSPECTOR_NOT_FOUND", 404));
    const projected = safeJson(result);
    return {
      ...identity(generation),
      supported: true,
      ...(isRecord(projected) ? projected : {}),
      ...(isRecord(result) && "value" in result ? { value: safeJson(result.value) } : {}),
    } as JsonValue;
  },
  (effect) => observeExecution("inspector", "cacheValue", effect),
);

/**
 * Validates byte bounds before reading one native cache value.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param cacheId - Declared cache identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param maximumBytes - Configured upper bound for the native preview.
 * @returns The existing redacted cache-value response.
 */
export function cacheValue(
  generation: ResolvedActiveGeneration,
  cacheId: string,
  request: Request,
  maximumBytes: number,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorExecution,
    cacheValueEffect(generation, cacheId, request, maximumBytes),
  );
}

import {
  queryFor,
  previewContent,
  mediaType,
  unsupported,
  requiredText,
  integer,
} from "./resource-explorer-support.js";
