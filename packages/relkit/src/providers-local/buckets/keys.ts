import { isAbsolute, relative, resolve } from "node:path";
import { LOCAL_BUCKET_RESERVED_PREFIXES, LocalBucketKeyError } from "./types.js";

const WINDOWS_DRIVE = /^[A-Za-z]:/;
const MAX_KEY_BYTES = 4_096;

/** Validates an object key without normalizing away an attempted escape.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns The result described by the operation contract.
 */
export function normalizeBucketKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new LocalBucketKeyError();
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    isAbsolute(value) ||
    WINDOWS_DRIVE.test(value)
  ) {
    throw new LocalBucketKeyError();
  }
  if (new TextEncoder().encode(value).byteLength > MAX_KEY_BYTES) {
    throw new LocalBucketKeyError();
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new LocalBucketKeyError();
  }
  if (isReserved(segments[0])) throw new LocalBucketKeyError();
  return value;
}

/** Validates a list prefix while allowing the conventional trailing slash.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns The result described by the operation contract.
 */
export function normalizeBucketPrefix(value: unknown): string {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string") throw new LocalBucketKeyError();
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    isAbsolute(value) ||
    WINDOWS_DRIVE.test(value)
  ) {
    throw new LocalBucketKeyError();
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment, index) =>
        (segment.length === 0 && index !== segments.length - 1) ||
        segment === "." ||
        segment === "..",
    )
  ) {
    throw new LocalBucketKeyError();
  }
  if (isReserved(segments[0])) throw new LocalBucketKeyError();
  return value;
}

/**
 * Encodes a normalized key into a filesystem-safe object identity.
 * @param key - Application key to validate and resolve.
 * @returns The encoded key used in object filenames.
 */
export function encodeBucketKey(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

/**
 * Rejects a resolved path that escapes the owned root.
 * @param root - Provider-owned root directory.
 * @param candidate - Resolved path that must remain beneath the root.
 * @returns Nothing for a contained path.
 */
export function assertContainedPath(root: string, candidate: string): void {
  const path = relative(resolve(root), resolve(candidate));
  if (path === "" || path.startsWith("..") || isAbsolute(path)) throw new LocalBucketKeyError();
}

/**
 * Recognizes provider-owned path segments that callers cannot write.
 * @param segment - One normalized path segment.
 * @returns Whether the segment is reserved.
 */
function isReserved(segment: string | undefined): boolean {
  return (
    segment !== undefined &&
    LOCAL_BUCKET_RESERVED_PREFIXES.some((prefix) => segment.startsWith(prefix))
  );
}
