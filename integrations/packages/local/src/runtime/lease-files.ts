import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isStableId } from "@relkit/contracts";
import type { LocalProjectIdentity } from "./identity.js";
import {
  LOCAL_PROJECT_LEASE_VERSION,
  LocalProjectLeaseError,
  type LocalProjectLease,
} from "./lease-types.js";
import {
  ensureLocalStateDirectory,
  localStateDirectory,
  readLocalStateText,
  writeLocalStateText,
} from "./state-paths.js";

export interface LeasePaths {
  readonly directory: string;
  readonly lock: string;
}

export function leasePaths(identity: LocalProjectIdentity): LeasePaths {
  const directory = localStateDirectory(identity);
  return { directory, lock: join(directory, ".lease-lock") };
}

export function ensureLeaseDirectory(identity: LocalProjectIdentity): void {
  ensureLocalStateDirectory(identity);
}

export function readLease(identity: LocalProjectIdentity): LocalProjectLease | undefined {
  const source = readLocalStateText(identity, "lease.json");
  if (source === undefined) return undefined;
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    if (
      value.version !== LOCAL_PROJECT_LEASE_VERSION ||
      !hash(value.localProjectId) ||
      (value.mode !== "attached" && value.mode !== "detached") ||
      !isStableId(value.sessionId) ||
      !isStableId(value.generationId) ||
      typeof value.createdAt !== "string" ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      (value.mode === "attached" && !pid(value.ownerPid)) ||
      (value.mode === "detached" && value.ownerPid !== undefined)
    ) {
      invalid();
    }
    return Object.freeze(value as unknown as LocalProjectLease);
  } catch (error) {
    if (error instanceof LocalProjectLeaseError) throw error;
    return invalid();
  }
}

export function writeLease(identity: LocalProjectIdentity, lease: LocalProjectLease): void {
  writeLocalStateText(identity, "lease.json", `${JSON.stringify(lease)}\n`);
}

export function withLeaseLock<Value>(
  identity: LocalProjectIdentity,
  paths: LeasePaths,
  isProcessAlive: (pid: number) => boolean,
  operation: () => Value,
): Value {
  ensureLocalStateDirectory(identity);
  acquireLock(paths, isProcessAlive);
  try {
    return operation();
  } finally {
    rmSync(paths.lock, { force: true, recursive: true });
  }
}

function acquireLock(paths: LeasePaths, isProcessAlive: (pid: number) => boolean): void {
  try {
    mkdirSync(paths.lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const lock = lstatSync(paths.lock);
    if (!lock.isDirectory() || lock.isSymbolicLink()) invalid();
    const ownerPath = join(paths.lock, "owner");
    const owner = Number(read(ownerPath));
    const old = Date.now() - statSync(paths.lock).mtimeMs > 30_000;
    if ((!pid(owner) || !isProcessAlive(owner)) && old) {
      rmSync(paths.lock, { force: true, recursive: true });
      return acquireLock(paths, isProcessAlive);
    }
    throw new LocalProjectLeaseError("RELKIT_LOCAL_LEASE_BUSY", "Local lease is busy.");
  }
  writeFileSync(join(paths.lock, "owner"), String(process.pid), { flag: "wx", mode: 0o600 });
}

function read(path: string): string {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return "";
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function pid(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function invalid(): never {
  throw new LocalProjectLeaseError("RELKIT_LOCAL_LEASE_INVALID", "Local lease is invalid.");
}
