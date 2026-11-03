import { Schema } from "effect";
import { StoredBucketObject } from "./storage.schemas.js";
import type { LocalBucketStorage } from "./storage.types.js";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertContainedPath, encodeBucketKey, normalizeBucketKey } from "./keys.js";
import { quarantineStateFile } from "../state.js";
import { LocalBucketStateError, type StoredLocalBucketObject } from "./types.js";

export type { LocalBucketStorage } from "./storage.types.js";

const OBJECT_DIRECTORY = "objects";
const OBJECT_SUFFIX = ".json";

/**
 * Creates filesystem object operations within a validated owned root.
 * @param requestedRoot - Provider-owned directory requested by the caller.
 * @returns Lazy object IO operations sharing the resolved root.
 */
export function createBucketStorage(requestedRoot: string): LocalBucketStorage {
  const root = resolve(requestedRoot);
  if (root === resolve("/")) throw new LocalBucketStateError("Bucket root is too broad");
  const objectRoot = join(root, OBJECT_DIRECTORY);
  ensureDirectory(root);
  ensureDirectory(objectRoot);
  assertContainedPath(root, objectRoot);
  const storage: LocalBucketStorage = Object.freeze({
    root,
    objectRoot,
    read: (key: string) => readObject(objectRoot, key),
    write: (value: StoredLocalBucketObject) => writeObject(objectRoot, value),
    remove: (key: string) => removeObject(objectRoot, key),
    list: () => listObjects(objectRoot),
    ready: async () => {
      await listObjects(objectRoot);
    },
  });
  return storage;
}

/**
 * Reads and validates one object, quarantining malformed persisted data.
 * @param objectRoot - Validated directory containing encoded objects.
 * @param key - Application key to validate and resolve.
 * @returns The stored object or undefined when missing or quarantined.
 */
async function readObject(
  objectRoot: string,
  key: string,
): Promise<StoredLocalBucketObject | undefined> {
  const path = objectPath(objectRoot, key);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (cause) {
    if (isMissing(cause)) return undefined;
    throw new LocalBucketStateError("Bucket object state cannot be read");
  }
  try {
    return parseObject(contents, key);
  } catch (cause) {
    if (!(cause instanceof LocalBucketStateError)) throw cause;
    quarantineStateFile(path, resolve(objectRoot, ".."));
    return undefined;
  }
}

/**
 * Commits an object through a private temporary file and atomic rename.
 * @param objectRoot - Validated directory containing encoded objects.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns A Promise resolving after the replacement is committed.
 */
async function writeObject(objectRoot: string, value: StoredLocalBucketObject): Promise<void> {
  const target = objectPath(objectRoot, value.key);
  const temporary = join(objectRoot, `.relkit-tmp-${randomUUID()}${OBJECT_SUFFIX}`);
  try {
    await writeFile(temporary, JSON.stringify(value), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, target);
  } catch (cause) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (cause instanceof LocalBucketStateError) throw cause;
    throw new LocalBucketStateError("Bucket object write could not be committed");
  }
}

/**
 * Removes the encoded object file without treating absence as failure.
 * @param objectRoot - Validated directory containing encoded objects.
 * @param key - Application key to validate and resolve.
 * @returns A Promise resolving after deletion.
 */
async function removeObject(objectRoot: string, key: string): Promise<void> {
  await rm(objectPath(objectRoot, key), { force: true });
}

/**
 * Reads valid object envelopes and quarantines malformed files.
 * @param objectRoot - Validated directory containing encoded objects.
 * @returns Validated objects in filesystem enumeration order.
 */
async function listObjects(objectRoot: string): Promise<readonly StoredLocalBucketObject[]> {
  let entries;
  try {
    entries = await readdir(objectRoot, { withFileTypes: true });
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw new LocalBucketStateError("Bucket object directory cannot be read");
  }
  const values: StoredLocalBucketObject[] = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(OBJECT_SUFFIX) ||
      entry.name.startsWith(".relkit-")
    ) {
      continue;
    }
    const path = join(objectRoot, entry.name);
    let contents: string;
    try {
      contents = await readFile(path, "utf8");
    } catch {
      throw new LocalBucketStateError("Bucket object state cannot be read");
    }
    try {
      values.push(parseObject(contents));
    } catch (cause) {
      if (!(cause instanceof LocalBucketStateError)) throw cause;
      quarantineStateFile(path, resolve(objectRoot, ".."));
    }
  }
  return values;
}

/**
 * Resolves an encoded key beneath the owned object directory.
 * @param objectRoot - Validated directory containing encoded objects.
 * @param key - Application key to validate and resolve.
 * @returns A contained object path.
 */
function objectPath(objectRoot: string, key: string): string {
  const path = join(objectRoot, `${encodeBucketKey(key)}${OBJECT_SUFFIX}`);
  assertContainedPath(objectRoot, path);
  return path;
}

/**
 * Validates envelope shape, canonical encoding and content integrity.
 * @param contents - Untrusted persisted JSON text.
 * @param expectedKey - Requested key to compare with the stored identity.
 * @returns The validated version-one object envelope.
 */
function parseObject(contents: string, expectedKey?: string): StoredLocalBucketObject {
  try {
    const value = Schema.decodeUnknownSync(StoredBucketObject)(JSON.parse(contents));
    if (expectedKey !== undefined && value.key !== expectedKey) throw new Error();
    normalizeBucketKey(value.key);
    const bytes = Buffer.from(value.data, "base64");
    if (
      bytes.toString("base64") !== value.data ||
      bytes.byteLength !== value.size ||
      value.etag !== value.contentHash ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== value.contentHash
    ) {
      throw new Error();
    }
    return value;
  } catch {
    throw new LocalBucketStateError("Bucket object state is malformed");
  }
}

/**
 * Creates an absent directory and rejects unsafe non-directory paths.
 * @param path - Filesystem path within provider ownership.
 * @returns Nothing once the directory is safe to use.
 */
function ensureDirectory(path: string): void {
  try {
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new LocalBucketStateError("Bucket root is not a directory");
  } catch (cause) {
    if (!(cause as NodeJS.ErrnoException).code?.includes("ENOENT")) throw cause;
    mkdirSync(path, { recursive: true });
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new LocalBucketStateError("Bucket root is not a directory");
  }
}

/**
 * Checks that every metadata field is a string.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether the value is a string-valued record.
 */
function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

/**
 * Recognizes native missing-file errors without interpreting other failures.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns Whether the error code is ENOENT.
 */
function isMissing(value: unknown): boolean {
  return (value as NodeJS.ErrnoException)?.code === "ENOENT";
}
