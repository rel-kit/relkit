/** Content digests for repository tooling: one SHA-256 identity per byte sequence. */
import { createHash } from "node:crypto";

/**
 * Hashes bytes or text.
 * @param bytes - Content to hash; strings are hashed as UTF-8.
 * @returns `sha256:<hex>`.
 */
export function contentDigest(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
