import { isAbsolute } from "node:path";
import type { BucketObjectMetadata } from "@relkit/buckets";
import type { TestBucketObject } from "./buckets-types.js";

/**
 * Rejects unsafe or empty native bucket keys.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns Nothing for a valid relative storage key.
 */
export function assertBucketKey(value: string): void {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    value.startsWith(".relkit") ||
    value.startsWith("__relkit")
  ) {
    throw new TypeError("Bucket key is invalid");
  }
}

/**
 * Validates the existing optional bucket listing prefix.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns The valid prefix retained for lexical filtering.
 */
export function assertBucketPrefix(value: string): string {
  if (value === "") return value;
  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value;
  if (trimmed !== "") assertBucketKey(trimmed);
  return value;
}

/**
 * Detaches nested native bucket metadata.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns Independent metadata or undefined when no object is stored.
 */
export function copyBucketMetadata(
  value: BucketObjectMetadata | undefined,
): BucketObjectMetadata | undefined {
  if (value === undefined) return undefined;
  return Object.freeze({
    ...value,
    ...(value.metadata === undefined ? {} : { metadata: { ...value.metadata } }),
  });
}

/**
 * Detaches stored bytes and nested native metadata.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns A snapshot independent from authoritative bucket storage.
 */
export function copyBucketObject(value: TestBucketObject): TestBucketObject {
  return Object.freeze({
    bytes: new Uint8Array(value.bytes),
    key: value.key,
    metadata: copyBucketMetadata(value.metadata)!,
  });
}
