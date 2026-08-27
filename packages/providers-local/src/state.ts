import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, renameSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

const DEFAULT_STATE_ROOT = join(".relkit", "state");

export interface LocalProviderStateRoot {
  readonly root: string;
  readonly buckets: string;
  readonly cache: string;
}

export class LocalProviderStateError extends Error {
  readonly code = "RELKIT_LOCAL_PROVIDER_STATE_INVALID" as const;

  constructor(message = "Local provider state root is invalid") {
    super(message);
    this.name = "LocalProviderStateError";
  }
}

/** Owns the capability directories used by one local provider generation. */
export function createLocalProviderStateRoot(requestedRoot?: string): LocalProviderStateRoot {
  if (requestedRoot !== undefined && requestedRoot.trim() === "") {
    throw new LocalProviderStateError("State root must not be empty");
  }
  const root = resolve(requestedRoot ?? join(process.cwd(), DEFAULT_STATE_ROOT));
  if (root === resolve("/")) throw new LocalProviderStateError("State root is too broad");
  ensureDirectory(root);
  const buckets = join(root, "buckets");
  const cache = join(root, "cache");
  ensureDirectory(buckets);
  ensureDirectory(cache);
  return Object.freeze({ root, buckets, cache });
}

/** Moves malformed provider state aside so a later startup can continue safely. */
export function quarantineStateFile(file: string, ownerRoot: string): string {
  const path = resolve(file);
  const root = resolve(ownerRoot);
  const relation = relative(root, path);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) {
    throw new LocalProviderStateError("State quarantine path escapes its owner");
  }
  const quarantine = join(root, ".relkit-quarantine");
  ensureDirectory(quarantine);
  const target = join(quarantine, `${basename(path)}.${randomUUID()}.bad`);
  try {
    renameSync(path, target);
  } catch {
    throw new LocalProviderStateError("Malformed provider state could not be quarantined");
  }
  return target;
}

export function ensureOwnedDirectory(path: string): string {
  const resolved = resolve(path);
  ensureDirectory(resolved);
  return resolved;
}

function ensureDirectory(path: string): void {
  try {
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new LocalProviderStateError("Provider state path is not a real directory");
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    try {
      mkdirSync(path, { recursive: true, mode: 0o700 });
    } catch {
      throw new LocalProviderStateError("Provider state directory could not be created");
    }
  }
}
