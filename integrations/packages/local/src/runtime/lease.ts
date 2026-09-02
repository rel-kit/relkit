import { randomUUID } from "node:crypto";
import { isStableId } from "@relkit/contracts";
import { localProjectLabels, type LocalProjectIdentity } from "./identity.js";
import {
  ensureLeaseDirectory,
  leasePaths,
  readLease,
  withLeaseLock,
  writeLease,
} from "./lease-files.js";
import {
  LOCAL_PROJECT_LEASE_VERSION,
  LocalProjectLeaseError,
  type AcquireLocalProjectLeaseOptions,
  type LocalProjectLease,
  type LocalProjectLeaseHandle,
  type LocalProjectLeaseStatus,
} from "./lease-types.js";
import { removeLocalStateFile } from "./state-paths.js";

export * from "./lease-types.js";

export function acquireLocalProjectLease(
  identity: LocalProjectIdentity,
  options: AcquireLocalProjectLeaseOptions,
): LocalProjectLeaseHandle {
  localProjectLabels(identity);
  validateOptions(options);
  const paths = leasePaths(identity);
  const alive = options.isProcessAlive ?? processAlive;
  ensureLeaseDirectory(identity);
  return withLeaseLock(identity, paths, alive, () => {
    const existing = readLease(identity);
    if (
      existing?.localProjectId !== undefined &&
      existing.localProjectId !== identity.localProjectId
    ) {
      throw new LocalProjectLeaseError("RELKIT_LOCAL_LEASE_INVALID", "Local lease is invalid.");
    }
    const status = statusFor(existing, options, alive);
    if (
      existing?.mode === "attached" &&
      existing.sessionId === options.sessionId &&
      existing.ownerPid === (options.pid ?? process.pid)
    ) {
      return handle(identity, paths, alive, existing, status);
    }
    const lease = Object.freeze({
      version: LOCAL_PROJECT_LEASE_VERSION,
      localProjectId: identity.localProjectId,
      mode: options.mode,
      sessionId: options.sessionId,
      generationId: randomUUID(),
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
      ...(options.mode === "attached" ? { ownerPid: options.pid ?? process.pid } : {}),
    }) satisfies LocalProjectLease;
    writeLease(identity, lease);
    const restore =
      existing?.mode === "detached" && options.mode === "attached" ? existing : undefined;
    return handle(identity, paths, alive, lease, status, restore);
  });
}

export function readLocalProjectLease(
  identity: LocalProjectIdentity,
): LocalProjectLease | undefined {
  localProjectLabels(identity);
  const lease = readLease(identity);
  if (lease !== undefined && lease.localProjectId !== identity.localProjectId) {
    throw new LocalProjectLeaseError("RELKIT_LOCAL_LEASE_INVALID", "Local lease is invalid.");
  }
  return lease;
}

function statusFor(
  existing: LocalProjectLease | undefined,
  options: AcquireLocalProjectLeaseOptions,
  alive: (pid: number) => boolean,
): LocalProjectLeaseStatus {
  if (existing === undefined) return "acquired";
  if (existing.mode === "detached") return "adopted";
  const pid = options.pid ?? process.pid;
  if (existing.sessionId === options.sessionId && existing.ownerPid === pid) return "acquired";
  if (alive(existing.ownerPid!)) {
    throw new LocalProjectLeaseError(
      "RELKIT_LOCAL_LEASE_HELD",
      `Local services are owned by live session "${existing.sessionId}" (pid ${existing.ownerPid}).`,
      existing,
    );
  }
  return "recovered";
}

function handle(
  identity: LocalProjectIdentity,
  paths: ReturnType<typeof leasePaths>,
  alive: (pid: number) => boolean,
  lease: LocalProjectLease,
  status: LocalProjectLeaseStatus,
  restore?: LocalProjectLease,
): LocalProjectLeaseHandle {
  return Object.freeze({
    lease,
    status,
    release: () => {
      if (lease.mode === "detached") return;
      withLeaseLock(identity, paths, alive, () => {
        if (readLease(identity)?.generationId !== lease.generationId) return;
        if (restore === undefined) removeLocalStateFile(identity, "lease.json");
        else writeLease(identity, restore);
      });
    },
  });
}

function validateOptions(options: AcquireLocalProjectLeaseOptions): void {
  const pid = options.pid ?? process.pid;
  if (
    (options.mode !== "attached" && options.mode !== "detached") ||
    !isStableId(options.sessionId) ||
    (options.mode === "attached" && (!Number.isSafeInteger(pid) || pid < 1))
  ) {
    throw new LocalProjectLeaseError("RELKIT_LOCAL_LEASE_INVALID", "Local lease is invalid.");
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
