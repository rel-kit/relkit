import {
  LocalBucketPaginationError,
  type LocalBucketListPage,
  type LocalBucketListOptions,
} from "./types.js";

export const DEFAULT_BUCKET_PAGE_SIZE = 100;
export const MAX_BUCKET_PAGE_SIZE = 1_000;

/**
 * Returns a stable page of sorted keys using a prefix-bound cursor.
 * @param keys - Sorted keys eligible for this prefix.
 * @param prefix - Normalized key prefix binding the result or cursor.
 * @param options - Caller policy, pagination or construction settings.
 * @returns The requested keys and an optional continuation cursor.
 */
export function paginateKeys(
  keys: readonly string[],
  prefix: string,
  options: LocalBucketListOptions | undefined,
): LocalBucketListPage {
  const limit = options?.limit ?? DEFAULT_BUCKET_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_BUCKET_PAGE_SIZE) {
    throw new LocalBucketPaginationError();
  }
  const start = options?.cursor === undefined ? 0 : decodeCursor(options.cursor, prefix);
  const items = keys.slice(start, start + limit);
  const nextIndex = start + items.length;
  return Object.freeze({
    items: Object.freeze(items),
    ...(nextIndex < keys.length ? { nextCursor: encodeCursor(prefix, nextIndex) } : {}),
  });
}

/**
 * Encodes a prefix and offset without exposing filesystem locations.
 * @param prefix - Normalized key prefix binding the result or cursor.
 * @param index - Offset into the sorted key list.
 * @returns An opaque list cursor.
 */
function encodeCursor(prefix: string, index: number): string {
  return Buffer.from(JSON.stringify({ prefix, index }), "utf8").toString("base64url");
}

/**
 * Validates cursor version, prefix identity and nonnegative offset.
 * @param cursor - Opaque continuation cursor supplied by the caller.
 * @param prefix - Normalized key prefix binding the result or cursor.
 * @returns The validated continuation offset.
 */
function decodeCursor(cursor: string, prefix: string): number {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      prefix?: unknown;
      index?: unknown;
    };
    if (
      value.prefix !== prefix ||
      !Number.isSafeInteger(value.index) ||
      (value.index as number) < 0
    ) {
      throw new Error();
    }
    return value.index as number;
  } catch {
    throw new LocalBucketPaginationError();
  }
}
