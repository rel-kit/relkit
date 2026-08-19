import {
  LocalBucketPaginationError,
  type LocalBucketListPage,
  type LocalBucketListOptions,
} from "./types.js";

export const DEFAULT_BUCKET_PAGE_SIZE = 100;
export const MAX_BUCKET_PAGE_SIZE = 1_000;

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

function encodeCursor(prefix: string, index: number): string {
  return Buffer.from(JSON.stringify({ prefix, index }), "utf8").toString("base64url");
}

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
