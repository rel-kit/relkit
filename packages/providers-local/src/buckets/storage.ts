import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertContainedPath, encodeBucketKey, normalizeBucketKey } from "./keys.js";
import { quarantineStateFile } from "../state.js";
import { LocalBucketStateError, type StoredLocalBucketObject } from "./types.js";

const OBJECT_DIRECTORY = "objects";
const OBJECT_SUFFIX = ".json";

export interface LocalBucketStorage {
  readonly root: string;
  readonly objectRoot: string;
  readonly read: (key: string) => Promise<StoredLocalBucketObject | undefined>;
  readonly write: (value: StoredLocalBucketObject) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly list: () => Promise<readonly StoredLocalBucketObject[]>;
  readonly ready: () => Promise<void>;
}

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

async function removeObject(objectRoot: string, key: string): Promise<void> {
  await rm(objectPath(objectRoot, key), { force: true });
}

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

function objectPath(objectRoot: string, key: string): string {
  const path = join(objectRoot, `${encodeBucketKey(key)}${OBJECT_SUFFIX}`);
  assertContainedPath(objectRoot, path);
  return path;
}

function parseObject(contents: string, expectedKey?: string): StoredLocalBucketObject {
  try {
    const value = JSON.parse(contents) as Partial<StoredLocalBucketObject>;
    if (
      value.version !== 1 ||
      typeof value.key !== "string" ||
      (expectedKey !== undefined && value.key !== expectedKey) ||
      !Number.isSafeInteger(value.size) ||
      (value.size as number) < 0 ||
      typeof value.contentHash !== "string" ||
      typeof value.etag !== "string" ||
      typeof value.data !== "string" ||
      !isStringRecord(value.metadata)
    ) {
      throw new Error();
    }
    normalizeBucketKey(value.key);
    if (value.contentType !== undefined && typeof value.contentType !== "string") {
      throw new Error();
    }
    const bytes = Buffer.from(value.data, "base64");
    if (
      bytes.toString("base64") !== value.data ||
      bytes.byteLength !== value.size ||
      value.etag !== value.contentHash ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== value.contentHash
    ) {
      throw new Error();
    }
    return value as StoredLocalBucketObject;
  } catch {
    throw new LocalBucketStateError("Bucket object state is malformed");
  }
}

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

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isMissing(value: unknown): boolean {
  return (value as NodeJS.ErrnoException)?.code === "ENOENT";
}
